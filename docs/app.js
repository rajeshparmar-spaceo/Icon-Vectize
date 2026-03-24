const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const optionsSection = document.getElementById('optionsSection');
const previewSection = document.getElementById('previewSection');
const originalPreview = document.getElementById('originalPreview');
const svgPreviewBox = document.getElementById('svgPreviewBox');
const spinner = document.getElementById('spinner');
const vectorizeBtn = document.getElementById('vectorizeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const downloadActions = document.getElementById('downloadActions');

const thresholdInput = document.getElementById('threshold');
const turdSizeInput = document.getElementById('turdSize');
const alphaMaxInput = document.getElementById('alphaMax');
const colorInput = document.getElementById('color');
const upscaleBtns = document.getElementById('upscaleBtns');
const strokeModeInput = document.getElementById('strokeMode');
const strokeWidthInput = document.getElementById('strokeWidth');
const strokeWidthOption = document.getElementById('strokeWidthOption');

let upscaleValue = 1;
let currentFile = null;
let currentSvg = null;

upscaleBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('.upscale-btn');
  if (!btn) return;
  upscaleBtns.querySelectorAll('.upscale-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  upscaleValue = parseInt(btn.dataset.value);
});

thresholdInput.addEventListener('input', () => {
  document.getElementById('thresholdVal').textContent = thresholdInput.value;
});
turdSizeInput.addEventListener('input', () => {
  document.getElementById('turdSizeVal').textContent = turdSizeInput.value;
});
alphaMaxInput.addEventListener('input', () => {
  document.getElementById('alphaMaxVal').textContent = parseFloat(alphaMaxInput.value).toFixed(2);
});
strokeModeInput.addEventListener('change', () => {
  strokeWidthOption.hidden = !strokeModeInput.checked;
});
strokeWidthInput.addEventListener('input', () => {
  document.getElementById('strokeWidthVal').textContent = parseFloat(strokeWidthInput.value).toFixed(1);
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file (PNG, JPG, WEBP, GIF)');
    return;
  }
  currentFile = file;
  currentSvg = null;

  const reader = new FileReader();
  reader.onload = (e) => { originalPreview.src = e.target.result; };
  reader.readAsDataURL(file);

  optionsSection.hidden = false;
  previewSection.hidden = false;
  downloadActions.hidden = true;

  const existing = svgPreviewBox.querySelector('svg, img.svg-result');
  if (existing) existing.remove();
  spinner.classList.remove('active');
}

vectorizeBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  vectorizeBtn.disabled = true;
  vectorizeBtn.textContent = upscaleValue > 1 ? `Upscaling ${upscaleValue}x then vectorizing…` : 'Vectorizing…';
  downloadActions.hidden = true;

  const existing = svgPreviewBox.querySelector('svg, img.svg-result');
  if (existing) existing.remove();
  spinner.classList.add('active');

  try {
    const svg = await vectorizeInBrowser(currentFile, {
      upscale: upscaleValue,
      threshold: parseInt(thresholdInput.value),
      turdSize: parseInt(turdSizeInput.value),
      color: colorInput.value,
      strokeMode: strokeModeInput.checked,
      strokeWidth: parseFloat(strokeWidthInput.value),
    });

    currentSvg = svg;
    spinner.classList.remove('active');

    const container = document.createElement('div');
    container.innerHTML = svg;
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      svgEl.style.maxWidth = '80%';
      svgEl.style.maxHeight = '200px';
      svgPreviewBox.appendChild(svgEl);
    }

    downloadActions.hidden = false;
  } catch (err) {
    spinner.classList.remove('active');
    showToast('Error: ' + err.message);
  } finally {
    vectorizeBtn.disabled = false;
    vectorizeBtn.textContent = 'Vectorize';
  }
});

async function vectorizeInBrowser(file, opts) {
  const img = await loadImage(file);

  const scale = opts.upscale;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth * scale;
  canvas.height = img.naturalHeight * scale;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyThreshold(imageData, opts.threshold);
  if (opts.strokeMode) skeletonize(imageData);

  const traceOptions = {
    colorsampling: 0,
    numberofcolors: 2,
    pal: [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 0 }
    ],
    ltres: opts.strokeMode ? 0.5 : 1,
    qtres: opts.strokeMode ? 0.5 : 1,
    pathomit: opts.strokeMode ? 2 : opts.turdSize,
    rightangleenhance: true,
    strokewidth: 0,
    linefilter: false,
    desc: false,
    viewbox: true,
    scale: 1 / scale,
  };

  const svgStr = ImageTracer.imagedataToSVG(imageData, traceOptions);
  return postProcessSvg(svgStr, opts);
}

// Zhang-Suen thinning: reduces thick strokes to 1px centerlines
function skeletonize(imageData) {
  const w = imageData.width, h = imageData.height;
  const d = imageData.data;

  // Build binary grid: 1 = foreground (black), 0 = background
  const grid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grid[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  }

  function neighbors(x, y) {
    // p2..p9 in clockwise order starting from N
    return [
      grid[(y - 1) * w + x],      // N
      grid[(y - 1) * w + x + 1],  // NE
      grid[y * w + x + 1],        // E
      grid[(y + 1) * w + x + 1],  // SE
      grid[(y + 1) * w + x],      // S
      grid[(y + 1) * w + x - 1],  // SW
      grid[y * w + x - 1],        // W
      grid[(y - 1) * w + x - 1],  // NW
    ];
  }

  function transitions(p) {
    let n = 0;
    for (let i = 0; i < 8; i++) if (p[i] === 0 && p[(i + 1) % 8] === 1) n++;
    return n;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const toRemove = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!grid[y * w + x]) continue;
          const p = neighbors(x, y);
          const B = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
          if (B < 2 || B > 6) continue;
          if (transitions(p) !== 1) continue;
          if (step === 0) {
            if (p[0] * p[2] * p[4] !== 0) continue; // N*E*S must have a 0
            if (p[2] * p[4] * p[6] !== 0) continue; // E*S*W must have a 0
          } else {
            if (p[0] * p[2] * p[6] !== 0) continue; // N*E*W must have a 0
            if (p[0] * p[4] * p[6] !== 0) continue; // N*S*W must have a 0
          }
          toRemove.push(y * w + x);
        }
      }
      for (const idx of toRemove) { grid[idx] = 0; changed = true; }
    }
  }

  // Write skeleton back to imageData
  for (let i = 0; i < w * h; i++) {
    if (grid[i]) {
      d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
    } else {
      d[i * 4] = 255; d[i * 4 + 1] = 255; d[i * 4 + 2] = 255; d[i * 4 + 3] = 0;
    }
  }
}

function applyThreshold(imageData, threshold) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const alpha = d[i + 3];
    if (alpha < 128 || gray > threshold) {
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 0;
    } else {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255;
    }
  }
}

function postProcessSvg(svg, opts) {
  if (opts.strokeMode) {
    svg = svg.replace(/<path\b([^>]*?)\/?>/gi, (match, attrs) => {
      let newAttrs = attrs
        .replace(/\s+fill="[^"]*"/g, '')
        .replace(/\s+stroke="[^"]*"/g, '')
        .replace(/\s+stroke-width="[^"]*"/g, '')
        .replace(/\s+stroke-linecap="[^"]*"/g, '')
        .replace(/\s+stroke-linejoin="[^"]*"/g, '')
        .replace(/\s+fill-rule="[^"]*"/g, '');
      const selfClose = match.trimEnd().endsWith('/>') ? '/' : '';
      return `<path fill="none" stroke="${opts.color}" stroke-width="${opts.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${newAttrs}${selfClose}>`;
    });
  } else {
    svg = svg
      .replace(/fill="#000000"/gi, `fill="${opts.color}"`)
      .replace(/fill="rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)"/gi, `fill="${opts.color}"`);
  }
  return svg;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

downloadBtn.addEventListener('click', () => {
  if (!currentSvg) return;
  const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const baseName = currentFile.name.replace(/\.[^.]+$/, '');
  a.download = baseName + '.svg';
  a.click();
  URL.revokeObjectURL(url);
});

resetBtn.addEventListener('click', () => {
  currentFile = null;
  currentSvg = null;
  fileInput.value = '';
  optionsSection.hidden = true;
  previewSection.hidden = true;
  downloadActions.hidden = true;
  originalPreview.src = '';
  const existing = svgPreviewBox.querySelector('svg');
  if (existing) existing.remove();
});

let toastTimeout;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
}
