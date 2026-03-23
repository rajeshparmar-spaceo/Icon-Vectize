const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const potrace = require('potrace');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, WEBP, and GIF files are supported'));
    }
  }
});

app.post('/vectorize', upload.single('icon'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const options = {
      upscale: Math.min(parseInt(req.body.upscale) || 1, 8),
      threshold: parseInt(req.body.threshold) || 128,
      turdSize: parseInt(req.body.turdSize) || 2,
      alphaMax: parseFloat(req.body.alphaMax) || 1,
      color: req.body.color || '#000000',
      background: req.body.background || 'transparent',
      strokeMode: req.body.strokeMode === 'true',
      strokeWidth: parseFloat(req.body.strokeWidth) || 2,
    };

    // Step 1: Upscale using Lanczos3 for crisp edges
    let sharpPipeline = sharp(req.file.buffer).ensureAlpha();

    if (options.upscale > 1) {
      const metadata = await sharp(req.file.buffer).metadata();
      sharpPipeline = sharpPipeline.resize(
        metadata.width * options.upscale,
        metadata.height * options.upscale,
        { kernel: sharp.kernel.lanczos3 }
      );
    }

    // Step 2: Flatten transparency if needed, then greyscale
    if (options.background && options.background !== 'transparent') {
      sharpPipeline = sharpPipeline.flatten({ background: options.background });
    }

    const processedBuffer = await sharpPipeline
      .greyscale()
      .png()
      .toBuffer();

    // Write to a temp file (potrace works best with file paths)
    const tmpFile = path.join(os.tmpdir(), `icon_vectize_${Date.now()}.png`);
    fs.writeFileSync(tmpFile, processedBuffer);

    const potraceOptions = {
      threshold: options.threshold,
      turdSize: options.turdSize,
      alphaMax: options.alphaMax,
      color: options.color,
      background: options.background === 'transparent' ? 'transparent' : options.background,
    };

    potrace.trace(tmpFile, potraceOptions, (err, svg) => {
      // Clean up temp file
      fs.unlink(tmpFile, () => {});

      if (err) {
        console.error('Potrace error:', err);
        return res.status(500).json({ error: 'Vectorization failed: ' + err.message });
      }

      const finalSvg = options.strokeMode
        ? convertToStroke(svg, options.color, options.strokeWidth)
        : svg;

      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(finalSvg);
    });

  } catch (err) {
    console.error('Processing error:', err);
    res.status(500).json({ error: 'Image processing failed: ' + err.message });
  }
});

function convertToStroke(svg, color, strokeWidth) {
  return svg.replace(/<path\b([^>]*?)\/?>/gi, (match, attrs) => {
    let newAttrs = attrs
      .replace(/\s+fill="[^"]*"/g, '')
      .replace(/\s+stroke="[^"]*"/g, '')
      .replace(/\s+fill-rule="[^"]*"/g, '');
    const selfClose = match.trimEnd().endsWith('/>') ? '/' : '';
    return `<path fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${newAttrs}${selfClose}>`;
  });
}

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'Upload error: ' + err.message });
  }
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Icon Vectize running at http://localhost:${PORT}`);
});
