const fs = require('fs');
const path = require('path');
const { imagesToTiffBuffer, jpegToTiffBuffer } = require('../src');

const FRONT = path.resolve(__dirname, '../../FrontImage.jpg');
const BACK = path.resolve(__dirname, '../../BackImage.jpg');

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('  ok -', msg);
}

function countPages(tiff) {
  const le = tiff[0] === 0x49;
  const r16 = (o) => le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o);
  const r32 = (o) => le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o);
  let off = r32(4);
  let n = 0;
  while (off !== 0) {
    n++;
    const cnt = r16(off);
    off = r32(off + 2 + cnt * 12);
  }
  return n;
}

(async () => {
  console.log('jpegToTiffBuffer wraps a JPEG:');
  const jpeg = fs.readFileSync(FRONT);
  const single = jpegToTiffBuffer(jpeg);
  assert(single[0] === 0x49 && single[1] === 0x49, 'TIFF II header');
  assert(single.readUInt16LE(2) === 42, 'TIFF magic 42');
  assert(countPages(single) === 1, 'single page');

  console.log('imagesToTiffBuffer joins two JPEGs:');
  const joined = await imagesToTiffBuffer([FRONT, BACK]);
  assert(countPages(joined) === 2, 'two pages');

  // Sanity: verify the JPEG bytes survived intact inside the strip
  assert(joined.includes(jpeg.slice(0, 200)), 'first JPEG bytes preserved');

  const out = path.resolve(__dirname, 'out.tiff');
  fs.writeFileSync(out, joined);
  console.log(`\nWrote ${out} (${joined.length} bytes)`);

  console.log('\nPNG input is transcoded and joined:');
  const { PNG } = require('pngjs');
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      png.data[i] = x * 4; png.data[i + 1] = y * 4; png.data[i + 2] = 128; png.data[i + 3] = 255;
    }
  }
  const pngBuf = PNG.sync.write(png);
  const mixed = await imagesToTiffBuffer([FRONT, pngBuf]);
  assert(countPages(mixed) === 2, 'JPEG + PNG → 2 pages');
})().catch((e) => { console.error(e); process.exit(1); });
