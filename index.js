const sharp = require('sharp');
const fs = require('fs');

async function convertToTiff(frontPath, backPath, outputPath = 'outputNode.tiff') {
  // keepMetadata() preserves ICC profiles so colors don't shift
  const page1 = await sharp(frontPath).keepMetadata().tiff({ compression: 'none' }).toBuffer();
  const page2 = await sharp(backPath).keepMetadata().tiff({ compression: 'none' }).toBuffer();

  const result = joinTiffBuffers([page1, page2]);
  fs.writeFileSync(outputPath, result);
  console.log('TIFF file created successfully!');
}

function joinTiffBuffers(buffers) {
  const first = buffers[0];
  const le = first[0] === 0x49; // little-endian?

  const r16 = (b, o) => le ? b.readUInt16LE(o) : b.readUInt16BE(o);
  const r32 = (b, o) => le ? b.readUInt32LE(o) : b.readUInt32BE(o);
  const w32 = (b, o, v) => le ? b.writeUInt32LE(v, o) : b.writeUInt32BE(v, o);

  // Tags whose values are FILE OFFSETS (not sizes) — must be shifted
  const OFFSET_TAGS = new Set([273, 324, 288, 513]); // StripOffsets, TileOffsets, FreeOffsets, JPEGIFOffset

  let result = Buffer.from(first);

  for (let i = 1; i < buffers.length; i++) {
    const page = buffers[i];
    const pageIFDOff = r32(page, 4);
    const appendAt = result.length;
    const shift = appendAt - 8; // page data appended without its 8-byte header

    // --- Patch last IFD in result to chain to the new page ---
    let ifdOff = r32(result, 4);
    while (true) {
      const cnt = r16(result, ifdOff);
      const nextPtrOff = ifdOff + 2 + cnt * 12;
      const nextIFD = r32(result, nextPtrOff);
      if (nextIFD === 0) {
        w32(result, nextPtrOff, pageIFDOff + shift);
        break;
      }
      ifdOff = nextIFD;
    }

    // --- Copy page data (skip 8-byte TIFF header) and fix offsets ---
    const newPage = Buffer.from(page.slice(8));
    const newIFDOff = pageIFDOff - 8;
    const entryCount = r16(newPage, newIFDOff);

    for (let e = 0; e < entryCount; e++) {
      const eOff = newIFDOff + 2 + e * 12;
      const tag = r16(newPage, eOff);
      const type = r16(newPage, eOff + 2);
      const count = r32(newPage, eOff + 4);
      const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 }[type] || 1;
      const totalBytes = count * typeSize;

      if (totalBytes > 4) {
        // Value field is a POINTER to external data — shift the pointer
        const oldPtr = r32(newPage, eOff + 8);
        w32(newPage, eOff + 8, oldPtr + shift);

        // If the pointed-to data is itself an array of offsets, shift each one
        if (OFFSET_TAGS.has(tag)) {
          const arrStart = oldPtr - 8; // position within newPage
          for (let j = 0; j < count; j++) {
            const pos = arrStart + j * 4;
            w32(newPage, pos, r32(newPage, pos) + shift);
          }
        }
      } else {
        // Value fits INLINE in the 4-byte field
        // BUT if it's an offset tag, the inline value is still a file offset!
        if (OFFSET_TAGS.has(tag) && type === 4 /* LONG */) {
          for (let j = 0; j < count; j++) {
            const pos = eOff + 8 + j * 4;
            w32(newPage, pos, r32(newPage, pos) + shift);
          }
        }
      }
    }

    // Zero out next-IFD pointer (this is now the last page)
    w32(newPage, newIFDOff + 2 + entryCount * 12, 0);

    result = Buffer.concat([result, newPage]);
  }

  return result;
}


// example usage:
// convertToTiff('FrontImage.jpg', 'BackImage.jpg').catch(console.error);