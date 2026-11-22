import type {
  CameraPreset,
  FinishPreset,
  FinishPresetId,
  InspectablePartInfo,
} from '../types/engine';

/**
 * Physical dimensions (in meters, 1:1 scale for WebXR) of a 6.5L 60-degree V12.
 * Bore: 92mm, Stroke: 81.6mm -> Displacement per cylinder = 542.4cc -> 6,509cc (6.51L)
 */
export const V12_SPEC = {
  V_ANGLE_DEG: 60,
  BANK_ANGLE_RAD: (30 * Math.PI) / 180, // +/- 30 deg from vertical +Y
  BORE: 0.092,
  BORE_RADIUS: 0.046,
  STROKE: 0.0816,
  CRANK_RADIUS: 0.0408, // stroke / 2
  ROD_LENGTH: 0.148,
  CYLINDER_PITCH: 0.112,
  BANK_Z_OFFSET: 0.022, // paired connecting rod axial offset on shared crankpin
  CRANK_Y: 0.255, // crankshaft centerline height above studio plinth surface
  DECK_HEIGHT: 0.242, // distance along bank axis from crank center to cylinder head deck
  PISTON_COMP_HEIGHT: 0.036,
  PISTON_HEIGHT: 0.056,
  VALVE_MAX_LIFT: 0.0135,
  MAX_RPM: 9500,
  REDLINE_RPM: 8800,
  IDLE_RPM: 950,
} as const;

/**
 * Classic 60-degree V12 symmetrical 6-throw crankshaft angles (degrees)
 * Mirror balanced: pins 1&6 = 0, pins 2&5 = 120, pins 3&4 = 240
 */
export const CRANK_THROW_ANGLES_DEG = [0, 120, 240, 240, 120, 0] as const;

/**
 * True 60-degree V12 firing order: 1-7-5-11-3-9-6-12-2-8-4-10
 * Even 60-degree firing interval across 720-degree 4-stroke cycle.
 * Bank A (Left, +X/+30deg): Cylinders 1..6
 * Bank B (Right, -X/-30deg): Cylinders 7..12
 */
export interface CylinderDefinition {
  cylinderNumber: number; // 1..12
  bank: 'A' | 'B';
  bankIndex: number; // 0..5 (front to rear)
  bankSign: 1 | -1; // +1 = Bank A (+X tilted), -1 = Bank B (-X tilted)
  throwAngleDeg: number;
  firingAngleDeg: number; // TDC power stroke angle in 0..720 deg cycle
  zPos: number;
}

const FIRING_ORDER = [1, 7, 5, 11, 3, 9, 6, 12, 2, 8, 4, 10] as const;

function buildCylinderDefinitions(): CylinderDefinition[] {
  const defs: CylinderDefinition[] = [];
  const halfSpan = 2.5 * V12_SPEC.CYLINDER_PITCH;

  for (let i = 0; i < 6; i++) {
    const baseZ = halfSpan - i * V12_SPEC.CYLINDER_PITCH;
    const throwAngleDeg = CRANK_THROW_ANGLES_DEG[i];

    // Bank A: Cylinders 1..6 (front +Z to rear -Z)
    const cylA = i + 1;
    const fireIdxA = FIRING_ORDER.indexOf(cylA as (typeof FIRING_ORDER)[number]);
    defs.push({
      cylinderNumber: cylA,
      bank: 'A',
      bankIndex: i,
      bankSign: 1,
      throwAngleDeg,
      firingAngleDeg: fireIdxA * 60,
      zPos: baseZ + V12_SPEC.BANK_Z_OFFSET * 0.5,
    });

    // Bank B: Cylinders 7..12 (front +Z to rear -Z)
    const cylB = i + 7;
    const fireIdxB = FIRING_ORDER.indexOf(cylB as (typeof FIRING_ORDER)[number]);
    defs.push({
      cylinderNumber: cylB,
      bank: 'B',
      bankIndex: i,
      bankSign: -1,
      throwAngleDeg,
      firingAngleDeg: fireIdxB * 60,
      zPos: baseZ - V12_SPEC.BANK_Z_OFFSET * 0.5,
    });
  }

  return defs;
}

export const CYLINDER_DEFS: CylinderDefinition[] = buildCylinderDefinitions();

export const FINISH_PRESETS: Record<FinishPresetId, FinishPreset> = {
  rosso: {
    id: 'rosso',
    name: 'Scuderia Rosso',
    subtitle: 'Crinkle crimson covers · Dry twill carbon',
    swatch: '#B9251C',
    accentSwatch: '#27292E',
    valveCoverColor: 0xb01e18,
    valveCoverRoughness: 0.62,
    valveCoverMetalness: 0.15,
    valveCoverClearcoat: 0.08,
    plenumColor: 0x1b1d22,
    plenumClearcoat: 0.25,
    plenumRoughness: 0.42,
    blockColor: 0xb9bec6,
    blockMetalness: 0.86,
    blockRoughness: 0.34,
    headerColor: 0xc2b6a3,
    headerIridescence: 0.35,
    accentMetalColor: 0xd4d8df,
    fuelRailColor: 0x991b1b,
  },
  silver: {
    id: 'silver',
    name: 'Silver Arrow',
    subtitle: 'Satin titanium · Gloss carbon · Blued headers',
    swatch: '#C5CCD6',
    accentSwatch: '#4C6FA8',
    valveCoverColor: 0xc8cfd8,
    valveCoverRoughness: 0.24,
    valveCoverMetalness: 0.92,
    valveCoverClearcoat: 0.3,
    plenumColor: 0x181b21,
    plenumClearcoat: 0.95,
    plenumRoughness: 0.16,
    blockColor: 0xcfd4dc,
    blockMetalness: 0.9,
    blockRoughness: 0.26,
    headerColor: 0x9ca9bf,
    headerIridescence: 0.85,
    accentMetalColor: 0xe6ebf2,
    fuelRailColor: 0x2563eb,
  },
  nero: {
    id: 'nero',
    name: 'Nero Carbonio',
    subtitle: 'Stealth anodized billet · 24k thermal gold',
    swatch: '#202329',
    accentSwatch: '#C99B3B',
    valveCoverColor: 0x1c1e24,
    valveCoverRoughness: 0.32,
    valveCoverMetalness: 0.72,
    valveCoverClearcoat: 0.65,
    plenumColor: 0x15171c,
    plenumClearcoat: 0.88,
    plenumRoughness: 0.18,
    blockColor: 0x383c44,
    blockMetalness: 0.84,
    blockRoughness: 0.36,
    headerColor: 0xd4ad52,
    headerIridescence: 0.45,
    accentMetalColor: 0xd9b355,
    fuelRailColor: 0xb88628,
  },
  weissach: {
    id: 'weissach',
    name: 'Weissach Brass',
    subtitle: 'Magnesium gold covers · Dark cast alloy',
    swatch: '#B08D57',
    accentSwatch: '#3A3E45',
    valveCoverColor: 0xa6834c,
    valveCoverRoughness: 0.34,
    valveCoverMetalness: 0.86,
    valveCoverClearcoat: 0.2,
    plenumColor: 0x1d1f24,
    plenumClearcoat: 0.5,
    plenumRoughness: 0.28,
    blockColor: 0x626770,
    blockMetalness: 0.78,
    blockRoughness: 0.44,
    headerColor: 0xb89678,
    headerIridescence: 0.55,
    accentMetalColor: 0xcbb07b,
    fuelRailColor: 0x3b3f47,
  },
};

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'studio',
    label: '3/4 Studio',
    position: [1.18, 0.78, 1.28],
    target: [0, 0.38, -0.02],
  },
  {
    id: 'valvetrain',
    label: 'Valvetrain',
    position: [0.58, 0.96, 0.62],
    target: [0.16, 0.56, 0.04],
  },
  {
    id: 'crankcase',
    label: 'Crankcase',
    position: [0.82, 0.28, 0.76],
    target: [0, 0.26, 0.02],
  },
  {
    id: 'exhaust',
    label: 'Headers',
    position: [-1.05, 0.52, -0.78],
    target: [-0.2, 0.38, -0.05],
  },
  {
    id: 'intake',
    label: 'Top Intake',
    position: [0.02, 1.48, 0.56],
    target: [0, 0.48, 0.0],
  },
];

export const INSPECTABLE_PARTS: Record<string, InspectablePartInfo> = {
  intake: {
    id: 'intake',
    name: 'Autoclave Carbon Intake Plenums',
    subsystem: 'Induction & 12× Individual Throttle Bodies',
    materialSpec: '2×2 Pre-Preg Carbon Fiber · Billet 7075-T6 Trumpets',
    engineeringNote:
      'Resonance-tuned dual airboxes with central balance crossover feeding 12 individual butterfly throttle bodies for instant transient throttle response.',
    metricLabel: 'Airflow Peak',
    metricValue: '640 g/s',
  },
  valvetrain: {
    id: 'valvetrain',
    name: 'Quad-Cam 48-Valve DOHC Assembly',
    subsystem: 'Valvetrain & Camshaft Covers',
    materialSpec: 'Billet Steel Camshafts · Titanium Valves · Cast Magnesium Covers',
    engineeringNote:
      'Four overhead camshafts driven at exact 1:2 crankshaft ratio actuate 48 titanium valves across both 60° banks with high-RPM harmonic spring control.',
    metricLabel: 'Max Valve Lift',
    metricValue: '13.5 mm',
  },
  crankshaft: {
    id: 'crankshaft',
    name: 'Billet 6-Throw 120° Crankshaft',
    subsystem: 'Rotating Reciprocating Assembly',
    materialSpec: 'EN40B Nitrided Billet Steel · 7 Main Journals',
    engineeringNote:
      'Naturally balanced for primary and secondary forces with mirror-symmetric 120° crank throws and paired titanium H-beam connecting rods.',
    metricLabel: 'Firing Order',
    metricValue: '1-7-5-11-3-9-6-12-2-8-4-10',
  },
  pistons: {
    id: 'pistons',
    name: 'Forged Pistons & Titanium Con-Rods',
    subsystem: 'Reciprocating Kinematics',
    materialSpec: '2618 Forged Alloy Pistons · Ti-6Al-4V H-Beam Rods',
    engineeringNote:
      'Low-friction DLC-coated wrist pins and tri-ring packs reciprocate across an 81.6 mm stroke, reaching 25.8 m/s mean piston speed at 9,500 RPM.',
    metricLabel: 'Bore × Stroke',
    metricValue: '92.0 × 81.6 mm',
  },
  block: {
    id: 'block',
    name: '60° Deep-Skirt V12 Cylinder Block',
    subsystem: 'Primary Structural Crankcase',
    materialSpec: 'A356-T6 Cast Aluminum · Nikasil Honed Liners',
    engineeringNote:
      'Rigid closed-deck 60° monoblock with integrated main bearing webs and dry-sump lower bedplate engineered for structural chassis mounting.',
    metricLabel: 'Displacement',
    metricValue: '6,509 cc (6.5L)',
  },
  exhaust: {
    id: 'exhaust',
    name: '6-into-1 Equal-Length Exhaust Headers',
    subsystem: 'Thermal Exhaust & Scavenging',
    materialSpec: 'Thin-Wall Inconel 625 · Hydroformed Collectors',
    engineeringNote:
      'Equal-length primary runners merge into twin collectors to harmonize 6th-order pressure waves, glowing incandescent above 650 °C under load.',
    metricLabel: 'Peak EGT',
    metricValue: '920 °C',
  },
  timing: {
    id: 'timing',
    name: 'Front Gear & Timing Drive',
    subsystem: 'Synchronization & Ancillaries',
    materialSpec: 'Case-Hardened Spur Gears · Harmonic Damper',
    engineeringNote:
      'Precision gear-and-chain front drive synchronizes all four camshafts to the crankshaft while driving dry-sump oil and coolant pumps.',
    metricLabel: 'Drive Ratio',
    metricValue: '2:1 Crank/Cam',
  },
  flywheel: {
    id: 'flywheel',
    name: 'Ultra-Light Billet Flywheel & Clutch',
    subsystem: 'Power Delivery',
    materialSpec: 'Chromoly 4140 Billet · Triple-Plate Carbon Clutch',
    engineeringNote:
      'Minimal rotational inertia enables razor-sharp rev matching and instantaneous throttle blip response across the 9,500 RPM band.',
    metricLabel: 'Assembly Mass',
    metricValue: '4.1 kg',
  },
};

/**
 * Computes realistic naturally-aspirated 6.5L V12 torque & power curves.
 * Peak Torque ~718 Nm @ 6,750 RPM; Peak Power ~830 HP @ 8,800 RPM.
 */
export function computeDynoTelemetry(rpm: number): {
  horsepower: number;
  torqueNm: number;
  throttlePct: number;
} {
  if (rpm <= 10) {
    return { horsepower: 0, torqueNm: 0, throttlePct: 0 };
  }
  const n = Math.min(rpm / V12_SPEC.MAX_RPM, 1);
  // Broad flat NA V12 torque curve peaking around 6,750 RPM
  const bell = Math.exp(-Math.pow((rpm - 6750) / 3600, 2));
  const lowEnd = 0.58 + 0.42 * bell;
  const highDrop = rpm > 8800 ? 1 - ((rpm - 8800) / 1400) * 0.14 : 1;
  const torqueNm = Math.round(718 * lowEnd * highDrop * Math.min(1, rpm / 1400));
  // Power (kW) = Torque (Nm) * RPM / 9549 -> HP = kW * 1.34102
  const kw = (torqueNm * rpm) / 9549;
  const horsepower = Math.round(kw * 1.34102);
  const throttlePct = Math.round(Math.min(100, Math.max(4, Math.pow(n, 0.85) * 100)));
  return { horsepower, torqueNm, throttlePct };
}
