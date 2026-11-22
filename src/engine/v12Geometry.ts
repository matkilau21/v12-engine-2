import * as THREE from 'three/webgpu';
import { CRANK_THROW_ANGLES_DEG, CYLINDER_DEFS, V12_SPEC } from './constants';
import type { V12MaterialLibrary } from './materials';

export interface ExplodablePart {
  object: THREE.Object3D;
  basePos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
}

export interface PistonRodHandle {
  cylinderIndex: number; // index into CYLINDER_DEFS (0..11)
  pistonGroup: THREE.Group;
  rodGroup: THREE.Group;
  combustionMesh: THREE.Mesh;
}

export interface ValveHandle {
  cylinderIndex: number;
  isIntake: boolean;
  valveMesh: THREE.Group;
  springMesh: THREE.Mesh;
  baseY: number;
}

export interface V12AssemblyHandles {
  root: THREE.Group;
  crankshaftGroup: THREE.Group;
  flywheelGroup: THREE.Group;
  frontDamperGroup: THREE.Group;
  camshafts: THREE.Group[]; // [BankA Intake, BankA Exhaust, BankB Intake, BankB Exhaust]
  accessoryPulleys: THREE.Object3D[];
  pistonRods: PistonRodHandle[];
  valves: ValveHandle[];
  throttlePlates: THREE.Object3D[];
  explodables: ExplodablePart[];
  dispose: () => void;
}

function tagInspectable(obj: THREE.Object3D, partId: string) {
  obj.traverse((child) => {
    child.userData.partId = partId;
    if (child instanceof THREE.Mesh) {
      child.layers.enable(1); // Dedicated raycasting layer
    }
  });
}

function createCounterweightGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  // Sculpted tear-drop crankshaft counterweight web
  shape.moveTo(-0.024, 0.015);
  shape.quadraticCurveTo(0, 0.045, 0.024, 0.015);
  shape.lineTo(0.056, -0.028);
  shape.absarc(0, -0.022, 0.062, -0.1, Math.PI + 0.1, true);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.015,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.0025,
    bevelThickness: 0.0025,
  });
  geo.center();
  return geo;
}

function createCamLobeGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const baseR = 0.0135;
  const noseLift = 0.0095;
  shape.absarc(0, 0, baseR, 0, Math.PI, true);
  shape.quadraticCurveTo(-baseR * 0.9, baseR + noseLift * 0.85, 0, baseR + noseLift);
  shape.quadraticCurveTo(baseR * 0.9, baseR + noseLift * 0.85, baseR, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.011,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.001,
    bevelThickness: 0.001,
  });
  geo.translate(0, 0, -0.0055);
  return geo;
}

function createConRodShankGeometry(length: number): THREE.ExtrudeGeometry {
  // Tapered H-beam profile along Y from 0 to length
  const shape = new THREE.Shape();
  const wBot = 0.015;
  const wTop = 0.0095;
  shape.moveTo(-wBot, 0.022);
  shape.lineTo(wBot, 0.022);
  shape.lineTo(wTop, length - 0.015);
  shape.lineTo(-wTop, length - 0.015);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.014,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.0016,
    bevelThickness: 0.0016,
  });
  geo.translate(0, 0, -0.007);
  return geo;
}

function createGearGeometry(radius: number, teeth: number, thickness: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const innerR = radius * 0.9;
  const outerR = radius;
  const step = (Math.PI * 2) / teeth;

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.25;
    const a2 = a0 + step * 0.45;
    const a3 = a0 + step * 0.7;
    if (i === 0) {
      shape.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    } else {
      shape.lineTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
    }
    shape.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    shape.lineTo(Math.cos(a3) * innerR, Math.sin(a3) * innerR);
  }
  shape.closePath();

  // Weight reduction central bore
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.34, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 1,
    steps: 1,
    bevelSize: 0.0012,
    bevelThickness: 0.0012,
  });
  geo.translate(0, 0, -thickness * 0.5);
  return geo;
}

/**
 * Builds the complete high-detail procedural 6.5L 60-degree V12 engine.
 */
export function buildV12Engine(
  materials: V12MaterialLibrary,
  castShadows: boolean
): V12AssemblyHandles {
  const root = new THREE.Group();
  root.name = 'ValkyrV12Root';

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T): T => {
    geometriesToDispose.push(g);
    return g;
  };

  const explodables: ExplodablePart[] = [];
  const registerExplodable = (object: THREE.Object3D, offset: [number, number, number]) => {
    explodables.push({
      object,
      basePos: object.position.clone(),
      explodeOffset: new THREE.Vector3(offset[0], offset[1], offset[2]),
    });
  };

  const enableShadow = (obj: THREE.Object3D) => {
    if (!castShadows) return;
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
  };

  const CRANK_Y = V12_SPEC.CRANK_Y;
  const PITCH = V12_SPEC.CYLINDER_PITCH;
  const BANK_ANG = V12_SPEC.BANK_ANGLE_RAD;
  const HALF_SPAN = 2.5 * PITCH; // +/- 0.28m -> total 6-cyl bank length ~0.68m
  const BLOCK_LEN = 0.72;

  // Shared fastener geometry for instanced titanium hex bolts
  const boltGeo = track(new THREE.CylinderGeometry(0.0055, 0.0055, 0.011, 6));
  const boltMatrices: THREE.Matrix4[] = [];
  const tmpMat = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3(1, 1, 1);

  const pushBolt = (x: number, y: number, z: number, euler?: THREE.Euler) => {
    tmpPos.set(x, y, z);
    if (euler) tmpQuat.setFromEuler(euler);
    else tmpQuat.identity();
    tmpMat.compose(tmpPos, tmpQuat, tmpScale);
    boltMatrices.push(tmpMat.clone());
  };

  // =========================================================================
  // 1. DRY-SUMP OIL PAN & LOWER BEDPLATE
  // =========================================================================
  const sumpGroup = new THREE.Group();
  sumpGroup.name = 'OilSump';
  sumpGroup.position.set(0, CRANK_Y - 0.115, 0);

  const sumpBody = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.27, 0.068, BLOCK_LEN + 0.02)),
    materials.sumpCast
  );
  sumpGroup.add(sumpBody);

  // Lower tapered dry-sump scavenge trough
  const trough = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.18, 0.042, BLOCK_LEN - 0.08)),
    materials.sumpCast
  );
  trough.position.set(0, -0.048, -0.02);
  sumpGroup.add(trough);

  // External cooling fins along bottom of sump
  const finGeo = track(new THREE.BoxGeometry(0.008, 0.016, BLOCK_LEN - 0.12));
  for (let i = -4; i <= 4; i++) {
    const fin = new THREE.Mesh(finGeo, materials.sumpCast);
    fin.position.set(i * 0.02, -0.072, -0.02);
    sumpGroup.add(fin);
  }

  // Billet oil scavenge manifold ports on right side
  const scavengeGeo = track(new THREE.CylinderGeometry(0.014, 0.014, 0.04, 16));
  scavengeGeo.rotateZ(Math.PI / 2);
  for (let i = -1; i <= 1; i++) {
    const port = new THREE.Mesh(scavengeGeo, materials.billetMachined);
    port.position.set(0.145, -0.015, i * 0.16);
    sumpGroup.add(port);
  }

  // Perimeter flange
  const sumpFlange = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.31, 0.014, BLOCK_LEN + 0.05)),
    materials.billetMachined
  );
  sumpFlange.position.set(0, 0.036, 0);
  sumpGroup.add(sumpFlange);

  tagInspectable(sumpGroup, 'block');
  enableShadow(sumpGroup);
  root.add(sumpGroup);
  registerExplodable(sumpGroup, [0, -0.18, 0]);

  // =========================================================================
  // 2. 6-THROW 120-DEGREE BILLET CRANKSHAFT
  // =========================================================================
  const crankshaftGroup = new THREE.Group();
  crankshaftGroup.name = 'Crankshaft';
  crankshaftGroup.position.set(0, CRANK_Y, 0);

  const mainJournalGeo = track(new THREE.CylinderGeometry(0.034, 0.034, 0.034, 28));
  mainJournalGeo.rotateX(Math.PI / 2);
  const pinJournalGeo = track(new THREE.CylinderGeometry(0.026, 0.026, 0.054, 24));
  pinJournalGeo.rotateX(Math.PI / 2);
  const cwGeo = track(createCounterweightGeometry());

  // 7 main bearing journals
  for (let m = 0; m < 7; m++) {
    const mz = HALF_SPAN + PITCH * 0.5 - m * PITCH;
    const journal = new THREE.Mesh(mainJournalGeo, materials.crankSteel);
    journal.position.set(0, 0, mz);
    crankshaftGroup.add(journal);
  }

  // 6 throws with paired counterweights at exact 0, 120, 240, 240, 120, 0 deg
  for (let i = 0; i < 6; i++) {
    const zCenter = HALF_SPAN - i * PITCH;
    const throwRad = (CRANK_THROW_ANGLES_DEG[i] * Math.PI) / 180;
    const throwSub = new THREE.Group();
    throwSub.position.set(0, 0, zCenter);
    throwSub.rotation.z = -throwRad; // clockwise looking from front

    // Crankpin offset by +CRANK_RADIUS along local +Y
    const pin = new THREE.Mesh(pinJournalGeo, materials.crankSteel);
    pin.position.set(0, V12_SPEC.CRANK_RADIUS, 0);
    throwSub.add(pin);

    // Pair of sculpted counterweights flanking the crankpin
    const cwFront = new THREE.Mesh(cwGeo, materials.crankSteel);
    cwFront.position.set(0, 0.008, 0.034);
    throwSub.add(cwFront);

    const cwRear = new THREE.Mesh(cwGeo, materials.crankSteel);
    cwRear.position.set(0, 0.008, -0.034);
    throwSub.add(cwRear);

    crankshaftGroup.add(throwSub);
  }

  // Front crankshaft nose & rear flywheel stub
  const snout = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.025, 0.028, 0.11, 24)).rotateX(Math.PI / 2),
    materials.crankSteel
  );
  snout.position.set(0, 0, HALF_SPAN + PITCH * 0.5 + 0.055);
  crankshaftGroup.add(snout);

  const rearStub = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 24)).rotateX(Math.PI / 2),
    materials.crankSteel
  );
  rearStub.position.set(0, 0, -(HALF_SPAN + PITCH * 0.5 + 0.03));
  crankshaftGroup.add(rearStub);

  tagInspectable(crankshaftGroup, 'crankshaft');
  enableShadow(crankshaftGroup);
  root.add(crankshaftGroup);

  // =========================================================================
  // 3. 12 FORGED PISTONS, TITANIUM H-BEAM CON-RODS & COMBUSTION CHAMBERS
  // =========================================================================
  const rotatingRecipGroup = new THREE.Group();
  rotatingRecipGroup.name = 'PistonsAndRods';
  root.add(rotatingRecipGroup);

  const pistonCrownGeo = track(
    new THREE.CylinderGeometry(V12_SPEC.BORE_RADIUS * 0.96, V12_SPEC.BORE_RADIUS * 0.96, 0.028, 28)
  );
  const pistonSkirtGeo = track(
    new THREE.CylinderGeometry(
      V12_SPEC.BORE_RADIUS * 0.94,
      V12_SPEC.BORE_RADIUS * 0.92,
      0.03,
      24,
      1,
      false,
      -Math.PI * 0.35,
      Math.PI * 0.7
    )
  );
  const ringGeo = track(new THREE.TorusGeometry(V12_SPEC.BORE_RADIUS * 0.965, 0.0018, 8, 28));
  ringGeo.rotateX(Math.PI / 2);
  const wristPinGeo = track(new THREE.CylinderGeometry(0.011, 0.011, 0.072, 16));
  wristPinGeo.rotateX(Math.PI / 2);

  const bigEndGeo = track(new THREE.TorusGeometry(0.029, 0.0095, 14, 24));
  const smallEndGeo = track(new THREE.TorusGeometry(0.014, 0.0055, 12, 20));
  const shankGeo = track(createConRodShankGeometry(V12_SPEC.ROD_LENGTH));
  const rodBoltGeo = track(new THREE.CylinderGeometry(0.0038, 0.0038, 0.026, 8));
  const flameGeo = track(new THREE.SphereGeometry(V12_SPEC.BORE_RADIUS * 0.88, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.65));

  const pistonRods: PistonRodHandle[] = [];

  CYLINDER_DEFS.forEach((cyl, idx) => {
    // Piston assembly (origin at wrist pin center)
    const pistonGroup = new THREE.Group();
    const crown = new THREE.Mesh(pistonCrownGeo, materials.pistonAlloy);
    crown.position.y = 0.022;
    pistonGroup.add(crown);

    // 3 piston rings
    for (let r = 0; r < 3; r++) {
      const ring = new THREE.Mesh(ringGeo, materials.pistonRing);
      ring.position.y = 0.031 - r * 0.0055;
      pistonGroup.add(ring);
    }

    // Twin scalloped skirts
    const skirtL = new THREE.Mesh(pistonSkirtGeo, materials.pistonAlloy);
    skirtL.position.y = -0.003;
    pistonGroup.add(skirtL);
    const skirtR = new THREE.Mesh(pistonSkirtGeo, materials.pistonAlloy);
    skirtR.position.y = -0.003;
    skirtR.rotation.y = Math.PI;
    pistonGroup.add(skirtR);

    const wristPin = new THREE.Mesh(wristPinGeo, materials.crankSteel);
    pistonGroup.add(wristPin);

    // Rotate piston to align with its bank axis (+/- 30 deg)
    pistonGroup.rotation.z = -cyl.bankSign * BANK_ANG;
    tagInspectable(pistonGroup, 'pistons');
    enableShadow(pistonGroup);
    rotatingRecipGroup.add(pistonGroup);

    // Connecting rod assembly (origin at crankpin center, extends +Y by ROD_LENGTH to wrist pin)
    const rodGroup = new THREE.Group();
    const bigEnd = new THREE.Mesh(bigEndGeo, materials.titaniumRod);
    rodGroup.add(bigEnd);

    const shank = new THREE.Mesh(shankGeo, materials.titaniumRod);
    rodGroup.add(shank);

    const smallEnd = new THREE.Mesh(smallEndGeo, materials.titaniumRod);
    smallEnd.position.y = V12_SPEC.ROD_LENGTH;
    rodGroup.add(smallEnd);

    // Big-end cap bolts
    for (const side of [-1, 1]) {
      const bolt = new THREE.Mesh(rodBoltGeo, materials.fastenerTi);
      bolt.position.set(side * 0.035, -0.002, 0);
      rodGroup.add(bolt);
    }

    tagInspectable(rodGroup, 'pistons');
    enableShadow(rodGroup);
    rotatingRecipGroup.add(rodGroup);

    // Volumetric combustion chamber flame dome positioned right below deck height
    const combustionMesh = new THREE.Mesh(flameGeo, materials.combustionMaterials[idx]);
    const dirX = Math.sin(cyl.bankSign * BANK_ANG);
    const dirY = Math.cos(cyl.bankSign * BANK_ANG);
    const flameDist = V12_SPEC.DECK_HEIGHT - 0.018;
    combustionMesh.position.set(dirX * flameDist, CRANK_Y + dirY * flameDist, cyl.zPos);
    combustionMesh.rotation.z = -cyl.bankSign * BANK_ANG + Math.PI;
    combustionMesh.renderOrder = 4;
    root.add(combustionMesh);

    pistonRods.push({
      cylinderIndex: idx,
      pistonGroup,
      rodGroup,
      combustionMesh,
    });
  });

  // =========================================================================
  // 4. 60-DEGREE DEEP-SKIRT ENGINE BLOCK & HONED CYLINDER SLEEVES
  // =========================================================================
  const blockMainGroup = new THREE.Group();
  blockMainGroup.name = 'EngineBlock';

  // Lower crankcase skirt saddle
  const crankcaseSaddle = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.285, 0.145, BLOCK_LEN)),
    materials.blockSolid
  );
  crankcaseSaddle.position.set(0, CRANK_Y - 0.005, 0);
  blockMainGroup.add(crankcaseSaddle);

  // External horizontal stiffening ribs on crankcase sides
  const sideRibGeo = track(new THREE.BoxGeometry(0.016, 0.012, BLOCK_LEN - 0.04));
  for (const side of [-1, 1]) {
    for (let r = 0; r < 3; r++) {
      const rib = new THREE.Mesh(sideRibGeo, side === 1 ? materials.blockCutawayBankA : materials.blockSolid);
      rib.position.set(side * 0.148, CRANK_Y - 0.04 + r * 0.034, 0);
      blockMainGroup.add(rib);
    }
  }

  // Cylinder bank castings (Bank A uses blockCutawayBankA so Cutaway mode reveals moving internals)
  const bankCastingGeo = track(new THREE.BoxGeometry(0.142, 0.168, BLOCK_LEN));
  const sleeveGeo = track(
    new THREE.CylinderGeometry(
      V12_SPEC.BORE_RADIUS + 0.006,
      V12_SPEC.BORE_RADIUS + 0.006,
      0.162,
      28,
      1,
      true
    )
  );
  const freezePlugGeo = track(new THREE.CylinderGeometry(0.017, 0.017, 0.006, 20));
  freezePlugGeo.rotateZ(Math.PI / 2);

  for (const bankSign of [1, -1] as const) {
    const bankGroup = new THREE.Group();
    const mat = bankSign === 1 ? materials.blockCutawayBankA : materials.blockSolid;
    const bankAngle = bankSign * BANK_ANG;
    const midDist = 0.156;

    const casing = new THREE.Mesh(bankCastingGeo, mat);
    casing.position.set(
      Math.sin(bankAngle) * midDist,
      CRANK_Y + Math.cos(bankAngle) * midDist,
      0
    );
    casing.rotation.z = -bankAngle;
    bankGroup.add(casing);

    // Honed sleeves & brass freeze plugs along each bank
    for (let i = 0; i < 6; i++) {
      const z = HALF_SPAN - i * PITCH + bankSign * V12_SPEC.BANK_Z_OFFSET * 0.5;
      const sleeve = new THREE.Mesh(sleeveGeo, mat);
      sleeve.position.set(
        Math.sin(bankAngle) * (midDist + 0.004),
        CRANK_Y + Math.cos(bankAngle) * (midDist + 0.004),
        z
      );
      sleeve.rotation.z = -bankAngle;
      bankGroup.add(sleeve);

      // External brass core freeze plugs on outboard block wall
      if (i < 5) {
        const plug = new THREE.Mesh(freezePlugGeo, materials.bronzeGuide);
        plug.position.set(
          Math.sin(bankAngle) * midDist + bankSign * 0.064,
          CRANK_Y + Math.cos(bankAngle) * midDist - 0.036,
          z - PITCH * 0.5
        );
        plug.rotation.z = -bankAngle;
        bankGroup.add(plug);
      }
    }

    tagInspectable(bankGroup, 'block');
    enableShadow(bankGroup);
    blockMainGroup.add(bankGroup);
  }

  tagInspectable(blockMainGroup, 'block');
  enableShadow(blockMainGroup);
  root.add(blockMainGroup);

  // =========================================================================
  // 5. DUAL CYLINDER HEADS, 4 DOHC CAMSHAFTS (48 LOBES) & 48 VALVES + SPRINGS
  // =========================================================================
  const camshafts: THREE.Group[] = [];
  const valves: ValveHandle[] = [];

  const camShaftRodGeo = track(new THREE.CylinderGeometry(0.011, 0.011, BLOCK_LEN + 0.04, 18));
  camShaftRodGeo.rotateX(Math.PI / 2);
  const camLobeGeo = track(createCamLobeGeometry());
  const camGearGeo = track(createGearGeometry(0.044, 34, 0.014));
  const valveStemGeo = track(new THREE.CylinderGeometry(0.0026, 0.0026, 0.068, 10));
  const valveHeadGeo = track(new THREE.CylinderGeometry(0.0145, 0.0035, 0.006, 16));
  const valveRetainerGeo = track(new THREE.CylinderGeometry(0.0105, 0.0105, 0.005, 14));
  const valveSpringGeo = track(new THREE.CylinderGeometry(0.0115, 0.0115, 0.034, 14, 5, true));
  const coilPackGeo = track(new THREE.BoxGeometry(0.032, 0.034, 0.032));

  for (const bankSign of [1, -1] as const) {
    const bankAngle = bankSign * BANK_ANG;
    const sinA = Math.sin(bankAngle);
    const cosA = Math.cos(bankAngle);

    // Cylinder head assembly aligned in bank-local space
    const headBaseDist = V12_SPEC.DECK_HEIGHT + 0.038;
    const headGroup = new THREE.Group();
    headGroup.position.set(sinA * headBaseDist, CRANK_Y + cosA * headBaseDist, 0);
    headGroup.rotation.z = -bankAngle;

    const headMat = bankSign === 1 ? materials.cylinderHeadBankA : materials.cylinderHead;
    const headBody = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.172, 0.076, BLOCK_LEN + 0.01)),
      headMat
    );
    headGroup.add(headBody);

    // Cam carrier rails inside head
    const carrierGeo = track(new THREE.BoxGeometry(0.026, 0.028, BLOCK_LEN - 0.02));
    for (const side of [-1, 1]) {
      const carrier = new THREE.Mesh(carrierGeo, materials.billetMachined);
      carrier.position.set(side * 0.056, 0.048, 0);
      headGroup.add(carrier);
    }

    // 48 valves (24 per bank: 2 intake + 2 exhaust per cylinder)
    const bankCyls = CYLINDER_DEFS.map((c, idx) => ({ c, idx })).filter(
      (item) => item.c.bankSign === bankSign
    );

    // Intake cam is inboard (towards V-valley, x = -bankSign * 0.044)
    // Exhaust cam is outboard (towards headers, x = +bankSign * 0.044)
    const intakeLocalX = -bankSign * 0.042;
    const exhaustLocalX = bankSign * 0.042;

    const createCamshaft = (localX: number, isIntake: boolean): THREE.Group => {
      const cam = new THREE.Group();
      cam.position.set(localX, 0.078, 0);

      const rod = new THREE.Mesh(camShaftRodGeo, materials.crankSteel);
      cam.add(rod);

      // Front toothed cam gear sprocket
      const gear = new THREE.Mesh(camGearGeo, materials.billetMachined);
      gear.position.set(0, 0, BLOCK_LEN * 0.5 + 0.028);
      cam.add(gear);

      // Add 12 cam lobes phased to each cylinder's intake or exhaust event
      for (const { c } of bankCyls) {
        const eventAngleDeg = isIntake ? c.firingAngleDeg + 360 + 90 : c.firingAngleDeg + 180 + 90;
        const lobePhaseRad = ((eventAngleDeg * 0.5) * Math.PI) / 180;
        for (const pairOff of [-0.02, 0.02]) {
          const lobe = new THREE.Mesh(camLobeGeo, materials.crankSteel);
          lobe.position.set(0, 0, c.zPos + pairOff);
          lobe.rotation.z = -lobePhaseRad + Math.PI; // nose points down toward valve when firing event aligns
          cam.add(lobe);
        }
      }

      headGroup.add(cam);
      return cam;
    };

    const intakeCam = createCamshaft(intakeLocalX, true);
    const exhaustCam = createCamshaft(exhaustLocalX, false);
    camshafts.push(intakeCam, exhaustCam);

    // Build 24 valves + springs for this bank
    for (const { c, idx } of bankCyls) {
      const buildValvePair = (localX: number, isIntake: boolean) => {
        const tilt = (isIntake ? bankSign : -bankSign) * 0.16;
        for (const zOff of [-0.019, 0.019]) {
          const valvePivot = new THREE.Group();
          const baseY = 0.024;
          valvePivot.position.set(localX * 0.84, baseY, c.zPos + zOff);
          valvePivot.rotation.z = tilt;

          const stem = new THREE.Mesh(valveStemGeo, materials.billetMachined);
          valvePivot.add(stem);

          const head = new THREE.Mesh(valveHeadGeo, materials.bronzeGuide);
          head.position.y = -0.035;
          valvePivot.add(head);

          const retainer = new THREE.Mesh(valveRetainerGeo, materials.fastenerTi);
          retainer.position.y = 0.029;
          valvePivot.add(retainer);

          headGroup.add(valvePivot);

          // Valve spring anchored to head deck (scales along Y as valve depresses)
          const springMesh = new THREE.Mesh(valveSpringGeo, materials.crankSteel);
          springMesh.position.set(localX * 0.84, baseY + 0.012, c.zPos + zOff);
          springMesh.rotation.z = tilt;
          headGroup.add(springMesh);

          valves.push({
            cylinderIndex: idx,
            isIntake,
            valveMesh: valvePivot,
            springMesh,
            baseY,
          });
        }
      };

      buildValvePair(intakeLocalX, true);
      buildValvePair(exhaustLocalX, false);
    }

    tagInspectable(headGroup, 'valvetrain');
    enableShadow(headGroup);
    root.add(headGroup);
    registerExplodable(headGroup, [sinA * 0.14, cosA * 0.14, 0]);

    // =======================================================================
    // 6. SCULPTED CAMSHAFT VALVE COVERS + COIL-ON-PLUG IGNITION PACKS
    // =======================================================================
    const coverDist = V12_SPEC.DECK_HEIGHT + 0.125;
    const coverGroup = new THREE.Group();
    coverGroup.position.set(sinA * coverDist, CRANK_Y + cosA * coverDist, 0);
    coverGroup.rotation.z = -bankAngle;

    const coverMat = bankSign === 1 ? materials.valveCoverBankA : materials.valveCover;

    // Beveled sculpted cam cover shell
    const coverShape = new THREE.Shape();
    coverShape.moveTo(-0.088, -0.024);
    coverShape.lineTo(0.088, -0.024);
    coverShape.lineTo(0.078, 0.022);
    coverShape.quadraticCurveTo(0, 0.036, -0.078, 0.022);
    coverShape.closePath();

    const coverGeo = track(
      new THREE.ExtrudeGeometry(coverShape, {
        depth: BLOCK_LEN,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.008,
        bevelThickness: 0.008,
      })
    );
    coverGeo.translate(0, 0, -BLOCK_LEN * 0.5);

    const coverShell = new THREE.Mesh(coverGeo, coverMat);
    coverGroup.add(coverShell);

    // Signature machined aluminum trim ribs along cam cover
    const trimRibGeo = track(new THREE.BoxGeometry(0.007, 0.008, BLOCK_LEN - 0.06));
    for (const tx of [-0.048, 0.048]) {
      const rib = new THREE.Mesh(trimRibGeo, materials.emblemAccent);
      rib.position.set(tx, 0.031, 0);
      coverGroup.add(rib);
    }

    // Billet CNC Oil Filler Cap on front of Bank A cover
    if (bankSign === 1) {
      const fillerCap = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.024, 0.026, 0.022, 24)),
        materials.emblemAccent
      );
      fillerCap.position.set(0.018, 0.038, HALF_SPAN + 0.01);
      coverGroup.add(fillerCap);
    }

    // 6 Individual Coil-on-Plug ignition modules down the center channel
    for (const { c } of bankCyls) {
      const coil = new THREE.Mesh(coilPackGeo, materials.coilPackDark);
      coil.position.set(0, 0.034, c.zPos);
      coverGroup.add(coil);

      const coilAccent = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.022, 0.005, 0.022)),
        materials.fuelRail
      );
      coilAccent.position.set(0, 0.052, c.zPos);
      coverGroup.add(coilAccent);
    }

    // Ignition wiring harness rail
    const harness = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.0065, 0.0065, BLOCK_LEN - 0.08, 12)).rotateX(Math.PI / 2),
      materials.coilPackDark
    );
    harness.position.set(bankSign * 0.022, 0.038, 0);
    coverGroup.add(harness);

    // Perimeter cam cover titanium bolts (pushed into InstancedMesh array in local space via world approximation when unexploded; better: attach directly to coverGroup so they move on explode!)
    const coverBoltInst = new THREE.InstancedMesh(boltGeo, materials.fastenerTi, 14);
    let bIdx = 0;
    for (let i = 0; i < 7; i++) {
      const bz = HALF_SPAN + 0.04 - i * PITCH;
      for (const side of [-1, 1]) {
        tmpPos.set(side * 0.084, -0.012, bz);
        tmpQuat.identity();
        tmpMat.compose(tmpPos, tmpQuat, tmpScale);
        coverBoltInst.setMatrixAt(bIdx++, tmpMat);
      }
    }
    coverBoltInst.instanceMatrix.needsUpdate = true;
    coverBoltInst.computeBoundingSphere();
    coverGroup.add(coverBoltInst);

    tagInspectable(coverGroup, 'valvetrain');
    enableShadow(coverGroup);
    root.add(coverGroup);
    registerExplodable(coverGroup, [sinA * 0.28, cosA * 0.28, 0]);
  }

  // =========================================================================
  // 7. DUAL AUTOCLAVE CARBON-FIBER INTAKE PLENUMS, 12 VELOCITY STACKS & ITBs
  // =========================================================================
  const intakeGroup = new THREE.Group();
  intakeGroup.name = 'IntakeSystem';
  const throttlePlates: THREE.Object3D[] = [];

  const trumpetGeo = track(new THREE.CylinderGeometry(0.028, 0.021, 0.092, 22, 1, true));
  const trumpetLipGeo = track(new THREE.TorusGeometry(0.028, 0.0042, 10, 22));
  trumpetLipGeo.rotateX(Math.PI / 2);
  const butterflyGeo = track(new THREE.CylinderGeometry(0.0195, 0.0195, 0.0028, 18));
  const injectorGeo = track(new THREE.CylinderGeometry(0.0068, 0.0055, 0.044, 12));

  // Aerodynamic sculpted carbon airbox cross-section
  const plenumShape = new THREE.Shape();
  plenumShape.moveTo(-0.068, -0.036);
  plenumShape.quadraticCurveTo(0, -0.048, 0.068, -0.032);
  plenumShape.quadraticCurveTo(0.082, 0.012, 0.056, 0.058);
  plenumShape.quadraticCurveTo(0, 0.084, -0.062, 0.052);
  plenumShape.quadraticCurveTo(-0.084, 0.008, -0.068, -0.036);

  const plenumGeo = track(
    new THREE.ExtrudeGeometry(plenumShape, {
      depth: BLOCK_LEN - 0.03,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.014,
      bevelThickness: 0.016,
    })
  );
  plenumGeo.translate(0, 0, -(BLOCK_LEN - 0.03) * 0.5);

  for (const bankSign of [1, -1] as const) {
    const bankSub = new THREE.Group();
    const plenumMat = bankSign === 1 ? materials.carbonPlenumBankA : materials.carbonPlenum;

    // Carbon plenum positioned above the V-valley
    const plenum = new THREE.Mesh(plenumGeo, plenumMat);
    plenum.position.set(bankSign * 0.118, CRANK_Y + 0.398, 0);
    plenum.rotation.z = -bankSign * 0.14;
    bankSub.add(plenum);

    // Front carbon intake snorkel bellmouth
    const snoutGeo = track(new THREE.CylinderGeometry(0.042, 0.052, 0.085, 24));
    snoutGeo.rotateX(Math.PI / 2);
    const snoutMesh = new THREE.Mesh(snoutGeo, plenumMat);
    snoutMesh.position.set(bankSign * 0.118, CRANK_Y + 0.402, BLOCK_LEN * 0.5 + 0.032);
    bankSub.add(snoutMesh);

    const snoutRing = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.043, 0.0055, 12, 28)),
      materials.emblemAccent
    );
    snoutRing.position.set(bankSign * 0.118, CRANK_Y + 0.402, BLOCK_LEN * 0.5 + 0.074);
    bankSub.add(snoutRing);

    // 6 Velocity stacks (trumpets), individual throttle butterflies & fuel injectors per bank
    const bankCyls = CYLINDER_DEFS.filter((c) => c.bankSign === bankSign);
    for (const c of bankCyls) {
      const runnerGroup = new THREE.Group();
      runnerGroup.position.set(bankSign * 0.094, CRANK_Y + 0.326, c.zPos);
      runnerGroup.rotation.z = -bankSign * 0.38;

      const trumpet = new THREE.Mesh(trumpetGeo, materials.billetMachined);
      runnerGroup.add(trumpet);

      const lip = new THREE.Mesh(trumpetLipGeo, materials.emblemAccent);
      lip.position.y = 0.046;
      runnerGroup.add(lip);

      // Articulated butterfly throttle plate (opens with throttle / RPM)
      const platePivot = new THREE.Group();
      platePivot.position.y = -0.015;
      const plate = new THREE.Mesh(butterflyGeo, materials.bronzeGuide);
      platePivot.add(plate);
      runnerGroup.add(platePivot);
      throttlePlates.push(platePivot);

      bankSub.add(runnerGroup);

      // Fuel injector angled into intake runner
      const injector = new THREE.Mesh(injectorGeo, materials.coilPackDark);
      injector.position.set(bankSign * 0.054, CRANK_Y + 0.305, c.zPos);
      injector.rotation.z = bankSign * 0.55;
      bankSub.add(injector);
    }

    // Anodized billet fuel rail spanning all 6 injectors
    const rail = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.011, 0.011, BLOCK_LEN - 0.06, 16)).rotateX(Math.PI / 2),
      materials.fuelRail
    );
    rail.position.set(bankSign * 0.04, CRANK_Y + 0.322, 0);
    bankSub.add(rail);

    intakeGroup.add(bankSub);
  }

  // Central balance crossover tube connecting the twin carbon airboxes
  const crossoverGeo = track(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 24));
  crossoverGeo.rotateZ(Math.PI / 2);
  for (const cz of [-0.17, 0.17]) {
    const cross = new THREE.Mesh(crossoverGeo, materials.carbonPlenum);
    cross.position.set(0, CRANK_Y + 0.402, cz);
    intakeGroup.add(cross);

    // Billet silicone clamp rings
    for (const cx of [-0.045, 0.045]) {
      const clamp = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.0335, 0.0038, 10, 24)).rotateY(Math.PI / 2),
        materials.emblemAccent
      );
      clamp.position.set(cx, CRANK_Y + 0.402, cz);
      intakeGroup.add(clamp);
    }
  }

  // Billet V12 center bridge badge plate between the two carbon plenums
  const centerBridge = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.072, 0.012, 0.24)),
    materials.emblemAccent
  );
  centerBridge.position.set(0, CRANK_Y + 0.442, 0);
  intakeGroup.add(centerBridge);

  tagInspectable(intakeGroup, 'intake');
  enableShadow(intakeGroup);
  root.add(intakeGroup);
  registerExplodable(intakeGroup, [0, 0.32, 0]);

  // =========================================================================
  // 8. 12-TO-2 EQUAL-LENGTH TUBULAR INCONEL / TITANIUM EXHAUST HEADERS
  // =========================================================================
  const flangeGeo = track(new THREE.BoxGeometry(0.014, 0.052, 0.064));
  const collectorGeo = track(new THREE.CylinderGeometry(0.044, 0.034, 0.13, 24));
  collectorGeo.rotateX(Math.PI / 2);
  const tailStubGeo = track(new THREE.CylinderGeometry(0.034, 0.036, 0.16, 24));
  tailStubGeo.rotateX(Math.PI / 2);

  for (const bankSign of [1, -1] as const) {
    const headerGroup = new THREE.Group();
    headerGroup.name = bankSign === 1 ? 'ExhaustBankA' : 'ExhaustBankB';

    const bankAngle = bankSign * BANK_ANG;
    const sinA = Math.sin(bankAngle);
    const cosA = Math.cos(bankAngle);
    const portDist = V12_SPEC.DECK_HEIGHT + 0.038;
    const portBaseX = sinA * portDist + bankSign * 0.074;
    const portBaseY = CRANK_Y + cosA * portDist - 0.038;

    const collectorX = bankSign * 0.32;
    const collectorY = CRANK_Y - 0.025;
    const collectorZ = -0.34;

    const bankCyls = CYLINDER_DEFS.filter((c) => c.bankSign === bankSign);

    bankCyls.forEach((c, localIdx) => {
      // CNC exhaust port flange
      const flange = new THREE.Mesh(flangeGeo, materials.billetMachined);
      flange.position.set(portBaseX, portBaseY, c.zPos);
      flange.rotation.z = -bankAngle;
      headerGroup.add(flange);

      // Sweeping 3D equal-length primary runner using CatmullRomCurve3
      const archOut = bankSign * (0.34 + Math.sin((localIdx / 5) * Math.PI) * 0.062);
      const archUp = portBaseY + 0.028 - localIdx * 0.008;
      const midZ = THREE.MathUtils.lerp(c.zPos, collectorZ + 0.07, 0.55);
      const ringAngle = (localIdx / 6) * Math.PI * 2;
      const endOffsetX = Math.cos(ringAngle) * 0.02;
      const endOffsetY = Math.sin(ringAngle) * 0.02;

      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(portBaseX, portBaseY, c.zPos),
        new THREE.Vector3(portBaseX + bankSign * 0.075, portBaseY + 0.012, c.zPos),
        new THREE.Vector3(archOut, archUp - 0.085, midZ + 0.04),
        new THREE.Vector3(
          collectorX + endOffsetX * 1.4,
          collectorY + endOffsetY * 1.4 + 0.02,
          collectorZ + 0.14
        ),
        new THREE.Vector3(collectorX + endOffsetX, collectorY + endOffsetY, collectorZ + 0.03),
      ]);

      const tubeGeo = track(new THREE.TubeGeometry(curve, 28, 0.0175, 14, false));
      const runnerMesh = new THREE.Mesh(tubeGeo, materials.exhaustHeader);
      headerGroup.add(runnerMesh);
    });

    // 6-into-1 hydroformed collector cone + rear exit pipe
    const collector = new THREE.Mesh(collectorGeo, materials.exhaustHeader);
    collector.position.set(collectorX, collectorY, collectorZ - 0.03);
    headerGroup.add(collector);

    const tailStub = new THREE.Mesh(tailStubGeo, materials.exhaustHeader);
    tailStub.position.set(collectorX, collectorY, collectorZ - 0.16);
    headerGroup.add(tailStub);

    // Collector V-band clamp ring
    const vBand = new THREE.Mesh(
      track(new THREE.TorusGeometry(0.037, 0.0045, 10, 24)),
      materials.emblemAccent
    );
    vBand.position.set(collectorX, collectorY, collectorZ - 0.095);
    headerGroup.add(vBand);

    tagInspectable(headerGroup, 'exhaust');
    enableShadow(headerGroup);
    root.add(headerGroup);
    registerExplodable(headerGroup, [bankSign * 0.28, -0.04, 0]);
  }

  // =========================================================================
  // 9. FRONT TIMING GEAR TRAIN, HARMONIC DAMPER, ALTERNATOR & SERPENTINE BELT
  // =========================================================================
  const frontDriveGroup = new THREE.Group();
  frontDriveGroup.name = 'FrontTimingDrive';
  const frontZ = BLOCK_LEN * 0.5 + 0.03;

  // Front timing cover backing plate
  const frontPlateShape = new THREE.Shape();
  frontPlateShape.moveTo(-0.14, -0.09);
  frontPlateShape.lineTo(0.14, -0.09);
  frontPlateShape.lineTo(0.24, 0.22);
  frontPlateShape.lineTo(0.12, 0.34);
  frontPlateShape.lineTo(0, 0.18);
  frontPlateShape.lineTo(-0.12, 0.34);
  frontPlateShape.lineTo(-0.24, 0.22);
  frontPlateShape.closePath();

  const frontPlateGeo = track(
    new THREE.ExtrudeGeometry(frontPlateShape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.003,
      bevelThickness: 0.003,
    })
  );
  const frontPlate = new THREE.Mesh(frontPlateGeo, materials.blockSolid);
  frontPlate.position.set(0, CRANK_Y, frontZ - 0.025);
  frontDriveGroup.add(frontPlate);

  // Crankshaft harmonic damper pulley (rotates at 1x crank speed)
  const frontDamperGroup = new THREE.Group();
  frontDamperGroup.position.set(0, CRANK_Y, frontZ + 0.042);

  const damperRing = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.068, 0.068, 0.032, 32)).rotateX(Math.PI / 2),
    materials.coilPackDark
  );
  frontDamperGroup.add(damperRing);

  const damperHub = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.046, 0.046, 0.036, 24)).rotateX(Math.PI / 2),
    materials.billetMachined
  );
  frontDamperGroup.add(damperHub);

  // 6 damper bolts (so rotation is super readable visually!)
  for (let b = 0; b < 6; b++) {
    const a = (b / 6) * Math.PI * 2;
    const db = new THREE.Mesh(boltGeo, materials.emblemAccent);
    db.rotation.x = Math.PI / 2;
    db.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0.018);
    frontDamperGroup.add(db);
  }

  // Timing crank sprocket right behind damper
  const crankSprocket = new THREE.Mesh(
    track(createGearGeometry(0.038, 22, 0.014)),
    materials.crankSteel
  );
  crankSprocket.position.z = -0.042;
  frontDamperGroup.add(crankSprocket);

  frontDriveGroup.add(frontDamperGroup);

  // Accessory pulleys (water pump, alternator, tensioner)
  const accessoryPulleys: THREE.Object3D[] = [];
  const pulleySpecs: { pos: [number, number]; radius: number; hasHousing?: boolean }[] = [
    { pos: [0, CRANK_Y + 0.145], radius: 0.042 }, // central water pump
    { pos: [0.165, CRANK_Y + 0.065], radius: 0.032, hasHousing: true }, // alternator
    { pos: [-0.145, CRANK_Y + 0.045], radius: 0.028 }, // dry-sump oil pump pulley
  ];

  const pulleySpokeGeo = track(new THREE.BoxGeometry(0.05, 0.008, 0.026));
  for (const ps of pulleySpecs) {
    const pGroup = new THREE.Group();
    pGroup.position.set(ps.pos[0], ps.pos[1], frontZ + 0.042);

    const wheel = new THREE.Mesh(
      track(new THREE.CylinderGeometry(ps.radius, ps.radius, 0.024, 24)).rotateX(Math.PI / 2),
      materials.billetMachined
    );
    pGroup.add(wheel);

    // Cross spokes so spin is unmistakable
    const s1 = new THREE.Mesh(pulleySpokeGeo, materials.coilPackDark);
    s1.scale.x = ps.radius / 0.034;
    s1.position.z = 0.003;
    pGroup.add(s1);

    frontDriveGroup.add(pGroup);
    accessoryPulleys.push(pGroup);

    if (ps.hasHousing) {
      const altBody = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.054, 0.054, 0.095, 20)).rotateX(Math.PI / 2),
        materials.blockSolid
      );
      altBody.position.set(ps.pos[0], ps.pos[1], frontZ - 0.045);
      frontDriveGroup.add(altBody);
    }
  }

  // Continuous ribbed serpentine belt loop
  const beltCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, CRANK_Y - 0.068, frontZ + 0.042),
      new THREE.Vector3(0.064, CRANK_Y - 0.022, frontZ + 0.042),
      new THREE.Vector3(0.185, CRANK_Y + 0.045, frontZ + 0.042),
      new THREE.Vector3(0.165, CRANK_Y + 0.098, frontZ + 0.042),
      new THREE.Vector3(0.035, CRANK_Y + 0.186, frontZ + 0.042),
      new THREE.Vector3(-0.035, CRANK_Y + 0.186, frontZ + 0.042),
      new THREE.Vector3(-0.168, CRANK_Y + 0.068, frontZ + 0.042),
      new THREE.Vector3(-0.155, CRANK_Y + 0.018, frontZ + 0.042),
      new THREE.Vector3(-0.064, CRANK_Y - 0.022, frontZ + 0.042),
    ],
    true
  );
  const beltMesh = new THREE.Mesh(
    track(new THREE.TubeGeometry(beltCurve, 72, 0.0072, 8, true)),
    materials.beltRubber
  );
  frontDriveGroup.add(beltMesh);

  // Dual exposed timing chain loops connecting crank sprocket to both banks' cam gears
  for (const bankSign of [1, -1] as const) {
    const bankAngle = bankSign * BANK_ANG;
    const sinA = Math.sin(bankAngle);
    const cosA = Math.cos(bankAngle);
    const camDist = V12_SPEC.DECK_HEIGHT + 0.115;
    const cx = sinA * camDist;
    const cy = CRANK_Y + cosA * camDist;

    const chainCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(bankSign * 0.026, CRANK_Y - 0.024, frontZ),
        new THREE.Vector3(cx + bankSign * 0.046, cy - 0.018, frontZ),
        new THREE.Vector3(cx + bankSign * 0.025, cy + 0.052, frontZ),
        new THREE.Vector3(cx - bankSign * 0.048, cy + 0.028, frontZ),
        new THREE.Vector3(-bankSign * 0.024, CRANK_Y + 0.018, frontZ),
      ],
      true
    );
    const chainMesh = new THREE.Mesh(
      track(new THREE.TubeGeometry(chainCurve, 48, 0.0055, 8, true)),
      materials.bronzeGuide
    );
    frontDriveGroup.add(chainMesh);
  }

  tagInspectable(frontDriveGroup, 'timing');
  enableShadow(frontDriveGroup);
  root.add(frontDriveGroup);
  registerExplodable(frontDriveGroup, [0, 0, 0.24]);

  // =========================================================================
  // 10. REAR CNC BILLET FLYWHEEL & TRIPLE-PLATE RACING CLUTCH
  // =========================================================================
  const flywheelGroup = new THREE.Group();
  flywheelGroup.name = 'FlywheelAndClutch';
  flywheelGroup.position.set(0, CRANK_Y, -(BLOCK_LEN * 0.5 + 0.052));

  // Main billet flywheel disc
  const fwDisc = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.158, 0.158, 0.022, 48)).rotateX(Math.PI / 2),
    materials.crankSteel
  );
  flywheelGroup.add(fwDisc);

  // Starter ring gear perimeter
  const ringGear = new THREE.Mesh(
    track(createGearGeometry(0.168, 60, 0.014)),
    materials.billetMachined
  );
  ringGear.position.z = 0.006;
  flywheelGroup.add(ringGear);

  // Racing multi-plate clutch basket cover
  const clutchBasket = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.112, 0.122, 0.046, 24)).rotateX(Math.PI / 2),
    materials.emblemAccent
  );
  clutchBasket.position.z = -0.028;
  flywheelGroup.add(clutchBasket);

  // Slotted diaphragm spring hub
  const clutchHub = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.048, 0.056, 0.054, 18)).rotateX(Math.PI / 2),
    materials.coilPackDark
  );
  clutchHub.position.z = -0.032;
  flywheelGroup.add(clutchHub);

  // 8 lightening lug bosses around clutch cover (clear rotational cue!)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const lug = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.018, 0.018, 0.016)),
      materials.fuelRail
    );
    lug.position.set(Math.cos(a) * 0.088, Math.sin(a) * 0.088, -0.05);
    lug.rotation.z = a;
    flywheelGroup.add(lug);
  }

  tagInspectable(flywheelGroup, 'flywheel');
  enableShadow(flywheelGroup);
  root.add(flywheelGroup);
  registerExplodable(flywheelGroup, [0, 0, -0.24]);

  // =========================================================================
  // 11. INSTANCED FASTENERS ON BLOCK BEDPLATE
  // =========================================================================
  for (let i = 0; i < 7; i++) {
    const bz = HALF_SPAN + 0.03 - i * PITCH;
    pushBolt(0.145, CRANK_Y - 0.075, bz);
    pushBolt(-0.145, CRANK_Y - 0.075, bz);
  }
  const blockBolts = new THREE.InstancedMesh(boltGeo, materials.fastenerTi, boltMatrices.length);
  boltMatrices.forEach((m, idx) => blockBolts.setMatrixAt(idx, m));
  blockBolts.instanceMatrix.needsUpdate = true;
  blockBolts.computeBoundingSphere();
  blockMainGroup.add(blockBolts);

  return {
    root,
    crankshaftGroup,
    flywheelGroup,
    frontDamperGroup,
    camshafts,
    accessoryPulleys,
    pistonRods,
    valves,
    throttlePlates,
    explodables,
    dispose: () => {
      for (const geo of geometriesToDispose) {
        geo.dispose();
      }
    },
  };
}
