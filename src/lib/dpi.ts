/**
 * Write print resolution (DPI) into JPEG and PNG files.
 * Canvas exports carry no real DPI, but print shops and ID photo kiosks read it
 * to decide the physical size, so a "2x2 inch" photo needs 300 DPI metadata.
 */

/** Patch the JFIF APP0 density fields. Canvas-encoded JPEGs always start with a JFIF header. */
export async function setJpegDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const isJfif =
    bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 10)) === "JFIF";
  if (!isJfif) return blob;
  bytes[13] = 1; // units: dots per inch
  bytes[14] = dpi >> 8;
  bytes[15] = dpi & 0xff;
  bytes[16] = dpi >> 8;
  bytes[17] = dpi & 0xff;
  return new Blob([bytes], { type: "image/jpeg" });
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Insert a pHYs chunk right after IHDR. */
export async function setPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pixelsPerMeter = Math.round(dpi / 0.0254);

  const chunk = new Uint8Array(21); // length(4) + type(4) + data(9) + crc(4)
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, pixelsPerMeter);
  view.setUint32(12, pixelsPerMeter);
  chunk[16] = 1; // unit: metre
  view.setUint32(17, crc32(chunk.subarray(4, 17)));

  const ihdrEnd = 8 + 25; // PNG signature + IHDR chunk
  return new Blob([bytes.subarray(0, ihdrEnd), chunk, bytes.subarray(ihdrEnd)], { type: "image/png" });
}
