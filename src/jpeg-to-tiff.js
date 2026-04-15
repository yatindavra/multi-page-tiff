/**
 * Wrap a JPEG file in a single-page TIFF container (Compression=7, "new-style"
 * JPEG-in-TIFF per TIFF 6.0 / TechNote 2). No pixel decoding — the JPEG bytes
 * are stored verbatim as a single strip. Output is little-endian.
 */

const SOF_MARKERS = new Set([
  0xC0, 0xC1, 0xC2, 0xC3,
  0xC5, 0xC6, 0xC7,
  0xC9, 0xCA, 0xCB,
  0xCD, 0xCE, 0xCF,
]);

function parseJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) {
    throw new Error('Not a JPEG (missing SOI marker)');
  }
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) throw new Error('Invalid JPEG: expected marker');
    while (buf[i] === 0xFF && i < buf.length) i++; // skip fill bytes
    const marker = buf[i++];
    if (marker === 0xD9 || marker === 0xDA) break; // EOI or SOS
    if (marker >= 0xD0 && marker <= 0xD7) continue; // RSTn (no payload)
    if (i + 1 >= buf.length) throw new Error('Truncated JPEG');
    const segLen = buf.readUInt16BE(i);
    if (SOF_MARKERS.has(marker)) {
      const precision = buf[i + 2];
      const height = buf.readUInt16BE(i + 3);
      const width = buf.readUInt16BE(i + 5);
      const nf = buf[i + 7];
      let hMax = 1, vMax = 1;
      const comps = [];
      for (let c = 0; c < nf; c++) {
        const off = i + 8 + c * 3;
        const id = buf[off];
        const samp = buf[off + 1];
        const h = samp >> 4;
        const v = samp & 0x0F;
        comps.push({ id, h, v });
        if (h > hMax) hMax = h;
        if (v > vMax) vMax = v;
      }
      return { width, height, precision, channels: nf, hSub: hMax, vSub: vMax };
    }
    i += segLen;
  }
  throw new Error('No SOF marker found in JPEG');
}

function jpegToTiffBuffer(jpegBuf) {
  const { width, height, precision, channels, hSub, vSub } = parseJpeg(jpegBuf);

  if (channels !== 1 && channels !== 3) {
    throw new Error(`Unsupported JPEG channel count: ${channels}`);
  }

  // Build IFD entries. For SHORT-count BitsPerSample with 3 channels, the value
  // (3 * 2 = 6 bytes) overflows the inline 4-byte slot, so it lives in extData.
  // For 1 channel, it fits inline.
  const photometric = channels === 3 ? 6 /* YCbCr */ : 1 /* BlackIsZero */;

  // Layout: [header 8] [IFD] [extData] [strip = jpeg bytes]
  // We need to know IFD size to compute offsets. Each entry = 12 bytes,
  // plus 2 (count) + 4 (next IFD pointer).
  const entries = [];

  const addEntry = (tag, type, count, value, extBytes) => {
    entries.push({ tag, type, count, value, extBytes });
  };

  // Helpers — value is either an inline 4-byte little-endian payload OR
  // a Buffer of extBytes that gets appended and pointed to.
  const inlineShort = (v) => {
    const b = Buffer.alloc(4);
    b.writeUInt16LE(v, 0);
    return b;
  };
  const inlineLong = (v) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v, 0);
    return b;
  };

  addEntry(256, 4, 1, inlineLong(width), null);  // ImageWidth
  addEntry(257, 4, 1, inlineLong(height), null); // ImageLength

  // BitsPerSample: SHORT, count=channels
  if (channels === 1) {
    addEntry(258, 3, 1, inlineShort(precision), null);
  } else {
    const ext = Buffer.alloc(channels * 2);
    for (let c = 0; c < channels; c++) ext.writeUInt16LE(precision, c * 2);
    addEntry(258, 3, channels, null, ext);
  }

  addEntry(259, 3, 1, inlineShort(7), null);          // Compression = JPEG (new)
  addEntry(262, 3, 1, inlineShort(photometric), null); // Photometric
  addEntry(273, 4, 1, null, null);                     // StripOffsets — patched later
  addEntry(277, 3, 1, inlineShort(channels), null);   // SamplesPerPixel
  addEntry(278, 4, 1, inlineLong(height), null);      // RowsPerStrip
  addEntry(279, 4, 1, inlineLong(jpegBuf.length), null); // StripByteCounts

  if (channels === 3) {
    // YCbCrSubSampling [hSub, vSub]
    const ext = Buffer.alloc(4);
    ext.writeUInt16LE(hSub, 0);
    ext.writeUInt16LE(vSub, 2);
    addEntry(530, 3, 2, null, ext); // 2 SHORTs = 4 bytes — fits inline actually
    // 2 shorts = 4 bytes, fits inline. Move it inline:
    const last = entries[entries.length - 1];
    last.value = ext;
    last.extBytes = null;
  }

  // Sort entries by tag (TIFF requires ascending tag order)
  entries.sort((a, b) => a.tag - b.tag);

  const ifdEntryCount = entries.length;
  const ifdSize = 2 + ifdEntryCount * 12 + 4;
  const ifdOffset = 8;
  const extStart = ifdOffset + ifdSize;

  // Assign offsets to ext data
  let cursor = extStart;
  for (const e of entries) {
    if (e.extBytes) {
      e.extOffset = cursor;
      cursor += e.extBytes.length;
    }
  }
  const stripOffset = cursor;

  // Patch StripOffsets entry value
  for (const e of entries) {
    if (e.tag === 273) e.value = inlineLong(stripOffset);
  }

  // Assemble
  const totalSize = stripOffset + jpegBuf.length;
  const out = Buffer.alloc(totalSize);

  // Header
  out[0] = 0x49; out[1] = 0x49;          // 'II' little-endian
  out.writeUInt16LE(42, 2);              // magic
  out.writeUInt32LE(ifdOffset, 4);       // first IFD offset

  // IFD
  out.writeUInt16LE(ifdEntryCount, ifdOffset);
  for (let idx = 0; idx < entries.length; idx++) {
    const e = entries[idx];
    const eOff = ifdOffset + 2 + idx * 12;
    out.writeUInt16LE(e.tag, eOff);
    out.writeUInt16LE(e.type, eOff + 2);
    out.writeUInt32LE(e.count, eOff + 4);
    if (e.extBytes) {
      out.writeUInt32LE(e.extOffset, eOff + 8);
      e.extBytes.copy(out, e.extOffset);
    } else {
      e.value.copy(out, eOff + 8);
    }
  }
  // Next IFD pointer = 0 (single-page; joinTiffBuffers will rewrite if chaining)
  out.writeUInt32LE(0, ifdOffset + 2 + ifdEntryCount * 12);

  // Strip
  jpegBuf.copy(out, stripOffset);

  return out;
}

module.exports = { jpegToTiffBuffer };
