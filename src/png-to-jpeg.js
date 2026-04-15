const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

function isPng(buf) {
  return buf.length >= 8
    && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47
    && buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A;
}

function pngToJpegBuffer(pngBuf, quality = 90) {
  const png = PNG.sync.read(pngBuf);
  const { width, height } = png;
  const src = png.data;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = src[i * 4 + 3] / 255;
    out[i * 4]     = Math.round(src[i * 4]     * a + 255 * (1 - a));
    out[i * 4 + 1] = Math.round(src[i * 4 + 1] * a + 255 * (1 - a));
    out[i * 4 + 2] = Math.round(src[i * 4 + 2] * a + 255 * (1 - a));
    out[i * 4 + 3] = 255;
  }
  return jpeg.encode({ data: out, width, height }, quality).data;
}

module.exports = { isPng, pngToJpegBuffer };
