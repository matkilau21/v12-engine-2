/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { V12ShowcaseController } from './engine/V12Scene';
import { V12_SPEC } from './engine/constants';
import { EngineHUD } from './components/EngineHUD';
import type {
  CameraPresetId,
  EngineControlState,
  RendererBackendKind,
  TelemetryData,
  XRModeSupport,
} from './types/engine';

const INITIAL_ENGINE_STATE: EngineControlState = {
  isRunning: true,
  rpm: 1650,
  timeScale: 1.0,
  explode: 0,
  viewMode: 'cutaway',
  finish: 'rosso',
  lighting: 'obsidian',
  audioEnabled: false,
  xrScale: 1.0,
};

const INITIAL_TELEMETRY: TelemetryData = {
  rpm: 1650,
  horsepower: 112,
  torqueNm: 486,
  firingCylinder: 1,
  exhaustTempC: 310,
  throttlePct: 22,
  crankDeg: 0,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<V12ShowcaseController | null>(null);

  const [engineState, setEngineState] = useState<EngineControlState>(INITIAL_ENGINE_STATE);
  const [telemetry, setTelemetry] = useState<TelemetryData>(INITIAL_TELEMETRY);
  const [backend, setBackend] = useState<RendererBackendKind>('Initializing');
  const [xrSupport, setXrSupport] = useState<XRModeSupport>({ ar: false, vr: false });
  const [xrActiveMode, setXrActiveMode] = useState<'none' | 'vr' | 'ar'>('none');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [activeCamera, setActiveCamera] = useState<CameraPresetId>('studio');
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Mount WebGPU / WebXR Three.js scene once in isolated ref container
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const controller = new V12ShowcaseController(container, INITIAL_ENGINE_STATE, {
      onReady: (detectedBackend, detectedXr) => {
        setBackend(detectedBackend);
        setXrSupport(detectedXr);
        setIsReady(true);
      },
      onTelemetry: (data) => {
        setTelemetry(data);
      },
      onPartSelected: (partId) => {
        setSelectedPartId(partId);
      },
      onXRSessionChange: (mode) => {
        setXrActiveMode(mode);
      },
      onError: (msg) => {
        setErrorMessage(msg || null);
      },
    });

    controllerRef.current = controller;
    void controller.init();

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  const handleUpdateState = useCallback((partial: Partial<EngineControlState>) => {
    setEngineState((prev) => {
      const next = { ...prev, ...partial };
      controllerRef.current?.updateState(partial);
      return next;
    });
  }, []);

  const handleSelectCamera = useCallback((id: CameraPresetId) => {
    setActiveCamera(id);
    controllerRef.current?.setCameraPreset(id);
  }, []);

  const handleSelectPart = useCallback((partId: string | null) => {
    setSelectedPartId(partId);
    controllerRef.current?.selectPart(partId);
  }, []);

  const handleEnterXR = useCallback((mode: 'immersive-ar' | 'immersive-vr') => {
    void controllerRef.current?.enterXR(mode);
  }, []);

  const handleExitXR = useCallback(() => {
    void controllerRef.current?.exitXR();
  }, []);

  const handleResetAll = useCallback(() => {
    const resetState: EngineControlState = {
      ...INITIAL_ENGINE_STATE,
      rpm: V12_SPEC.IDLE_RPM + 700,
    };
    setEngineState(resetState);
    setActiveCamera('studio');
    setSelectedPartId(null);
    controllerRef.current?.updateState(resetState);
    controllerRef.current?.selectPart(null);
    controllerRef.current?.setCameraPreset('studio');
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0A0B0E]">
      {/* Dedicated isolated 3D WebGPU / WebXR canvas container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Interactive 3D 6.5L V12 Engine Viewport"
      />

      {/* Minimal semantic HUD overlay */}
      <EngineHUD
        state={engineState}
        telemetry={telemetry}
        backend={backend}
        xrSupport={xrSupport}
        xrActiveMode={xrActiveMode}
        selectedPartId={selectedPartId}
        activeCamera={activeCamera}
        errorMessage={errorMessage}
        isReady={isReady}
        onUpdateState={handleUpdateState}
        onSelectCamera={handleSelectCamera}
        onSelectPart={handleSelectPart}
        onEnterXR={handleEnterXR}
        onExitXR={handleExitXR}
        onResetAll={handleResetAll}
      />
    </main>
  );
}
