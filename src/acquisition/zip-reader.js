/* ============================================================================
   MINIMAL IN-BROWSER ZIP READER
   Uses native DecompressionStream('deflate-raw'). No external library.
   Supports ZIP64 for large Garmin export archives.
   ============================================================================ */

async function readZip(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  // Locate End-of-Central-Directory record (sig 0x06054b50), scan from end
  let eocd = -1;
  const minPos = Math.max(0, u8.length - 65557);
  for (let i = u8.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a ZIP file (no EOCD record found).');

  let totalEntries = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);
  let cdSize = view.getUint32(eocd + 12, true);

  // ZIP64 EOCD locator (sig 0x07064b50), 20 bytes before EOCD
  if (cdOffset === 0xFFFFFFFF || totalEntries === 0xFFFF) {
    const locPos = eocd - 20;
    if (locPos >= 0 && view.getUint32(locPos, true) === 0x07064b50) {
      const z64eocdOff = Number(view.getBigUint64(locPos + 8, true));
      if (view.getUint32(z64eocdOff, true) === 0x06064b50) {
        totalEntries = Number(view.getBigUint64(z64eocdOff + 32, true));
        cdSize = Number(view.getBigUint64(z64eocdOff + 40, true));
        cdOffset = Number(view.getBigUint64(z64eocdOff + 48, true));
      }
    }
  }

  const entries = [];
  const td = new TextDecoder('utf-8');
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    let compSize = view.getUint32(p + 20, true);
    let uncompSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    let localOff = view.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nameLen));

    // ZIP64 extra field if any of the size/offset are 0xFFFFFFFF
    if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF || localOff === 0xFFFFFFFF) {
      let ep = p + 46 + nameLen;
      const epEnd = ep + extraLen;
      while (ep + 4 <= epEnd) {
        const headerId = view.getUint16(ep, true);
        const dataSize = view.getUint16(ep + 2, true);
        ep += 4;
        if (headerId === 0x0001) {
          let q = ep;
          if (uncompSize === 0xFFFFFFFF) { uncompSize = Number(view.getBigUint64(q, true)); q += 8; }
          if (compSize === 0xFFFFFFFF) { compSize = Number(view.getBigUint64(q, true)); q += 8; }
          if (localOff === 0xFFFFFFFF) { localOff = Number(view.getBigUint64(q, true)); q += 8; }
          break;
        }
        ep += dataSize;
      }
    }

    entries.push({ name, method, compSize, uncompSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    entries,
    extract: async (name) => {
      const e = entries.find(en => en.name === name);
      if (!e) throw new Error('Not found in zip: ' + name);
      const lh = e.localOff;
      if (view.getUint32(lh, true) !== 0x04034b50) throw new Error('Bad local header for ' + name);
      const lhNameLen = view.getUint16(lh + 26, true);
      const lhExtraLen = view.getUint16(lh + 28, true);
      const dataStart = lh + 30 + lhNameLen + lhExtraLen;
      const compressed = u8.subarray(dataStart, dataStart + e.compSize);
      if (e.method === 0) return compressed;
      if (e.method === 8) {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        const buf = await new Response(stream).arrayBuffer();
        return new Uint8Array(buf);
      }
      throw new Error('Unsupported compression method ' + e.method);
    }
  };
}
