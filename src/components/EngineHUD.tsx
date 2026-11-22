import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  Gauge,
  Glasses,
  Layers,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { CAMERA_PRESETS, FINISH_PRESETS, INSPECTABLE_PARTS, V12_SPEC } from '../engine/constants';
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

type DockTab = 'drive' | 'inspect' | 'finish' | 'view';

interface EngineHUDProps {
  state: EngineControlState;
  telemetry: TelemetryData;
  backend: RendererBackendKind;
  xrSupport: XRModeSupport;
  xrActiveMode: 'none' | 'vr' | 'ar';
  selectedPartId: string | null;
  activeCamera: CameraPresetId;
  errorMessage: string | null;
  isReady: boolean;
  onUpdateState: (partial: Partial<EngineControlState>) => void;
  onSelectCamera: (id: CameraPresetId) => void;
  onSelectPart: (partId: string | null) => void;
  onEnterXR: (mode: 'immersive-ar' | 'immersive-vr') => void;
  onExitXR: () => void;
  onResetAll: () => void;
}

const RPM_PRESETS = [
  { label: 'Idle', rpm: 950 },
  { label: 'Cruise', rpm: 3400 },
  { label: 'Track', rpm: 6800 },
  { label: 'Redline', rpm: 9200 },
] as const;

const TIME_SCALES = [
  { label: '0.1×', value: 0.1 },
  { label: '0.35×', value: 0.35 },
  { label: '1×', value: 1.0 },
] as const;

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'cutaway', label: 'Cutaway' },
  { id: 'xray', label: 'X-Ray' },
];

const LIGHTING_PRESETS: { id: LightingPresetId; label: string }[] = [
  { id: 'obsidian', label: 'Obsidian' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'dyno', label: 'Dyno' },
];

const QUICK_PARTS = [
  { id: 'intake', label: 'Intake' },
  { id: 'valvetrain', label: 'Valvetrain' },
  { id: 'pistons', label: 'Pistons' },
  { id: 'crankshaft', label: 'Crankshaft' },
  { id: 'exhaust', label: 'Headers' },
] as const;

export const EngineHUD: React.FC<EngineHUDProps> = ({
  state,
  telemetry,
  backend,
  xrSupport,
  xrActiveMode,
  selectedPartId,
  activeCamera,
  errorMessage,
  isReady,
  onUpdateState,
  onSelectCamera,
  onSelectPart,
  onEnterXR,
  onExitXR,
  onResetAll,
}) => {
  const [activeTab, setActiveTab] = useState<DockTab>('drive');
  const [collapsed, setCollapsed] = useState(false);
  const [showXrInfo, setShowXrInfo] = useState(false);

  const selectedPart = selectedPartId ? INSPECTABLE_PARTS[selectedPartId] : null;
  const finishList = Object.values(FINISH_PRESETS);

  const handleXrAction = () => {
    if (xrActiveMode !== 'none') {
      onExitXR();
      return;
    }
    if (xrSupport.ar) {
      onEnterXR('immersive-ar');
    } else if (xrSupport.vr) {
      onEnterXR('immersive-vr');
    } else {
      setShowXrInfo((prev) => !prev);
    }
  };

  const xrButtonLabel =
    xrActiveMode !== 'none'
      ? 'Exit XR'
      : xrSupport.ar
        ? 'Enter AR'
        : xrSupport.vr
          ? 'Enter VR'
          : 'WebXR';

  // Keyboard shortcut H to toggle Cinema / Zen mode
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'h' || e.key === 'H') {
        setCollapsed((c) => !c);
      } else if (e.key === ' ') {
        e.preventDefault();
        onUpdateState({ isRunning: !state.isRunning });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUpdateState, state.isRunning]);

  const rpmRatio = Math.min(telemetry.rpm / V12_SPEC.MAX_RPM, 1);
  const isNearRedline = telemetry.rpm >= V12_SPEC.REDLINE_RPM;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* Top Bar: Minimal Identity Left + Utility Actions Right */}
      <header className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto flex flex-col gap-0.5">
          <h1
            className="text-lg sm:text-xl font-semibold tracking-tight text-[#F4F5F7] whitespace-nowrap leading-none"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Valkyr V12
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-[#A3AAB7] font-mono tabular-nums whitespace-nowrap">
            <span>6.5L 60° NA</span>
            <span aria-hidden="true">·</span>
            <span>{backend}</span>
            {xrActiveMode !== 'none' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#E5482E]">{xrActiveMode.toUpperCase()} Active</span>
              </>
            )}
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onUpdateState({ audioEnabled: !state.audioEnabled })}
            aria-label={state.audioEnabled ? 'Mute engine audio' : 'Enable engine audio'}
            title={state.audioEnabled ? 'Mute Audio' : 'Engine Sound'}
            className={`inline-flex h-10 sm:h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#E5482E] ${
              state.audioEnabled
                ? 'border-[#E5482E]/70 bg-[#E5482E]/15 text-[#F4F5F7]'
                : 'border-white/10 bg-[#0F1116]/90 text-[#C2C7D1] hover:border-white/25 hover:text-white'
            }`}
          >
            {state.audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <span className="hidden sm:inline">{state.audioEnabled ? 'Sound On' : 'Sound'}</span>
          </button>

          <button
            type="button"
            onClick={handleXrAction}
            className={`inline-flex h-10 sm:h-9 items-center gap-1.5 rounded-lg border px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#E5482E] ${
              xrActiveMode !== 'none'
                ? 'border-[#E5482E] bg-[#E5482E] text-white'
                : 'border-white/12 bg-[#141720]/92 text-[#F4F5F7] hover:border-white/30'
            }`}
          >
            <Glasses className="h-4 w-4" />
            <span>{xrButtonLabel}</span>
          </button>
        </div>
      </header>

      {/* Non-XR browser helpful WebXR sheet (only shown on click when no headset present) */}
      {showXrInfo && xrActiveMode === 'none' && (
        <div className="pointer-events-auto self-end mt-2 w-72 rounded-xl border border-white/10 bg-[#0F1116]/95 p-3.5 text-xs text-[#C8CDD6] shadow-2xl">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-medium text-[#F4F5F7]" style={{ fontFamily: 'var(--font-display)' }}>
              WebXR Spatial Mode
            </span>
            <button
              type="button"
              onClick={() => setShowXrInfo(false)}
              aria-label="Close WebXR info"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#9CA3AF] hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="leading-relaxed text-[#9DA5B4]">
            No VR/AR headset detected in this browser. Open this page on Apple Vision Pro, Meta Quest, or an AR-capable mobile browser to inspect the 1:1 scale V12 in your space with controller ray-picking and grip rotation.
          </p>
        </div>
      )}

      {/* Loading or Error Banner */}
      {!isReady && !errorMessage && (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <div className="rounded-xl border border-white/10 bg-[#0F1116]/95 px-5 py-3 text-xs text-[#C8CDD6] font-mono">
            Initializing WebGPU Powertrain Studio...
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="pointer-events-auto mx-auto max-w-md rounded-xl border border-[#E5482E]/50 bg-[#1B1112]/95 px-4 py-3 text-xs text-[#F4D5D0]">
          {errorMessage}
        </div>
      )}

      {/* Bottom Stack: Optional Engineering Callout + Collapsible Unified Control Dock */}
      <div className="mt-auto flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)]">
        {/* Compact Part Inspection Callout (only shown when a 3D mechanical assembly is tapped) */}
        {selectedPart && !collapsed && (
          <div className="pointer-events-auto w-full max-w-[760px] rounded-xl border border-white/10 bg-[#0F1116]/94 px-4 py-3 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h2
                    className="text-sm font-semibold text-[#F4F5F7]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {selectedPart.name}
                  </h2>
                  <span className="text-[11px] text-[#949CA9]">{selectedPart.subsystem}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#B8BFC9]">
                  {selectedPart.engineeringNote}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums text-[#8F97A6]">
                  <span>{selectedPart.materialSpec}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#F4F5F7]">
                    {selectedPart.metricLabel}: {selectedPart.metricValue}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectPart(null)}
                aria-label="Close part specification"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9DA5B4] hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Collapse / Expand Cinema Mode Handle */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="inline-flex h-8 items-center gap-1.5 rounded-t-lg rounded-b-lg border border-white/10 bg-[#0F1116]/90 px-3 text-[11px] font-medium text-[#B8BFC9] hover:border-white/25 hover:text-white transition-colors whitespace-nowrap"
          >
            {collapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>Controls</span>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span className="font-mono tabular-nums text-[#F4F5F7]">
                  {telemetry.rpm.toLocaleString()} RPM
                </span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        {/* Main Unified Bottom Dock */}
        <div
          className={`pointer-events-auto w-full max-w-[760px] overflow-hidden rounded-2xl border border-white/10 bg-[#0F1116]/94 shadow-2xl transition-all duration-200 ease-out ${
            collapsed
              ? 'max-h-0 opacity-0 translate-y-4 border-transparent pointer-events-none'
              : 'max-h-[340px] opacity-100 translate-y-0'
          }`}
        >
          {/* Quiet Top Telemetry Strip + Tab Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-3 py-2 sm:px-4">
            {/* Segmented Tab Switcher */}
            <nav
              aria-label="Engine showcase controls"
              className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5"
            >
              {(
                [
                  { id: 'drive', label: 'Drive', Icon: Gauge },
                  { id: 'inspect', label: 'Inspect', Icon: Layers },
                  { id: 'finish', label: 'Finish', Icon: Palette },
                  { id: 'view', label: 'View', Icon: Camera },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`inline-flex h-8 sm:h-8 items-center gap-1.5 rounded-md px-2.5 sm:px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#E5482E] ${
                      active
                        ? 'bg-[#222631] text-[#F4F5F7]'
                        : 'text-[#9BA3B2] hover:text-[#E5E8EE]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Unboxed Tabular Live Mechanical Readout */}
            <div className="flex items-center gap-2 sm:gap-3 font-mono text-[11px] sm:text-xs tabular-nums text-[#9EA6B5] whitespace-nowrap">
              <span className={isNearRedline ? 'text-[#E5482E] font-semibold' : 'text-[#F4F5F7] font-medium'}>
                {telemetry.rpm.toLocaleString()} RPM
              </span>
              <span aria-hidden="true" className="text-white/20">·</span>
              <span>{telemetry.horsepower} HP</span>
              <span aria-hidden="true" className="hidden sm:inline text-white/20">·</span>
              <span className="hidden sm:inline">{telemetry.torqueNm} Nm</span>
              <span aria-hidden="true" className="hidden md:inline text-white/20">·</span>
              <span className="hidden md:inline">CYL {telemetry.firingCylinder}</span>
              <span aria-hidden="true" className="hidden md:inline text-white/20">·</span>
              <span className="hidden md:inline">{telemetry.exhaustTempC}°C</span>
            </div>
          </div>

          {/* Active Tab Panel Body */}
          <div className="px-3.5 py-3 sm:px-4 sm:py-3.5">
            {activeTab === 'drive' && (
              <div className="flex flex-col gap-3">
                {/* RPM Throttle Bar + Play/Pause */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onUpdateState({ isRunning: !state.isRunning })}
                    aria-label={state.isRunning ? 'Pause engine' : 'Start engine'}
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-[#E5482E] ${
                      state.isRunning
                        ? 'border-[#E5482E]/70 bg-[#E5482E] text-white'
                        : 'border-white/15 bg-white/[0.06] text-[#F4F5F7] hover:bg-white/12'
                    }`}
                  >
                    {state.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] text-[#9EA6B5] mb-1">
                      <span>Throttle</span>
                      <span className="font-mono tabular-nums text-[#C8CDD6]">
                        {telemetry.throttlePct}% · {telemetry.crankDeg}° Cycle
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <div className="pointer-events-none absolute left-0 right-0 h-1 rounded-full overflow-hidden bg-white/10">
                        <div
                          className="h-full transition-all duration-75"
                          style={{
                            width: `${rpmRatio * 100}%`,
                            backgroundColor: isNearRedline ? '#E5482E' : '#F4F5F7',
                          }}
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={V12_SPEC.MAX_RPM}
                        step={50}
                        value={state.rpm}
                        aria-label="Engine RPM"
                        onChange={(e) =>
                          onUpdateState({
                            rpm: Number(e.target.value),
                            isRunning: Number(e.target.value) > 0,
                          })
                        }
                        className="engine-slider relative z-10 w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* RPM Presets + Slow-Motion Time Scale */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {RPM_PRESETS.map((p) => {
                      const active = state.isRunning && Math.abs(state.rpm - p.rpm) < 250;
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => onUpdateState({ rpm: p.rpm, isRunning: true })}
                          className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'border-[#E5482E]/80 bg-[#E5482E]/18 text-[#F4F5F7]'
                              : 'border-white/10 bg-white/[0.03] text-[#B0B7C5] hover:border-white/20 hover:text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5">
                    <span className="px-2 text-[11px] text-[#8E96A6] hidden sm:inline">Speed</span>
                    {TIME_SCALES.map((ts) => (
                      <button
                        key={ts.label}
                        type="button"
                        onClick={() => onUpdateState({ timeScale: ts.value })}
                        className={`h-7 rounded-md px-2.5 font-mono text-[11px] tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                          state.timeScale === ts.value
                            ? 'bg-[#252A36] text-[#F4F5F7]'
                            : 'text-[#9BA3B2] hover:text-white'
                        }`}
                      >
                        {ts.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'inspect' && (
              <div className="flex flex-col gap-3">
                {/* Exploded Assembly Slider + View Mode */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] text-[#9EA6B5] mb-1">
                      <span>Exploded Assembly</span>
                      <span className="font-mono tabular-nums text-[#F4F5F7]">
                        {Math.round(state.explode * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={state.explode}
                      aria-label="Exploded view separation"
                      onChange={(e) => onUpdateState({ explode: Number(e.target.value) })}
                      className="engine-slider w-full"
                    />
                  </div>

                  <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5 shrink-0">
                    {VIEW_MODES.map((vm) => (
                      <button
                        key={vm.id}
                        type="button"
                        onClick={() => onUpdateState({ viewMode: vm.id })}
                        className={`inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          state.viewMode === vm.id
                            ? 'bg-[#E5482E] text-white'
                            : 'text-[#A8B0BE] hover:text-white'
                        }`}
                      >
                        {vm.id === 'xray' && <Eye className="h-3.5 w-3.5" />}
                        <span>{vm.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tap-to-Inspect Quick Subsystems */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-[11px] text-[#8E96A6] mr-1 whitespace-nowrap">
                    Subsystems:
                  </span>
                  {QUICK_PARTS.map((part) => {
                    const active = selectedPartId === part.id;
                    return (
                      <button
                        key={part.id}
                        type="button"
                        onClick={() => onSelectPart(active ? null : part.id)}
                        className={`h-8 rounded-lg border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'border-[#E5482E] bg-[#E5482E]/18 text-[#F4F5F7]'
                            : 'border-white/10 bg-white/[0.03] text-[#B0B7C5] hover:border-white/25 hover:text-white'
                        }`}
                      >
                        {part.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'finish' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {finishList.map((preset) => {
                  const active = state.finish === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onUpdateState({ finish: preset.id as FinishPresetId })}
                      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[#E5482E] ${
                        active
                          ? 'border-[#E5482E] bg-white/[0.07]'
                          : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                      }`}
                    >
                      <span
                        className="h-6 w-6 shrink-0 rounded-full border border-white/25"
                        style={{
                          background: `linear-gradient(135deg, ${preset.swatch} 55%, ${preset.accentSwatch} 55%)`,
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-[#F4F5F7]">
                          {preset.name}
                        </span>
                        <span className="block truncate text-[10px] text-[#8F97A6]">
                          {preset.subtitle.split('·')[0].trim()}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {activeTab === 'view' && (
              <div className="flex flex-col gap-2.5">
                {/* Camera Angles */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {CAMERA_PRESETS.map((cam) => {
                    const active = activeCamera === cam.id;
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => onSelectCamera(cam.id)}
                        className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'border-[#E5482E] bg-[#E5482E]/18 text-[#F4F5F7]'
                            : 'border-white/10 bg-white/[0.03] text-[#B0B7C5] hover:border-white/25 hover:text-white'
                        }`}
                      >
                        {cam.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={onResetAll}
                    title="Reset showcase"
                    className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-xs text-[#A8B0BE] hover:border-white/25 hover:text-white whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* Studio Lighting Mood & XR Scale */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-lg bg-white/[0.04] p-0.5">
                    <span className="px-2 text-[11px] text-[#8E96A6]">Studio</span>
                    {LIGHTING_PRESETS.map((lp) => (
                      <button
                        key={lp.id}
                        type="button"
                        onClick={() => onUpdateState({ lighting: lp.id })}
                        className={`h-7 rounded-md px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 ${
                          state.lighting === lp.id
                            ? 'bg-[#252A36] text-[#F4F5F7]'
                            : 'text-[#9BA3B2] hover:text-white'
                        }`}
                      >
                        {lp.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#8E96A6]">
                    <span>XR Scale</span>
                    {[0.5, 1.0, 1.25].map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => onUpdateState({ xrScale: sc })}
                        className={`h-7 rounded-md px-2 font-mono tabular-nums transition-colors ${
                          state.xrScale === sc
                            ? 'bg-[#252A36] text-[#F4F5F7]'
                            : 'bg-white/[0.03] text-[#9BA3B2] hover:text-white'
                        }`}
                      >
                        {Math.round(sc * 100)}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
