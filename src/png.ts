import { deflateSync, inflateSync } from 'node:zlib';

/** 8-bit pixels, row by row, `channels` bytes each (3: RGB, 4: RGBA). */
export interface Image { width: number; height: number; channels: 3 | 4; data: Buffer }

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * The 8-bit RGB or RGBA, non-interlaced PNGs browsers write for screenshots.
 * Anything else (other depths, palettes, interlacing, a damaged file) is null: the caller goes without.
 */
export function decodePng(file: Buffer): Image | null {
  try {
    if (file.length < 33 || !file.subarray(0, 8).equals(SIGNATURE)) return null;
    let width = 0, height = 0, channels: 3 | 4 = 4;
    const idat: Buffer[] = [];
    for (let at = 8; at + 8 <= file.length;) {
      const length = file.readUInt32BE(at), type = file.toString('latin1', at + 4, at + 8);
      const body = file.subarray(at + 8, at + 8 + length);
      if (type === 'IHDR') {
        width = body.readUInt32BE(0);
        height = body.readUInt32BE(4);
        const depth = body[8], color = body[9], interlace = body[12];
        if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) return null;
        channels = color === 6 ? 4 : 3;
      } else if (type === 'IDAT') {
        idat.push(body);
      } else if (type === 'IEND') {
        break;
      }
      at += 12 + length;
    }
    if (!width || !height) return null;
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    if (raw.length < height * (stride + 1)) return null;
    const data = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      const row = y * stride, prev = row - stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? data[row + x - channels] : 0;
        const b = y > 0 ? data[prev + x] : 0;
        const c = y > 0 && x >= channels ? data[prev + x - channels] : 0;
        const value = filter === 0 ? line[x]
          : filter === 1 ? line[x] + a
          : filter === 2 ? line[x] + b
          : filter === 3 ? line[x] + ((a + b) >> 1)
          : filter === 4 ? line[x] + paeth(a, b, c)
          : NaN;
        if (Number.isNaN(value)) return null;
        data[row + x] = value & 0xff;
      }
    }
    return { width, height, channels, data };
  } catch {
    return null;
  }
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

export function encodePng(image: Image): Buffer {
  const stride = image.width * image.channels;
  const raw = Buffer.alloc(image.height * (stride + 1));
  for (let y = 0; y < image.height; y++) image.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = image.channels === 4 ? 6 : 2;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** The pixels of `image` inside the rectangle, which must lie within it. */
export function cropImage(image: Image, x: number, y: number, width: number, height: number): Image {
  const stride = image.width * image.channels, out = width * image.channels;
  const data = Buffer.alloc(height * out);
  for (let row = 0; row < height; row++) {
    const from = (y + row) * stride + x * image.channels;
    image.data.copy(data, row * out, from, from + out);
  }
  return { width, height, channels: image.channels, data };
}
