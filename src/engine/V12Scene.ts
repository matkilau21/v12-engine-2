import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA_PRESETS } from './constants';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { createV12Materials, type V12MaterialLibrary } from './materials';
import { createStudioRig, type StudioRig } from './studioEnvironment';
import { buildV12Engine, type V12AssemblyHandles } from './v12Geometry';
import { V12KinematicsSolver } from './v12Kinematics';
import { V12AcousticEngine } from './v12Audio';
import type {
  CameraPresetId,
  EngineControlState,
  FinishPresetId,
  LightingPresetId,
  RendererBackendKind,
  TelemetryData,
  ViewMode,
  XRModeSupport,
} from '../types/engine';

export interface V12SceneCallbacks {
  onReady: (backend: RendererBackendKind, xrSupport: XRModeSupport) => void;
  onTelemetry: (data: TelemetryData) => void;
  onPartSelected: (partId: string | null) => void;
  onXRSessionChange: (activeMode: 'none' | 'vr' | 'ar') => void;
  onError: (message: string) => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

// Module-scope reusable scratch objects (Zero-GC render loop)
const _pointerNdc = new THREE.Vector2();
const _xrRayOrigin = new THREE.Vector3();
const _xrRayDir = new THREE.Vector3();
const _xrTempMat = new THREE.Matrix4();

export class V12ShowcaseController {
  private container: HTMLElement;
  private callbacks: V12SceneCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGPURenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls | null = null;

  private textures: ProceduralTextureSet | null = null;
  private materials: V12MaterialLibrary | null = null;
  private studioRig: StudioRig | null = null;
  private engineHandles: V12AssemblyHandles | null = null;
  private solver: V12KinematicsSolver | null = null;
  private audio = new V12AcousticEngine();

  private xrStageGroup = new THREE.Group();
  private xrActiveMode: 'none' | 'vr' | 'ar' = 'none';
  private xrSession: XRSession | null = null;
  private xrControllers: THREE.Object3D[] = [];
  private xrSqueezingController: THREE.Object3D | null = null;
  private xrLastControllerX = 0;

  private controlState: EngineControlState;
  private selectedPartId: string | null = null;

  // Camera smooth transition state
  private cameraTransitionActive = false;
  private targetCamPos = new THREE.Vector3(1.18, 0.78, 1.28);
  private targetLookAt = new THREE.Vector3(0, 0.38, -0.02);

  // Raycasting & pointer gesture disambiguation
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = { x: 0, y: 0 };
  private lastHoverCheck = 0;

  // Timing & pacing
  private lastFrameTime = 0;
  private lastTelemetryEmit = 0;
  private softwareTimerId = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    initialState: EngineControlState,
    callbacks: V12SceneCallbacks
  ) {
    this.container = container;
    this.controlState = { ...initialState };
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0b0e);

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.04, 45);
    this.camera.position.set(1.18, 0.78, 1.28);

    this.raycaster.layers.set(1);
    this.xrStageGroup.name = 'XRStageGroup';
    this.scene.add(this.xrStageGroup);
  }

  public async init(): Promise<void> {
    if (this.disposed) return;

    try {
      const renderer = new THREE.WebGPURenderer({
        antialias: !this.isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
        forceWebGL: this.isSoftwareGl,
      });

      const width = Math.max(this.container.clientWidth, 1);
      const height = Math.max(this.container.clientHeight, 1);
      renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = !this.isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.xr.enabled = true;

      this.container.appendChild(renderer.domElement);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.outline = 'none';

      await renderer.init();
      if (this.disposed) {
        renderer.dispose();
        return;
      }

      this.renderer = renderer;

      // Detect actual active backend (WebGPU vs WebGL2 fallback)
      const backendObj = renderer.backend as unknown as {
        isWebGPUBackend?: boolean;
        device?: GPUDevice;
      };
      const backendKind: RendererBackendKind = backendObj?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

      // Listen for WebGPU device loss gracefully
      if (backendObj?.device?.lost) {
        backendObj.device.lost.then((info) => {
          if (!this.disposed && info.reason !== 'destroyed') {
            this.callbacks.onError('GPU device connection was reset. Reload to restore 3D view.');
          }
        });
      }

      // Listen for WebGL context loss/restore
      renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost, false);
      renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored, false);

      // Build procedural studio textures, materials, environment IBL, lighting & V12 assembly
      const maxAniso = this.isSoftwareGl ? 2 : 8;
      this.textures = createProceduralTextures(maxAniso);
      this.materials = createV12Materials(this.textures);
      this.studioRig = createStudioRig(this.scene, this.textures, this.isSoftwareGl);
      this.studioRig.generateStudioEnvironment(renderer);

      // Move studio plinth inside xrStageGroup so plinth & engine move/scale together in XR
      this.scene.remove(this.studioRig.plinthGroup);
      this.xrStageGroup.add(this.studioRig.plinthGroup);

      this.engineHandles = buildV12Engine(this.materials, !this.isSoftwareGl);
      this.xrStageGroup.add(this.engineHandles.root);

      this.solver = new V12KinematicsSolver(this.engineHandles, this.materials);

      // Apply initial configurator state
      this.materials.applyFinish(this.controlState.finish);
      this.materials.applyViewMode(this.controlState.viewMode);
      this.studioRig.applyLightingPreset(this.controlState.lighting, this.scene);

      // OrbitControls with physical damping (disabled damping on software WebGL)
      const controls = new OrbitControls(this.camera, renderer.domElement);
      controls.target.set(0, 0.38, -0.02);
      controls.enableDamping = !this.isSoftwareGl;
      controls.dampingFactor = 0.065;
      controls.enablePan = true;
      controls.minDistance = 0.42;
      controls.maxDistance = 3.8;
      controls.maxPolarAngle = Math.PI * 0.495;
      controls.rotateSpeed = 0.72;
      controls.zoomSpeed = 0.85;
      controls.addEventListener('start', this.handleControlStart);
      controls.update();
      this.controls = controls;

      // Setup WebXR interactive controller rays
      this.setupXRControllers(renderer);

      // Attach pointer & resize listeners
      window.addEventListener('resize', this.handleResize);
      renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
      renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
      renderer.domElement.addEventListener('pointermove', this.handlePointerMove);

      // Probe WebXR session availability
      const xrSupport = await this.probeWebXRSupport();

      // Pre-evaluate one kinematic tick so frame 0 has exact piston/rod alignment
      this.solver.update(
        0.016,
        this.controlState.rpm,
        this.controlState.isRunning,
        this.controlState.timeScale,
        this.controlState.explode
      );

      this.callbacks.onReady(backendKind, xrSupport);

      // Launch render loop (paced safely on software WebGL, native XR-compatible loop on GPUs)
      this.lastFrameTime = performance.now();
      if (this.isSoftwareGl) {
        this.runSoftwareLoop();
      } else {
        renderer.setAnimationLoop(this.tick);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to initialize 3D WebGPU/WebGL renderer.';
      this.callbacks.onError(msg);
    }
  }

  private async probeWebXRSupport(): Promise<XRModeSupport> {
    const xr = navigator.xr;
    if (!xr) return { ar: false, vr: false };
    try {
      const [ar, vr] = await Promise.all([
        xr.isSessionSupported('immersive-ar').catch(() => false),
        xr.isSessionSupported('immersive-vr').catch(() => false),
      ]);
      return { ar, vr };
    } catch {
      return { ar: false, vr: false };
    }
  }

  private setupXRControllers(renderer: THREE.WebGPURenderer) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2.5),
    ]);
    const lineMat = new THREE.LineBasicNodeMaterial({
      color: 0xe5482e,
      transparent: true,
      opacity: 0.75,
    });

    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      const rayLine = new THREE.Line(lineGeo, lineMat);
      rayLine.name = 'XRRayPointer';
      controller.add(rayLine);

      controller.addEventListener('selectstart', () => this.handleXRSelect(controller));
      controller.addEventListener('squeezestart', () => {
        this.xrSqueezingController = controller;
        this.xrLastControllerX = controller.position.x;
      });
      controller.addEventListener('squeezeend', () => {
        if (this.xrSqueezingController === controller) {
          this.xrSqueezingController = null;
        }
      });

      this.scene.add(controller);
      this.xrControllers.push(controller);
    }
  }

  private handleXRSelect(controller: THREE.Object3D) {
    if (!this.engineHandles) return;
    _xrTempMat.identity().extractRotation(controller.matrixWorld);
    _xrRayOrigin.setFromMatrixPosition(controller.matrixWorld);
    _xrRayDir.set(0, 0, -1).applyMatrix4(_xrTempMat).normalize();

    this.raycaster.set(_xrRayOrigin, _xrRayDir);
    const hits = this.raycaster.intersectObjects(this.engineHandles.root.children, true);
    const partId = this.extractPartId(hits);
    this.selectPart(partId);
  }

  public async enterXR(mode: 'immersive-ar' | 'immersive-vr'): Promise<void> {
    if (!this.renderer || !navigator.xr) return;
    try {
      if (this.xrSession) {
        await this.xrSession.end();
        return;
      }

      const sessionInit: XRSessionInit =
        mode === 'immersive-ar'
          ? {
              optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'dom-overlay'],
              domOverlay: { root: document.body },
            }
          : {
              optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
            };

      const session = await navigator.xr.requestSession(mode, sessionInit);
      this.xrSession = session;
      this.xrActiveMode = mode === 'immersive-ar' ? 'ar' : 'vr';

      session.addEventListener('end', () => {
        this.xrSession = null;
        this.xrActiveMode = 'none';
        this.xrSqueezingController = null;
        this.xrStageGroup.position.set(0, 0, 0);
        this.xrStageGroup.rotation.set(0, 0, 0);
        this.xrStageGroup.scale.setScalar(1);
        this.studioRig?.setStudioBackdropVisible(true);
        this.callbacks.onXRSessionChange('none');
      });

      await this.renderer.xr.setSession(session);

      // Position life-size V12 comfortably in front of viewer at waist/pedestal height
      this.xrStageGroup.position.set(0, 0.62, -1.18);
      this.xrStageGroup.scale.setScalar(this.controlState.xrScale);
      if (mode === 'immersive-ar') {
        this.studioRig?.setStudioBackdropVisible(false);
      }

      this.callbacks.onXRSessionChange(this.xrActiveMode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start WebXR session.';
      this.callbacks.onError(msg);
    }
  }

  public async exitXR(): Promise<void> {
    if (this.xrSession) {
      await this.xrSession.end();
    }
  }

  public updateState(partial: Partial<EngineControlState>) {
    const prevFinish = this.controlState.finish;
    const prevView = this.controlState.viewMode;
    const prevLight = this.controlState.lighting;
    const prevAudio = this.controlState.audioEnabled;
    const prevXrScale = this.controlState.xrScale;

    this.controlState = { ...this.controlState, ...partial };

    if (partial.finish && partial.finish !== prevFinish) {
      this.materials?.applyFinish(partial.finish as FinishPresetId);
    }
    if (partial.viewMode && partial.viewMode !== prevView) {
      this.materials?.applyViewMode(partial.viewMode as ViewMode);
    }
    if (partial.lighting && partial.lighting !== prevLight && this.xrActiveMode !== 'ar') {
      this.studioRig?.applyLightingPreset(partial.lighting as LightingPresetId, this.scene);
    }
    if (partial.audioEnabled !== undefined && partial.audioEnabled !== prevAudio) {
      void this.audio.setEnabled(partial.audioEnabled);
    }
    if (partial.xrScale !== undefined && partial.xrScale !== prevXrScale) {
      if (this.xrActiveMode !== 'none') {
        this.xrStageGroup.scale.setScalar(partial.xrScale);
      }
    }
  }

  public setCameraPreset(presetId: CameraPresetId) {
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.targetCamPos.set(preset.position[0], preset.position[1], preset.position[2]);
    this.targetLookAt.set(preset.target[0], preset.target[1], preset.target[2]);
    this.cameraTransitionActive = true;
  }

  public selectPart(partId: string | null) {
    this.selectedPartId = partId;
    this.materials?.setHighlightPart(partId);
    this.callbacks.onPartSelected(partId);
  }

  private extractPartId(hits: THREE.Intersection[]): string | null {
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (typeof obj.userData?.partId === 'string') {
          return obj.userData.partId;
        }
        obj = obj.parent;
      }
    }
    return null;
  }

  private handleControlStart = () => {
    // Cancel scripted camera transition immediately so we never fight manual orbiting
    this.cameraTransitionActive = false;
  };

  private handlePointerDown = (e: PointerEvent) => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (!this.renderer || !this.engineHandles) return;
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 36) return; // User was orbiting, not tapping a part

    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.engineHandles.root.children, true);
    const hitPart = this.extractPartId(hits);
    this.selectPart(hitPart === this.selectedPartId ? null : hitPart);
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.renderer || !this.engineHandles || this.isSoftwareGl) return;
    const now = performance.now();
    if (now - this.lastHoverCheck < 90) return; // Throttle pointermove raycast
    this.lastHoverCheck = now;

    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.engineHandles.root.children, true);
    const hitPart = this.extractPartId(hits);
    this.renderer.domElement.style.cursor = hitPart ? 'pointer' : 'grab';
  };

  private handleResize = () => {
    if (!this.renderer || this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onError('3D graphics context temporarily suspended.');
  };

  private handleContextRestored = () => {
    this.callbacks.onError('');
  };

  private tick = () => {
    if (this.disposed || !this.renderer || !this.solver) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    // 1. Update V12 mechanical kinematics
    const telemetry = this.solver.update(
      dt,
      this.controlState.rpm,
      this.controlState.isRunning,
      this.controlState.timeScale,
      this.controlState.explode
    );

    // 2. Update procedural Web Audio V12 synth
    this.audio.update(telemetry.rpm, this.controlState.isRunning);

    // 3. XR grip-to-rotate interaction
    if (this.xrActiveMode !== 'none' && this.xrSqueezingController) {
      const dx = this.xrSqueezingController.position.x - this.xrLastControllerX;
      this.xrStageGroup.rotation.y += dx * 3.8;
      this.xrLastControllerX = this.xrSqueezingController.position.x;
    }

    // 4. Smoothly damped desktop/mobile camera preset transition
    if (this.xrActiveMode === 'none' && this.controls) {
      if (this.cameraTransitionActive) {
        const lambda = 6.2;
        this.camera.position.x = THREE.MathUtils.damp(
          this.camera.position.x,
          this.targetCamPos.x,
          lambda,
          dt
        );
        this.camera.position.y = THREE.MathUtils.damp(
          this.camera.position.y,
          this.targetCamPos.y,
          lambda,
          dt
        );
        this.camera.position.z = THREE.MathUtils.damp(
          this.camera.position.z,
          this.targetCamPos.z,
          lambda,
          dt
        );

        this.controls.target.x = THREE.MathUtils.damp(
          this.controls.target.x,
          this.targetLookAt.x,
          lambda,
          dt
        );
        this.controls.target.y = THREE.MathUtils.damp(
          this.controls.target.y,
          this.targetLookAt.y,
          lambda,
          dt
        );
        this.controls.target.z = THREE.MathUtils.damp(
          this.controls.target.z,
          this.targetLookAt.z,
          lambda,
          dt
        );

        if (
          this.camera.position.distanceToSquared(this.targetCamPos) < 0.00015 &&
          this.controls.target.distanceToSquared(this.targetLookAt) < 0.00015
        ) {
          this.camera.position.copy(this.targetCamPos);
          this.controls.target.copy(this.targetLookAt);
          this.cameraTransitionActive = false;
        }
      }
      this.controls.update();
    }

    // 5. Render frame
    this.renderer.render(this.scene, this.camera);

    // 6. Emit throttled HUD telemetry (~15 Hz so React stays lightweight)
    if (now - this.lastTelemetryEmit >= 65) {
      this.lastTelemetryEmit = now;
      this.callbacks.onTelemetry(telemetry);
    }
  };

  /**
   * Software-WebGL safe pacing loop using WebGL2 fenceSync + 80ms breather so CPU rasterizers never starve the main thread.
   */
  private runSoftwareLoop = () => {
    if (this.disposed || !this.renderer) return;
    this.tick();

    const backendObj = this.renderer.backend as unknown as {
      gl?: WebGL2RenderingContext;
    };
    const gl = backendObj?.gl;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.softwareTimerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.softwareTimerId = window.setTimeout(this.runSoftwareLoop, 80);
        }
      };
      this.softwareTimerId = window.setTimeout(poll, 5);
    } else {
      this.softwareTimerId = window.setTimeout(this.runSoftwareLoop, 90);
    }
  };

  public dispose() {
    this.disposed = true;
    window.clearTimeout(this.softwareTimerId);
    window.removeEventListener('resize', this.handleResize);

    if (this.xrSession) {
      void this.xrSession.end().catch(() => {});
    }

    if (this.renderer) {
      this.renderer.setAnimationLoop(null);
      this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
      this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
      this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
      this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
      if (this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
      this.renderer.dispose();
      this.renderer = null;
    }

    this.controls?.dispose();
    this.audio.dispose();
    this.engineHandles?.dispose();
    this.studioRig?.dispose();
    this.materials?.dispose();
    this.textures?.dispose();
  }
}
