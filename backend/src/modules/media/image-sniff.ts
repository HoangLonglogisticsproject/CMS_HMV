export interface ImageInfo {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
}

/**
 * Identifies JPEG/PNG/WebP from the file bytes and reads pixel dimensions.
 * The client-supplied MIME type and filename are never trusted. SVG is deliberately unsupported (it can carry script).
 * ponytail: header parsing only; it does not prove the whole file decodes. Re-encode with sharp if polyglot files matter.
 */
export function sniffImage(buf: Buffer): ImageInfo | null {
  const info = detect(buf);
  return info && info.width > 0 && info.height > 0 ? info : null;
}

function detect(buf: Buffer): ImageInfo | null {
  const ascii = (start: number, end: number) =>
    buf.toString('latin1', start, end);

  if (
    buf.length >= 24 &&
    buf.readUInt32BE(0) === 0x89504e47 &&
    buf.readUInt32BE(4) === 0x0d0a1a0a &&
    ascii(12, 16) === 'IHDR'
  ) {
    return {
      mimeType: 'image/png',
      extension: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  if (buf.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    const webp = (width: number, height: number): ImageInfo => ({
      mimeType: 'image/webp',
      extension: 'webp',
      width,
      height,
    });
    const chunk = ascii(12, 16);
    if (
      chunk === 'VP8 ' &&
      buf[23] === 0x9d &&
      buf[24] === 0x01 &&
      buf[25] === 0x2a
    ) {
      return webp(buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff);
    }
    if (chunk === 'VP8L' && buf[20] === 0x2f) {
      const bits = buf.readUInt32LE(21);
      return webp((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X')
      return webp(buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1);
    return null;
  }

  if (
    buf.length >= 4 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker === 0xff) {
        i++; // fill byte
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2; // markers without a length
        continue;
      }
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC): precision(1) height(2) width(2)
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return {
          mimeType: 'image/jpeg',
          extension: 'jpg',
          width: buf.readUInt16BE(i + 7),
          height: buf.readUInt16BE(i + 5),
        };
      }
      if (marker === 0xda || marker === 0xd9) return null; // scan data / end before any frame header
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}
