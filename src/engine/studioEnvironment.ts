import * as THREE from 'three/webgpu';
import type { ProceduralTextureSet } from './textures';
import type { LightingPresetId } from '../types/engine';

export interface StudioRig {
  group: THREE.Group;
  keyLight: THREE.DirectionalLight;
  fillLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  plinthGroup: THREE.Group;
  applyLightingPreset: (preset: LightingPresetId, scene: THREE.Scene) => void;
  setStudioBackdropVisible: (visible: boolean) => void;
  generateStudioEnvironment: (renderer: THREE.WebGPURenderer) => THREE.Texture;
  dispose: () => void;
}

/**
 * Builds a procedural luxury automotive configurator lightbox environment
 * (overhead softbox strips, side specular reflectors, dark floor) for PMREM IBL.
 */
function buildProceduralStudioEnvScene(): THREE.Scene {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x0b0d12);

  // Dark architectural studio enclosure
  const roomGeo = new THREE.BoxGeometry(26, 14, 26);
  const roomMat = new THREE.MeshBasicNodeMaterial({
    color: 0x10131a,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(roomGeo, roomMat));

  // Elongated automotive configurator overhead softbox strips (warm-neutral luxury reflections)
  const addSoftbox = (
    w: number,
    h: number,
    d: number,
    pos: [number, number, number],
    rot: [number, number, number],
    hex: number,
    intensity: number
  ) => {
    const c = new THREE.Color(hex).multiplyScalar(intensity);
    const mat = new THREE.MeshBasicNodeMaterial({ color: c });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    envScene.add(mesh);
  };

  // Primary overhead twin light bars (iconic showroom reflection bands on metallic curves)
  addSoftbox(11, 0.15, 2.2, [0, 6.2, 2.6], [0.08, 0, 0], 0xfff5e8, 3.8);
  addSoftbox(11, 0.15, 2.2, [0, 6.2, -2.6], [-0.08, 0, 0], 0xeaf2ff, 3.2);

  // Key lateral softbox (warm alabaster)
  addSoftbox(0.15, 3.8, 10.5, [9.2, 2.6, 1.5], [0, 0, 0.18], 0xfff1de, 2.9);

  // Cool architectural fill strip on opposite side
  addSoftbox(0.15, 3.4, 9.5, [-9.2, 2.4, -1.2], [0, 0, -0.18], 0xcce0ff, 2.3);

  // Crisp rear rim strip for edge separation on carbon plenums & headers
  addSoftbox(8.5, 2.1, 0.15, [0, 3.1, -9.5], [0.12, 0, 0], 0xdce8ff, 3.1);

  // Front subtle fill panel
  addSoftbox(6.5, 1.8, 0.15, [0, 1.9, 9.5], [-0.1, 0, 0], 0xffe8d2, 1.6);

  // Subtle metallic floor bounce strip
  addSoftbox(8, 0.1, 8, [0, -5.8, 0], [0, 0, 0], 0x1d212b, 0.6);

  return envScene;
}

export function createStudioRig(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): StudioRig {
  const group = new THREE.Group();
  group.name = 'StudioRig';

  // 1. Balanced 3-Point Studio Lighting Rig (warm key / cool fill / crisp rim)
  const hemiLight = new THREE.HemisphereLight(0xd9e6ff, 0x1b1917, 0.75);
  hemiLight.position.set(0, 6, 0);
  group.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff3e2, 2.4);
  keyLight.position.set(3.2, 4.4, 3.6);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 12;
    const d = 1.65;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.015;
  }
  group.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc4dbff, 1.1);
  fillLight.position.set(-3.8, 2.6, 1.8);
  group.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xe4eeff, 1.65);
  rimLight.position.set(-1.2, 3.2, -4.2);
  group.add(rimLight);

  // 2. Architectural Studio Floor & Turntable Plinth
  const plinthGroup = new THREE.Group();
  plinthGroup.name = 'StudioPlinth';

  // Large dark studio floor
  const floorGeo = new THREE.CircleGeometry(18, 64);
  const floorMat = new THREE.MeshStandardNodeMaterial({
    color: 0x0b0d11,
    roughness: 0.72,
    metalness: 0.18,
    envMapIntensity: 0.55,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.045;
  floor.receiveShadow = !isSoftwareGl;
  plinthGroup.add(floor);

  // Subtle calibration turntable markings floating 2mm above floor with polygonOffset
  const gridGeo = new THREE.PlaneGeometry(3.4, 3.4);
  const gridMat = new THREE.MeshBasicNodeMaterial({
    map: textures.floorGrid,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const gridOverlay = new THREE.Mesh(gridGeo, gridMat);
  gridOverlay.rotation.x = -Math.PI / 2;
  gridOverlay.position.y = -0.042;
  plinthGroup.add(gridOverlay);

  // Low-profile CNC chamfered showroom turntable plinth
  const plinthTopGeo = new THREE.CylinderGeometry(0.76, 0.81, 0.045, 72);
  const plinthMat = new THREE.MeshPhysicalNodeMaterial({
    color: 0x14171e,
    metalness: 0.58,
    roughness: 0.34,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
    bumpMap: textures.brushedBump,
    bumpScale: 0.0008,
    envMapIntensity: 0.9,
  });
  const plinthMesh = new THREE.Mesh(plinthTopGeo, plinthMat);
  plinthMesh.position.y = -0.0225;
  plinthMesh.receiveShadow = !isSoftwareGl;
  plinthGroup.add(plinthMesh);

  // Recessed machined titanium bezel ring around plinth
  const ringGeo = new THREE.TorusGeometry(0.765, 0.0045, 16, 96);
  const ringMat = new THREE.MeshStandardNodeMaterial({
    color: 0x8c95a6,
    metalness: 0.92,
    roughness: 0.22,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.position.y = -0.001;
  plinthGroup.add(ringMesh);

  // Grounding contact shadow directly beneath the engine on the plinth deck
  const shadowGeo = new THREE.PlaneGeometry(1.18, 1.32);
  const shadowMat = new THREE.MeshBasicNodeMaterial({
    map: textures.contactShadow,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.002;
  plinthGroup.add(contactShadow);

  // Engine display cradle stanchions (4 CNC billet display mounts holding the block flush to plinth)
  const mountMat = new THREE.MeshPhysicalNodeMaterial({
    color: 0x262a33,
    metalness: 0.85,
    roughness: 0.28,
  });
  const mountGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.125, 20);
  const footGeo = new THREE.CylinderGeometry(0.036, 0.04, 0.012, 24);
  const mountCoords: [number, number][] = [
    [0.145, 0.25],
    [-0.145, 0.25],
    [0.145, -0.25],
    [-0.145, -0.25],
  ];
  for (const [mx, mz] of mountCoords) {
    const post = new THREE.Mesh(mountGeo, mountMat);
    post.position.set(mx, 0.062, mz);
    post.castShadow = !isSoftwareGl;
    post.receiveShadow = !isSoftwareGl;
    plinthGroup.add(post);

    const foot = new THREE.Mesh(footGeo, ringMat);
    foot.position.set(mx, 0.006, mz);
    plinthGroup.add(foot);
  }

  group.add(plinthGroup);
  scene.add(group);

  let envRenderTarget: THREE.RenderTarget | null = null;
  let currentLighting: LightingPresetId = 'obsidian';

  const applyLightingPreset = (preset: LightingPresetId, targetScene: THREE.Scene) => {
    currentLighting = preset;
    if (preset === 'obsidian') {
      targetScene.background = new THREE.Color(0x0a0b0e);
      targetScene.fog = new THREE.FogExp2(0x0a0b0e, 0.095);
      floorMat.color.setHex(0x0b0d11);
      plinthMat.color.setHex(0x14171e);
      keyLight.color.setHex(0xfff3e2);
      keyLight.intensity = 2.4;
      fillLight.color.setHex(0xc4dbff);
      fillLight.intensity = 1.1;
      rimLight.color.setHex(0xe4eeff);
      rimLight.intensity = 1.65;
      hemiLight.color.setHex(0xd9e6ff);
      hemiLight.groundColor.setHex(0x1b1917);
      hemiLight.intensity = 0.75;
    } else if (preset === 'gallery') {
      targetScene.background = new THREE.Color(0x1e222a);
      targetScene.fog = new THREE.FogExp2(0x1e222a, 0.075);
      floorMat.color.setHex(0x232832);
      plinthMat.color.setHex(0x2d333f);
      keyLight.color.setHex(0xffffff);
      keyLight.intensity = 2.85;
      fillLight.color.setHex(0xe2ecff);
      fillLight.intensity = 1.65;
      rimLight.color.setHex(0xffffff);
      rimLight.intensity = 1.9;
      hemiLight.color.setHex(0xf2f6ff);
      hemiLight.groundColor.setHex(0x3a3f4a);
      hemiLight.intensity = 1.1;
    } else {
      // 'dyno' warm motorsport test-cell
      targetScene.background = new THREE.Color(0x100c0b);
      targetScene.fog = new THREE.FogExp2(0x100c0b, 0.095);
      floorMat.color.setHex(0x130f0e);
      plinthMat.color.setHex(0x1c1716);
      keyLight.color.setHex(0xffd2a6);
      keyLight.intensity = 2.75;
      fillLight.color.setHex(0x88b4e8);
      fillLight.intensity = 0.85;
      rimLight.color.setHex(0xff9c6b);
      rimLight.intensity = 1.85;
      hemiLight.color.setHex(0xffdfc4);
      hemiLight.groundColor.setHex(0x201510);
      hemiLight.intensity = 0.7;
    }
  };

  applyLightingPreset('obsidian', scene);

  const setStudioBackdropVisible = (visible: boolean) => {
    floor.visible = visible;
    gridOverlay.visible = visible;
    if (visible) {
      applyLightingPreset(currentLighting, scene);
    } else {
      // Transparent AR passthrough
      scene.background = null;
      scene.fog = null;
    }
  };

  const generateStudioEnvironment = (renderer: THREE.WebGPURenderer): THREE.Texture => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = buildProceduralStudioEnvScene();
    envRenderTarget = pmrem.fromScene(envScene, 0.035);
    scene.environment = envRenderTarget.texture;
    // Clean up temporary env scene geometries & materials
    envScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    pmrem.dispose();
    return envRenderTarget.texture;
  };

  return {
    group,
    keyLight,
    fillLight,
    rimLight,
    hemiLight,
    plinthGroup,
    applyLightingPreset,
    setStudioBackdropVisible,
    generateStudioEnvironment,
    dispose: () => {
      envRenderTarget?.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      gridGeo.dispose();
      gridMat.dispose();
      plinthTopGeo.dispose();
      plinthMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      mountGeo.dispose();
      footGeo.dispose();
      mountMat.dispose();
    },
  };
}
