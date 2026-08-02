#!/usr/bin/env node
/**
 * serve-model.js
 *
 * Serves the Ollama gemma4:e2b blob over HTTP so the Android device can
 * download it without a HuggingFace token or internet access.
 *
 * Usage:  node scripts/serve-model.js
 *         npm run serve-model
 *
 * The device (emulator or USB) calls  http://10.0.2.2:9999/model.gguf
 * Your Mac receives it as             http://localhost:9999/model.gguf
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 9999;
const MANIFEST_PATH = path.join(
  os.homedir(),
  '.ollama/models/manifests/registry.ollama.ai/library/gemma4/e2b',
);
const BLOBS_DIR = path.join(os.homedir(), '.ollama/models/blobs');

// ── Resolve the model blob path from the manifest ───────────────────────────

function findModelBlob() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌  Manifest not found:', MANIFEST_PATH);
    console.error('   Make sure you have run: ollama pull gemma4:e2b');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const modelLayer = manifest.layers.find(
    (l) => l.mediaType && l.mediaType.includes('model'),
  );
  if (!modelLayer) {
    console.error('❌  No model layer found in manifest.');
    process.exit(1);
  }

  // digest is "sha256:abc123..." → filename is "sha256-abc123..."
  const blobName = modelLayer.digest.replace(':', '-');
  const blobPath = path.join(BLOBS_DIR, blobName);

  if (!fs.existsSync(blobPath)) {
    console.error('❌  Blob file not found:', blobPath);
    process.exit(1);
  }

  return { blobPath, size: modelLayer.size };
}

// ── HTTP server ──────────────────────────────────────────────────────────────

const { blobPath, size } = findModelBlob();
const sizeMB = (size / 1024 / 1024).toFixed(0);

const server = http.createServer((req, res) => {
  if (req.url !== '/model.gguf') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const stat = fs.statSync(blobPath);
  const range = req.headers.range;

  if (range) {
    // Support range requests so expo-file-system can resume interrupted downloads
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'application/octet-stream',
    });
    fs.createReadStream(blobPath, { start, end }).pipe(res);
    console.log(`  ↳ Range ${start}–${end} (${(chunkSize / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
    });
    const stream = fs.createReadStream(blobPath);
    let sent = 0;
    stream.on('data', (chunk) => {
      sent += chunk.length;
      process.stdout.write(
        `\r  Serving… ${(sent / 1024 / 1024).toFixed(0)} / ${sizeMB} MB  (${Math.round((sent / size) * 100)}%)  `,
      );
    });
    stream.on('end', () => console.log('\n  ✅  Transfer complete.'));
    stream.pipe(res);
  }
});

// Detect LAN IP for physical device instructions
function getLanIp() {
  const nets = require('os').networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'YOUR_MAC_IP';
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log('');
  console.log('🧠  Gemma 4 E2B model server ready');
  console.log(`   Blob : ${blobPath}`);
  console.log(`   Size : ${sizeMB} MB`);
  console.log('');
  console.log('   ┌─ Copy this URL into the app ──────────────────────────┐');
  console.log(`   │  http://${lanIp}:${PORT}/model.gguf`);
  console.log('   └───────────────────────────────────────────────────────┘');
  console.log('');
  console.log('   (emulator only)  http://10.0.2.2:' + PORT + '/model.gguf');
  console.log('');
  console.log('   Tap "From your Mac" in the app, paste the URL above,');
  console.log('   then tap Download.');
  console.log('   Press Ctrl+C when done.');
  console.log('');
});
