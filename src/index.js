const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { joinTiffBuffers } = require('./join-tiff');
const { jpegToTiffBuffer } = require('./jpeg-to-tiff');
const { isPng, pngToJpegBuffer } = require('./png-to-jpeg');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch "${url}": HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function resolveInput(img) {
  if (Buffer.isBuffer(img)) return img;
  if (typeof img === 'string' && (img.startsWith('http://') || img.startsWith('https://'))) {
    return fetchUrl(img);
  }
  return fs.readFileSync(path.resolve(img));
}

function isJpeg(buf) {
  return buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xD8;
}

function isTiff(buf) {
  if (buf.length < 4) return false;
  const le = buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00;
  const be = buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A;
  return le || be;
}

function toTiffBuffer(buf) {
  if (isTiff(buf)) return buf;
  if (isJpeg(buf)) return jpegToTiffBuffer(buf);
  if (isPng(buf)) return jpegToTiffBuffer(pngToJpegBuffer(buf));
  throw new Error('Unsupported input format. Supported inputs: JPEG, PNG, TIFF.');
}

/**
 * Convert multiple images to a single multi-page TIFF buffer.
 * Accepts JPEG or TIFF inputs (no decoding — JPEG bytes are wrapped in a
 * TIFF container with Compression=7).
 * @param {(string|Buffer)[]} images - Array of file paths, URLs, or Buffers
 * @returns {Promise<Buffer>} Multi-page TIFF buffer
 */
async function imagesToTiffBuffer(images) {
  if (!Array.isArray(images) || images.length < 2) {
    throw new Error('At least 2 images are required');
  }

  const tiffBuffers = await Promise.all(
    images.map(async (img) => toTiffBuffer(await resolveInput(img)))
  );

  return joinTiffBuffers(tiffBuffers);
}

/**
 * Convert multiple images to a single multi-page TIFF file.
 * @param {(string|Buffer)[]} images - Array of file paths, URLs, or Buffers
 * @param {string} outputPath - Output file path
 * @returns {Promise<void>}
 */
async function imagesToTiff(images, outputPath) {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('Output path is required');
  }

  const buffer = await imagesToTiffBuffer(images);
  fs.writeFileSync(path.resolve(outputPath), buffer);
}

module.exports = { imagesToTiff, imagesToTiffBuffer, joinTiffBuffers, jpegToTiffBuffer };
