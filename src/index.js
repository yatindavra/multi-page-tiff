const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { joinTiffBuffers } = require('./join-tiff');

const VALID_COMPRESSIONS = ['none', 'lzw', 'deflate', 'jpeg'];

/**
 * Convert multiple images to a single multi-page TIFF buffer.
 * @param {(string|Buffer)[]} images - Array of file paths or Buffers
 * @param {Object} [options]
 * @param {string} [options.compression='none'] - TIFF compression: 'none', 'lzw', 'deflate', 'jpeg'
 * @returns {Promise<Buffer>} Multi-page TIFF buffer
 */
async function imagesToTiffBuffer(images, options = {}) {
  if (!Array.isArray(images) || images.length < 2) {
    throw new Error('At least 2 images are required');
  }

  const compression = options.compression || 'none';
  if (!VALID_COMPRESSIONS.includes(compression)) {
    throw new Error(`Invalid compression: "${compression}". Use one of: ${VALID_COMPRESSIONS.join(', ')}`);
  }

  const tiffBuffers = await Promise.all(
    images.map(async (img) => {
      const input = Buffer.isBuffer(img) ? img : fs.readFileSync(path.resolve(img));
      return sharp(input)
        .keepMetadata()
        .tiff({ compression })
        .toBuffer();
    })
  );

  return joinTiffBuffers(tiffBuffers);
}

/**
 * Convert multiple images to a single multi-page TIFF file.
 * @param {(string|Buffer)[]} images - Array of file paths or Buffers
 * @param {string} outputPath - Output file path
 * @param {Object} [options]
 * @param {string} [options.compression='none'] - TIFF compression: 'none', 'lzw', 'deflate', 'jpeg'
 * @returns {Promise<void>}
 */
async function imagesToTiff(images, outputPath, options = {}) {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('Output path is required');
  }

  const buffer = await imagesToTiffBuffer(images, options);
  fs.writeFileSync(path.resolve(outputPath), buffer);
}

module.exports = { imagesToTiff, imagesToTiffBuffer, joinTiffBuffers };
