import * as THREE from 'three/webgpu';
import { computeDynoTelemetry, CYLINDER_DEFS, V12_SPEC } from './constants';
import type { V12AssemblyHandles } from './v12Geometry';
import type { V12MaterialLibrary } from './materials';
import type { TelemetryData } from '../types/engine';

export interface KinematicState {
  crankAngleRad: number; // monotonically advances (wraps mod 4*PI for 720-deg 4-stroke)
  currentRpm: number;
  currentExplode: number;
  thermalLoad: number; // 0..1 normalized exhaust header heat accumulation
}

const TWO_PI = Math.PI * 2;
const FOUR_PI = Math.PI * 4;
const DEG_TO_RAD = Math.PI / 180;

// Pre-allocated scratch variables to guarantee zero GC allocations in the render loop
const _tmpFlameColor = new THREE.Color();

export class V12KinematicsSolver {
  public state: KinematicState = {
    crankAngleRad: 0,
    currentRpm: V12_SPEC.IDLE_RPM,
    currentExplode: 0,
    thermalLoad: 0.08,
  };

  private handles: V12AssemblyHandles;
  private materials: V12MaterialLibrary;
  private lastFiringCylinder = 1;

  constructor(handles: V12AssemblyHandles, materials: V12MaterialLibrary) {
    this.handles = handles;
    this.materials = materials;
  }

  /**
   * Advances all V12 mechanical kinematics, 4-stroke valvetrain lifts, combustion flashes,
   * exhaust thermal glow, and damped exploded-view assembly transforms.
   */
  public update(
    dt: number,
    targetRpm: number,
    isRunning: boolean,
    timeScale: number,
    targetExplode: number
  ): TelemetryData {
    const safeDt = Math.min(dt, 0.05);

    // 1. Exponentially damp RPM for physical flywheel inertia feel
    const desiredRpm = isRunning ? targetRpm : 0;
    this.state.currentRpm = THREE.MathUtils.damp(
      this.state.currentRpm,
      desiredRpm,
      isRunning ? 4.8 : 2.6,
      safeDt
    );
    if (!isRunning && this.state.currentRpm < 4) {
      this.state.currentRpm = 0;
    }

    // 2. Advance crankshaft angle (visual speed scaled smoothly so 9500 RPM looks crisp & dramatic)
    // At timeScale = 1, visual angular rate is calibrated so individual strokes remain legible at idle
    // and blur smoothly into high-energy motion at redline (exact 4-stroke ratios always preserved!)
    const visualRps = (this.state.currentRpm / 60) * 0.24 * timeScale;
    this.state.crankAngleRad = (this.state.crankAngleRad + visualRps * TWO_PI * safeDt) % FOUR_PI;

    const crankRad = this.state.crankAngleRad;
    const cycleDeg = ((crankRad / FOUR_PI) * 720 + 720) % 720;

    // 3. Rotate crankshaft, front harmonic damper, rear flywheel, and accessory pulleys
    this.handles.crankshaftGroup.rotation.z = -crankRad;
    this.handles.frontDamperGroup.rotation.z = -crankRad;
    this.handles.flywheelGroup.rotation.z = -crankRad;

    const pulleys = this.handles.accessoryPulleys;
    if (pulleys.length >= 3) {
      pulleys[0].rotation.z = -crankRad * 1.45;
      pulleys[1].rotation.z = -crankRad * 2.1;
      pulleys[2].rotation.z = -crankRad * 1.8;
    }

    // 4. Rotate all 4 DOHC camshafts at exact 0.5x crankshaft ratio
    const camRad = crankRad * 0.5;
    for (let i = 0; i < this.handles.camshafts.length; i++) {
      this.handles.camshafts[i].rotation.z = -camRad;
    }

    // 5. Exact slider-crank kinematics for all 12 Pistons, Connecting Rods & Combustion Chambers
    const r = V12_SPEC.CRANK_RADIUS;
    const L = V12_SPEC.ROD_LENGTH;
    const L2 = L * L;
    const crankY = V12_SPEC.CRANK_Y;
    const bankAng = V12_SPEC.BANK_ANGLE_RAD;

    let strongestFireIntensity = 0;

    for (let i = 0; i < this.handles.pistonRods.length; i++) {
      const pr = this.handles.pistonRods[i];
      const cyl = CYLINDER_DEFS[pr.cylinderIndex];

      const beta = cyl.bankSign * bankAng;
      const sinB = Math.sin(beta);
      const cosB = Math.cos(beta);

      const gamma = crankRad + cyl.throwAngleDeg * DEG_TO_RAD;
      const pinX = r * Math.sin(gamma);
      const pinY = crankY + r * Math.cos(gamma);

      const phi = gamma - beta;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const s = r * cosPhi + Math.sqrt(Math.max(0.0001, L2 - r * r * sinPhi * sinPhi));

      const wristX = s * sinB;
      const wristY = crankY + s * cosB;

      pr.pistonGroup.position.set(wristX, wristY, cyl.zPos);

      // Connecting rod anchored at exact crankpin, aligned identically to wrist pin
      pr.rodGroup.position.set(pinX, pinY, cyl.zPos);
      pr.rodGroup.rotation.z = Math.atan2(-(wristX - pinX), wristY - pinY);

      // 4-Stroke phase relative to this cylinder's TDC Power/Ignition event (0..720 deg)
      const relDeg = (cycleDeg - cyl.firingAngleDeg + 720) % 720;

      // Combustion flash peaks immediately after ignition (0..78 deg ATDC power stroke)
      let flash = 0;
      if (this.state.currentRpm > 40 && relDeg < 88) {
        if (relDeg < 14) {
          // Sharp blue-white spark ignition rise
          flash = relDeg / 14;
          _tmpFlameColor.setRGB(0.85, 0.92, 1.0).lerp(new THREE.Color(0xff9a33), flash * 0.7);
        } else {
          // Incandescent orange-amber expansion decay
          const decay = 1 - (relDeg - 14) / 74;
          flash = decay * decay;
          _tmpFlameColor.setRGB(1.0, 0.35 + decay * 0.45, 0.05 + decay * 0.12);
        }
        if (flash > strongestFireIntensity) {
          strongestFireIntensity = flash;
          this.lastFiringCylinder = cyl.cylinderNumber;
        }
      }

      const flameMat = this.materials.combustionMaterials[i];
      flameMat.opacity = flash * 0.92;
      flameMat.color.copy(_tmpFlameColor);
      const scalePulse = 0.72 + flash * 0.34;
      pr.combustionMesh.scale.set(scalePulse, 0.55 + flash * 0.65, scalePulse);
    }

    // 6. Synchronize all 48 Valves & Spring Compressions to exact Intake/Exhaust lobes
    // Exhaust stroke: relDeg in [170..375], Intake stroke: relDeg in [350..565]
    const maxLift = V12_SPEC.VALVE_MAX_LIFT;
    for (let i = 0; i < this.handles.valves.length; i++) {
      const vh = this.handles.valves[i];
      const cyl = CYLINDER_DEFS[vh.cylinderIndex];
      const relDeg = (cycleDeg - cyl.firingAngleDeg + 720) % 720;

      let liftNorm = 0;
      if (vh.isIntake) {
        if (relDeg >= 355 && relDeg <= 565) {
          const u = (relDeg - 355) / 210;
          liftNorm = Math.pow(Math.sin(u * Math.PI), 1.45);
        }
      } else {
        if (relDeg >= 165 && relDeg <= 375) {
          const u = (relDeg - 165) / 210;
          liftNorm = Math.pow(Math.sin(u * Math.PI), 1.45);
        }
      }

      const liftMeters = liftNorm * maxLift;
      vh.valveMesh.position.y = vh.baseY - liftMeters;
      vh.springMesh.scale.y = 1 - liftNorm * 0.32;
    }

    // 7. Articulate 12 Individual Throttle Body (ITB) butterfly valves based on load/RPM
    const throttleNorm = THREE.MathUtils.clamp(
      (this.state.currentRpm - 700) / (V12_SPEC.MAX_RPM - 700),
      0.04,
      1.0
    );
    const butterflyAngle = throttleNorm * (Math.PI * 0.48); // closed flat -> open vertical
    for (let i = 0; i < this.handles.throttlePlates.length; i++) {
      this.handles.throttlePlates[i].rotation.x = butterflyAngle;
    }

    // 8. Exhaust header thermal inertia & incandescent blackbody glow above ~5,000 RPM
    const targetHeat =
      this.state.currentRpm > 4200
        ? THREE.MathUtils.clamp((this.state.currentRpm - 4200) / 5300, 0, 1)
        : 0;
    const heatRate = targetHeat > this.state.thermalLoad ? 0.55 : 0.35;
    this.state.thermalLoad = THREE.MathUtils.damp(
      this.state.thermalLoad,
      targetHeat,
      heatRate,
      safeDt
    );
    this.materials.setExhaustThermalGlow(this.state.thermalLoad);

    // 9. Smoothly damped exploded-view assembly separation
    this.state.currentExplode = THREE.MathUtils.damp(
      this.state.currentExplode,
      targetExplode,
      6.5,
      safeDt
    );
    const exp = this.state.currentExplode;
    for (let i = 0; i < this.handles.explodables.length; i++) {
      const item = this.handles.explodables[i];
      item.object.position.set(
        item.basePos.x + item.explodeOffset.x * exp,
        item.basePos.y + item.explodeOffset.y * exp,
        item.basePos.z + item.explodeOffset.z * exp
      );
    }

    // 10. Compute live engineering telemetry
    const dyno = computeDynoTelemetry(this.state.currentRpm);
    const exhaustTempC = Math.round(
      240 + (this.state.currentRpm / V12_SPEC.MAX_RPM) * 420 + this.state.thermalLoad * 265
    );

    return {
      rpm: Math.round(this.state.currentRpm),
      horsepower: dyno.horsepower,
      torqueNm: dyno.torqueNm,
      firingCylinder: this.lastFiringCylinder,
      exhaustTempC: this.state.currentRpm > 20 ? exhaustTempC : 28,
      throttlePct: dyno.throttlePct,
      crankDeg: Math.round(cycleDeg),
    };
  }
}
