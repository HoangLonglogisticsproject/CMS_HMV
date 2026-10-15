import { makePng } from '../../../test/fixtures';
import { sniffImage } from './image-sniff';

describe('sniffImage', () => {
  it('reads PNG dimensions', () => {
    expect(sniffImage(makePng(3, 2))).toEqual({
      mimeType: 'image/png',
      extension: 'png',
      width: 3,
      height: 2,
    });
  });

  it('reads JPEG dimensions past APP segments', () => {
    const jpeg = Buffer.from([
      0xff,
      0xd8, // SOI
      0xff,
      0xe0,
      0x00,
      0x06,
      0x4a,
      0x46,
      0x49,
      0x46, // APP0, length 6
      0xff,
      0xdb,
      0x00,
      0x04,
      0x00,
      0x00, // DQT, length 4
      0xff,
      0xc2,
      0x00,
      0x0b,
      0x08,
      0x01,
      0xe0,
      0x02,
      0x80,
      0x01,
      0x01,
      0x11,
      0x00, // SOF2 480x640
      0xff,
      0xd9,
    ]);
    expect(sniffImage(jpeg)).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: 640,
      height: 480,
    });
  });

  it('reads WebP (VP8X, VP8L, VP8) dimensions', () => {
    const riff = (chunk: string, payload: number[]) =>
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WEBP' + chunk),
        Buffer.alloc(4),
        Buffer.from(payload),
        Buffer.alloc(16),
      ]);
    // VP8X: flags(4) then 24-bit width-1 / height-1
    expect(
      sniffImage(
        riff('VP8X', [0, 0, 0, 0, 0x7f, 0x07, 0x00, 0x37, 0x04, 0x00]),
      ),
    ).toMatchObject({ width: 1920, height: 1080 });
    // VP8L: signature 0x2f then 14-bit width-1, 14-bit height-1 → 100x50
    const bits = 99 | (49 << 14);
    expect(
      sniffImage(
        riff('VP8L', [
          0x2f,
          bits & 0xff,
          (bits >> 8) & 0xff,
          (bits >> 16) & 0xff,
          (bits >> 24) & 0xff,
        ]),
      ),
    ).toMatchObject({ width: 100, height: 50 });
    // VP8: 3-byte frame tag, start code 9d 01 2a, 16-bit LE width/height → 320x240
    expect(
      sniffImage(
        riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00]),
      ),
    ).toMatchObject({ width: 320, height: 240 });
  });

  it('rejects non-images, SVG, truncated and zero-size headers', () => {
    expect(
      sniffImage(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ),
      ),
    ).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a\x01\x00\x01\x00'))).toBeNull();
    expect(sniffImage(makePng(3, 2).subarray(0, 20))).toBeNull();
    expect(sniffImage(makePng(0, 2))).toBeNull();
    expect(
      sniffImage(
        Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0, 0, 0, 0, 0, 0]),
      ),
    ).toBeNull();
  });
});
