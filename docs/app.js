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

upscaleBtns.addEventListener('click', (e) => {
  const btn = e.target.closest('.upscale-btn');
  if (!btn) return;
  upscaleBtns.querySelectorAll('.upscale-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  upscaleValue = parseInt(btn.dataset.value);
});

// Range display
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

let currentFile = null;
let currentSvg = null;

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

  // Show original preview
  const reader = new FileReader();
  reader.onload = (e) => {
    originalPreview.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Show options & preview sections
  optionsSection.hidden = false;
  previewSection.hidden = false;
  downloadActions.hidden = true;

  // Clear SVG preview
  const existing = svgPreviewBox.querySelector('svg, img.svg-result');
  if (existing) existing.remove();
  spinner.classList.remove('active');
}

vectorizeBtn.addEventListener('click', async () => {
  if (!currentFile) return;

  vectorizeBtn.disabled = true;
  vectorizeBtn.textContent = upscaleValue > 1 ? `Upscaling ${upscaleValue}x then vectorizing…` : 'Vectorizing…';
  downloadActions.hidden = true;

  // Clear previous SVG
  const existing = svgPreviewBox.querySelector('svg, img.svg-result');
  if (existing) existing.remove();
  spinner.classList.add('active');

  const formData = new FormData();
  formData.append('icon', currentFile);
  formData.append('upscale', upscaleValue);
  formData.append('threshold', thresholdInput.value);
  formData.append('turdSize', turdSizeInput.value);
  formData.append('alphaMax', alphaMaxInput.value);
  formData.append('color', colorInput.value);
  formData.append('strokeMode', strokeModeInput.checked);
  formData.append('strokeWidth', strokeWidthInput.value);

  try {
    const res = await fetch('/vectorize', { method: 'POST', body: formData });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(data.error || 'Server error');
    }

    const svgText = await res.text();
    currentSvg = svgText;

    spinner.classList.remove('active');

    // Render SVG inline
    const container = document.createElement('div');
    container.innerHTML = svgText;
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

// Toast helper
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
