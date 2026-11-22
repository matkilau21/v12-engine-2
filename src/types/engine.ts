export type FinishPresetId = 'rosso' | 'silver' | 'nero' | 'weissach';

export type ViewMode = 'solid' | 'cutaway' | 'xray';

export type CameraPresetId = 'studio' | 'valvetrain' | 'crankcase' | 'exhaust' | 'intake';

export type LightingPresetId = 'obsidian' | 'gallery' | 'dyno';

export type XRModeSupport = {
  ar: boolean;
  vr: boolean;
};

export type RendererBackendKind = 'WebGPU' | 'WebGL2' | 'Initializing';

export interface FinishPreset {
  id: FinishPresetId;
  name: string;
  subtitle: string;
  swatch: string;
  accentSwatch: string;
  valveCoverColor: number;
  valveCoverRoughness: number;
  valveCoverMetalness: number;
  valveCoverClearcoat: number;
  plenumColor: number;
  plenumClearcoat: number;
  plenumRoughness: number;
  blockColor: number;
  blockMetalness: number;
  blockRoughness: number;
  headerColor: number;
  headerIridescence: number;
  accentMetalColor: number;
  fuelRailColor: number;
}

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export interface InspectablePartInfo {
  id: string;
  name: string;
  subsystem: string;
  materialSpec: string;
  engineeringNote: string;
  metricLabel: string;
  metricValue: string;
}

export interface EngineControlState {
  isRunning: boolean;
  rpm: number;
  timeScale: number;
  explode: number;
  viewMode: ViewMode;
  finish: FinishPresetId;
  lighting: LightingPresetId;
  audioEnabled: boolean;
  xrScale: number;
}

export interface TelemetryData {
  rpm: number;
  horsepower: number;
  torqueNm: number;
  firingCylinder: number;
  exhaustTempC: number;
  throttlePct: number;
  crankDeg: number;
}
