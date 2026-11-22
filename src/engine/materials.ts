import * as THREE from 'three/webgpu';
import { FINISH_PRESETS } from './constants';
import type { ProceduralTextureSet } from './textures';
import type { FinishPresetId, ViewMode } from '../types/engine';

export interface V12MaterialLibrary {
  blockSolid: THREE.MeshPhysicalNodeMaterial;
  blockCutawayBankA: THREE.MeshPhysicalNodeMaterial;
  sumpCast: THREE.MeshPhysicalNodeMaterial;
  cylinderHead: THREE.MeshPhysicalNodeMaterial;
  cylinderHeadBankA: THREE.MeshPhysicalNodeMaterial;
  valveCover: THREE.MeshPhysicalNodeMaterial;
  valveCoverBankA: THREE.MeshPhysicalNodeMaterial;
  carbonPlenum: THREE.MeshPhysicalNodeMaterial;
  carbonPlenumBankA: THREE.MeshPhysicalNodeMaterial;
  billetMachined: THREE.MeshPhysicalNodeMaterial;
  crankSteel: THREE.MeshPhysicalNodeMaterial;
  titaniumRod: THREE.MeshPhysicalNodeMaterial;
  pistonAlloy: THREE.MeshPhysicalNodeMaterial;
  pistonRing: THREE.MeshStandardNodeMaterial;
  exhaustHeader: THREE.MeshPhysicalNodeMaterial;
  fuelRail: THREE.MeshPhysicalNodeMaterial;
  coilPackDark: THREE.MeshStandardNodeMaterial;
  beltRubber: THREE.MeshStandardNodeMaterial;
  bronzeGuide: THREE.MeshPhysicalNodeMaterial;
  fastenerTi: THREE.MeshStandardNodeMaterial;
  emblemAccent: THREE.MeshPhysicalNodeMaterial;
  combustionMaterials: THREE.MeshBasicNodeMaterial[];
  applyFinish: (finishId: FinishPresetId) => void;
  applyViewMode: (mode: ViewMode) => void;
  setExhaustThermalGlow: (heatNormalized: number) => void;
  setHighlightPart: (partId: string | null) => void;
  dispose: () => void;
}

export function createV12Materials(textures: ProceduralTextureSet): V12MaterialLibrary {
  const initial = FINISH_PRESETS.rosso;

  const blockSolid = new THREE.MeshPhysicalNodeMaterial({
    color: initial.blockColor,
    metalness: initial.blockMetalness,
    roughness: initial.blockRoughness,
    bumpMap: textures.castGrainBump,
    bumpScale: 0.0022,
    envMapIntensity: 1.15,
  });

  const blockCutawayBankA = new THREE.MeshPhysicalNodeMaterial({
    color: initial.blockColor,
    metalness: initial.blockMetalness,
    roughness: initial.blockRoughness,
    bumpMap: textures.castGrainBump,
    bumpScale: 0.0022,
    envMapIntensity: 1.15,
  });

  const sumpCast = new THREE.MeshPhysicalNodeMaterial({
    color: 0x2c3037,
    metalness: 0.72,
    roughness: 0.48,
    bumpMap: textures.castGrainBump,
    bumpScale: 0.0026,
    envMapIntensity: 0.95,
  });

  const cylinderHead = new THREE.MeshPhysicalNodeMaterial({
    color: 0xc2c8d0,
    metalness: 0.88,
    roughness: 0.28,
    bumpMap: textures.brushedBump,
    bumpScale: 0.0014,
    envMapIntensity: 1.2,
  });

  const cylinderHeadBankA = cylinderHead.clone();

  const valveCover = new THREE.MeshPhysicalNodeMaterial({
    color: initial.valveCoverColor,
    metalness: initial.valveCoverMetalness,
    roughness: initial.valveCoverRoughness,
    clearcoat: initial.valveCoverClearcoat,
    clearcoatRoughness: 0.2,
    bumpMap: textures.crinkleBump,
    bumpScale: 0.0032,
    envMapIntensity: 1.15,
  });

  const valveCoverBankA = valveCover.clone();

  const carbonPlenum = new THREE.MeshPhysicalNodeMaterial({
    color: 0xffffff,
    map: textures.carbonAlbedo,
    bumpMap: textures.carbonBump,
    bumpScale: 0.0024,
    metalness: 0.18,
    roughness: initial.plenumRoughness,
    clearcoat: initial.plenumClearcoat,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.35,
  });

  const carbonPlenumBankA = carbonPlenum.clone();

  const billetMachined = new THREE.MeshPhysicalNodeMaterial({
    color: 0xdce1e8,
    metalness: 0.94,
    roughness: 0.18,
    bumpMap: textures.brushedBump,
    bumpScale: 0.0012,
    anisotropy: 0.65,
    envMapIntensity: 1.35,
  });

  const crankSteel = new THREE.MeshPhysicalNodeMaterial({
    color: 0x8e96a3,
    metalness: 0.96,
    roughness: 0.2,
    bumpMap: textures.brushedBump,
    bumpScale: 0.001,
    anisotropy: 0.75,
    envMapIntensity: 1.4,
  });

  const titaniumRod = new THREE.MeshPhysicalNodeMaterial({
    color: 0xa8a39a,
    metalness: 0.92,
    roughness: 0.28,
    bumpMap: textures.brushedBump,
    bumpScale: 0.0012,
    envMapIntensity: 1.25,
  });

  const pistonAlloy = new THREE.MeshPhysicalNodeMaterial({
    color: 0xe3e7ee,
    metalness: 0.92,
    roughness: 0.16,
    clearcoat: 0.15,
    envMapIntensity: 1.3,
  });

  const pistonRing = new THREE.MeshStandardNodeMaterial({
    color: 0x262930,
    metalness: 0.85,
    roughness: 0.35,
  });

  const exhaustHeader = new THREE.MeshPhysicalNodeMaterial({
    color: initial.headerColor,
    map: textures.exhaustHeatMap,
    metalness: 0.9,
    roughness: 0.24,
    iridescence: initial.headerIridescence,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [180, 480],
    emissive: new THREE.Color(0xff3808),
    emissiveIntensity: 0.0,
    envMapIntensity: 1.35,
  });

  const fuelRail = new THREE.MeshPhysicalNodeMaterial({
    color: initial.fuelRailColor,
    metalness: 0.82,
    roughness: 0.22,
    clearcoat: 0.35,
    envMapIntensity: 1.2,
  });

  const coilPackDark = new THREE.MeshStandardNodeMaterial({
    color: 0x1e2126,
    metalness: 0.12,
    roughness: 0.65,
  });

  const beltRubber = new THREE.MeshStandardNodeMaterial({
    color: 0x16171a,
    metalness: 0.04,
    roughness: 0.86,
  });

  const bronzeGuide = new THREE.MeshPhysicalNodeMaterial({
    color: 0xc29354,
    metalness: 0.9,
    roughness: 0.24,
    envMapIntensity: 1.25,
  });

  const fastenerTi = new THREE.MeshStandardNodeMaterial({
    color: 0xcfd6e0,
    metalness: 0.94,
    roughness: 0.22,
  });

  const emblemAccent = new THREE.MeshPhysicalNodeMaterial({
    color: initial.accentMetalColor,
    metalness: 0.95,
    roughness: 0.16,
    clearcoat: 0.4,
    envMapIntensity: 1.4,
  });

  // 12 independent combustion plasma glow materials (one per cylinder)
  const combustionMaterials: THREE.MeshBasicNodeMaterial[] = [];
  for (let i = 0; i < 12; i++) {
    combustionMaterials.push(
      new THREE.MeshBasicNodeMaterial({
        color: 0xff8a2b,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
  }

  let currentFinish: FinishPresetId = 'rosso';
  let currentViewMode: ViewMode = 'solid';

  const setXRayShell = (mat: THREE.MeshPhysicalNodeMaterial, isXRay: boolean) => {
    mat.transparent = isXRay;
    mat.opacity = isXRay ? 0.17 : 1.0;
    mat.depthWrite = !isXRay;
    mat.roughness = isXRay ? 0.12 : mat.userData.baseRoughness ?? mat.roughness;
    mat.needsUpdate = true;
  };

  // Store base roughness for toggling back from X-Ray
  const storeBase = () => {
    const preset = FINISH_PRESETS[currentFinish];
    blockSolid.userData.baseRoughness = preset.blockRoughness;
    blockCutawayBankA.userData.baseRoughness = preset.blockRoughness;
    sumpCast.userData.baseRoughness = 0.48;
    cylinderHead.userData.baseRoughness = 0.28;
    cylinderHeadBankA.userData.baseRoughness = 0.28;
    valveCover.userData.baseRoughness = preset.valveCoverRoughness;
    valveCoverBankA.userData.baseRoughness = preset.valveCoverRoughness;
    carbonPlenum.userData.baseRoughness = preset.plenumRoughness;
    carbonPlenumBankA.userData.baseRoughness = preset.plenumRoughness;
  };
  storeBase();

  const applyViewMode = (mode: ViewMode) => {
    currentViewMode = mode;
    const isXRay = mode === 'xray';
    const isCutaway = mode === 'cutaway';

    // Outer static shells
    setXRayShell(blockSolid, isXRay);
    setXRayShell(sumpCast, isXRay);
    setXRayShell(cylinderHead, isXRay);
    setXRayShell(valveCover, isXRay);
    setXRayShell(carbonPlenum, isXRay);

    // Bank A cutaway-capable shells: ghosted/invisible in Cutaway so pistons/valves shine clearly
    if (isCutaway) {
      for (const mat of [blockCutawayBankA, cylinderHeadBankA, valveCoverBankA, carbonPlenumBankA]) {
        mat.transparent = true;
        mat.opacity = 0.11;
        mat.depthWrite = false;
        mat.needsUpdate = true;
      }
    } else {
      for (const mat of [blockCutawayBankA, cylinderHeadBankA, valveCoverBankA, carbonPlenumBankA]) {
        setXRayShell(mat, isXRay);
      }
    }
  };

  const applyFinish = (finishId: FinishPresetId) => {
    currentFinish = finishId;
    const preset = FINISH_PRESETS[finishId];
    storeBase();

    for (const vc of [valveCover, valveCoverBankA]) {
      vc.color.setHex(preset.valveCoverColor);
      vc.metalness = preset.valveCoverMetalness;
      vc.roughness = preset.valveCoverRoughness;
      vc.clearcoat = preset.valveCoverClearcoat;
      vc.bumpScale = finishId === 'rosso' ? 0.0034 : 0.0012;
    }

    for (const cp of [carbonPlenum, carbonPlenumBankA]) {
      cp.clearcoat = preset.plenumClearcoat;
      cp.roughness = preset.plenumRoughness;
    }

    for (const blk of [blockSolid, blockCutawayBankA]) {
      blk.color.setHex(preset.blockColor);
      blk.metalness = preset.blockMetalness;
      blk.roughness = preset.blockRoughness;
    }

    exhaustHeader.color.setHex(preset.headerColor);
    exhaustHeader.iridescence = preset.headerIridescence;
    fuelRail.color.setHex(preset.fuelRailColor);
    emblemAccent.color.setHex(preset.accentMetalColor);

    applyViewMode(currentViewMode);
  };

  const setExhaustThermalGlow = (heatNormalized: number) => {
    const h = THREE.MathUtils.clamp(heatNormalized, 0, 1);
    exhaustHeader.emissiveIntensity = h * h * 2.1;
    // Shift from deep cherry red -> incandescent orange as heat climbs
    exhaustHeader.emissive.setRGB(1.0, 0.14 + h * 0.28, 0.02 + h * 0.04);
  };

  const highlightMap: Record<string, THREE.MeshPhysicalNodeMaterial[]> = {
    intake: [carbonPlenum, carbonPlenumBankA, fuelRail],
    valvetrain: [valveCover, valveCoverBankA],
    crankshaft: [crankSteel],
    pistons: [pistonAlloy, titaniumRod],
    block: [blockSolid, blockCutawayBankA],
    timing: [billetMachined],
    flywheel: [emblemAccent],
  };

  const resetEmissiveTargets = [
    carbonPlenum,
    carbonPlenumBankA,
    fuelRail,
    valveCover,
    valveCoverBankA,
    crankSteel,
    pistonAlloy,
    titaniumRod,
    blockSolid,
    blockCutawayBankA,
    billetMachined,
    emblemAccent,
  ];

  const setHighlightPart = (partId: string | null) => {
    for (const mat of resetEmissiveTargets) {
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
    }
    if (!partId || partId === 'exhaust') return;
    const targets = highlightMap[partId];
    if (!targets) return;
    for (const mat of targets) {
      mat.emissive.setHex(0xe5482e);
      mat.emissiveIntensity = 0.22;
    }
  };

  const allMaterials: THREE.Material[] = [
    blockSolid,
    blockCutawayBankA,
    sumpCast,
    cylinderHead,
    cylinderHeadBankA,
    valveCover,
    valveCoverBankA,
    carbonPlenum,
    carbonPlenumBankA,
    billetMachined,
    crankSteel,
    titaniumRod,
    pistonAlloy,
    pistonRing,
    exhaustHeader,
    fuelRail,
    coilPackDark,
    beltRubber,
    bronzeGuide,
    fastenerTi,
    emblemAccent,
    ...combustionMaterials,
  ];

  return {
    blockSolid,
    blockCutawayBankA,
    sumpCast,
    cylinderHead,
    cylinderHeadBankA,
    valveCover,
    valveCoverBankA,
    carbonPlenum,
    carbonPlenumBankA,
    billetMachined,
    crankSteel,
    titaniumRod,
    pistonAlloy,
    pistonRing,
    exhaustHeader,
    fuelRail,
    coilPackDark,
    beltRubber,
    bronzeGuide,
    fastenerTi,
    emblemAccent,
    combustionMaterials,
    applyFinish,
    applyViewMode,
    setExhaustThermalGlow,
    setHighlightPart,
    dispose: () => {
      for (const mat of allMaterials) {
        mat.dispose();
      }
    },
  };
}
