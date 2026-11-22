import * as THREE from 'three/webgpu';

export interface ProceduralTextureSet {
  carbonAlbedo: THREE.CanvasTexture;
  carbonBump: THREE.CanvasTexture;
  crinkleBump: THREE.CanvasTexture;
  brushedBump: THREE.CanvasTexture;
  castGrainBump: THREE.CanvasTexture;
  exhaustHeatMap: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  floorGrid: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureRepeat(
  tex: THREE.CanvasTexture,
  repeatX: number,
  repeatY: number,
  isColor: boolean,
  anisotropy: number
): THREE.CanvasTexture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates authentic 2x2 twill carbon fiber weave albedo + bump maps.
 */
function createCarbonFiberTextures(anisotropy: number): {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 256;
  const [cColor, ctxC] = makeCanvas(size, size);
  const [cBump, ctxB] = makeCanvas(size, size);

  ctxC.fillStyle = '#14161a';
  ctxC.fillRect(0, 0, size, size);
  ctxB.fillStyle = '#606060';
  ctxB.fillRect(0, 0, size, size);

  const cell = 16; // 16x16 grid of 2x2 twill blocks
  const count = size / cell;

  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      // 2x2 twill diagonal step
      const phase = (x + y) % 4;
      const isWarp = phase < 2;
      const px = x * cell;
      const py = y * cell;

      if (isWarp) {
        const gradC = ctxC.createLinearGradient(px, py, px + cell, py);
        gradC.addColorStop(0, '#101216');
        gradC.addColorStop(0.5, '#353942');
        gradC.addColorStop(1, '#101216');
        ctxC.fillStyle = gradC;
        ctxC.fillRect(px + 0.5, py + 0.5, cell - 1, cell - 1);

        const gradB = ctxB.createLinearGradient(px, py, px + cell, py);
        gradB.addColorStop(0, '#444444');
        gradB.addColorStop(0.5, '#d8d8d8');
        gradB.addColorStop(1, '#444444');
        ctxB.fillStyle = gradB;
        ctxB.fillRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      } else {
        const gradC = ctxC.createLinearGradient(px, py, px, py + cell);
        gradC.addColorStop(0, '#0d0f12');
        gradC.addColorStop(0.5, '#262a31');
        gradC.addColorStop(1, '#0d0f12');
        ctxC.fillStyle = gradC;
        ctxC.fillRect(px + 0.5, py + 0.5, cell - 1, cell - 1);

        const gradB = ctxB.createLinearGradient(px, py, px, py + cell);
        gradB.addColorStop(0, '#3a3a3a');
        gradB.addColorStop(0.5, '#b0b0b0');
        gradB.addColorStop(1, '#3a3a3a');
        ctxB.fillStyle = gradB;
        ctxB.fillRect(px + 0.5, py + 0.5, cell - 1, cell - 1);
      }
    }
  }

  return {
    albedo: configureRepeat(new THREE.CanvasTexture(cColor), 6, 6, true, anisotropy),
    bump: configureRepeat(new THREE.CanvasTexture(cBump), 6, 6, false, anisotropy),
  };
}

/**
 * Fine Italian crinkle / wrinkle powder-coat bump map for cam covers.
 */
function createCrinkleBumpTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  // Deterministic pseudo-random pebble noise
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(85 + rand() * 140);
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Add subtle micro-wrinkle ridges
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 420; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 5;
    const ang = rand() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  return configureRepeat(new THREE.CanvasTexture(canvas), 7, 7, false, anisotropy);
}

/**
 * Directional brushed / CNC billet aluminum micro-streak texture.
 */
function createBrushedMetalTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  let seed = 4201;
  const rand = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let y = 0; y < size; y++) {
    const shade = Math.floor(105 + rand() * 48);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, size, 1);
  }

  // Fine machining passes
  for (let i = 0; i < 160; i++) {
    const y = rand() * size;
    const alpha = 0.08 + rand() * 0.12;
    ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    ctx.fillRect(0, y, size, 1);
  }

  return configureRepeat(new THREE.CanvasTexture(canvas), 4, 4, false, anisotropy);
}

/**
 * Sand-cast alloy micro-pitted surface grain for engine block & dry-sump pan.
 */
function createCastGrainTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const data = img.data;

  let seed = 9187;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < size * size; i++) {
    const n1 = rand();
    const n2 = rand();
    const v = Math.floor(100 + ((n1 + n2) * 0.5) * 90);
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  return configureRepeat(new THREE.CanvasTexture(canvas), 6, 6, false, anisotropy);
}

/**
 * Heat-cycled titanium/Inconel exhaust patina texture (subtle straw -> violet -> silver).
 */
function createExhaustHeatMap(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 64);
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.0, '#c8a98a'); // straw gold near port
  grad.addColorStop(0.18, '#a68c9a'); // subtle heat rose/violet
  grad.addColorStop(0.32, '#8b99b4'); // tempered titanium blue
  grad.addColorStop(0.55, '#b8b0a4'); // satin raw inconel
  grad.addColorStop(0.82, '#c4a882'); // collector warm straw
  grad.addColorStop(1.0, '#9ba4b2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 64);

  // Subtle circumferential TIG weld bands
  const weldPositions = [48, 118, 188, 226];
  for (const wx of weldPositions) {
    const wGrad = ctx.createLinearGradient(wx - 4, 0, wx + 4, 0);
    wGrad.addColorStop(0, 'rgba(60, 75, 115, 0)');
    wGrad.addColorStop(0.5, 'rgba(72, 86, 130, 0.35)');
    wGrad.addColorStop(1, 'rgba(60, 75, 115, 0)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(wx - 4, 0, 8, 64);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft radial contact shadow plane map for grounding the engine & plinth.
 */
function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const grad = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.48);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
  grad.addColorStop(0.48, 'rgba(0, 0, 0, 0.48)');
  grad.addColorStop(0.78, 'rgba(0, 0, 0, 0.14)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Subtle automotive engineering studio floor calibration rings.
 */
function createFloorGridTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Concentric technical turntable measurement rings
  const radii = [180, 260, 355, 450];
  radii.forEach((r, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = idx === 1 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
    ctx.lineWidth = idx === 1 ? 1.5 : 1;
    ctx.stroke();
  });

  // Fine degree tick marks on outer calibration ring
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const r0 = isMajor ? 344 : 350;
    const r1 = 355;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * r0, cy + Math.sin(rad) * r0);
    ctx.lineTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
    ctx.strokeStyle = isMajor ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.stroke();
  }

  // Axis crosshairs (subtle)
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 460, cy);
  ctx.lineTo(cx + 460, cy);
  ctx.moveTo(cx, cy - 460);
  ctx.lineTo(cx, cy + 460);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(maxAnisotropy = 8): ProceduralTextureSet {
  const anisotropy = Math.min(maxAnisotropy, 16);
  const carbon = createCarbonFiberTextures(anisotropy);
  const crinkleBump = createCrinkleBumpTexture(anisotropy);
  const brushedBump = createBrushedMetalTexture(anisotropy);
  const castGrainBump = createCastGrainTexture(anisotropy);
  const exhaustHeatMap = createExhaustHeatMap(anisotropy);
  const contactShadow = createContactShadowTexture();
  const floorGrid = createFloorGridTexture(anisotropy);

  return {
    carbonAlbedo: carbon.albedo,
    carbonBump: carbon.bump,
    crinkleBump,
    brushedBump,
    castGrainBump,
    exhaustHeatMap,
    contactShadow,
    floorGrid,
    dispose: () => {
      carbon.albedo.dispose();
      carbon.bump.dispose();
      crinkleBump.dispose();
      brushedBump.dispose();
      castGrainBump.dispose();
      exhaustHeatMap.dispose();
      contactShadow.dispose();
      floorGrid.dispose();
    },
  };
}
