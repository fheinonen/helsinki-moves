import { inflateSync } from "node:zlib";

export interface Rgb {
  b: number;
  g: number;
  r: number;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  if (upDistance <= upLeftDistance) {
    return up;
  }
  return upLeft;
}

function unfilter(filter: number, value: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) {
    return value;
  }
  if (filter === 1) {
    return (value + left) & 255;
  }
  if (filter === 2) {
    return (value + up) & 255;
  }
  if (filter === 3) {
    return (value + Math.floor((left + up) / 2)) & 255;
  }
  return (value + paeth(left, up, upLeft)) & 255;
}

export function averagePngColor(png: Buffer): Rgb {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 2;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 2;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const prior = Buffer.alloc(stride);
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  let rowStart = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rowStart] ?? 0;
    const row = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? (row[index - channels] ?? 0) : 0;
      const up = prior[index] ?? 0;
      const upLeft = index >= channels ? (prior[index - channels] ?? 0) : 0;
      row[index] = unfilter(filter, raw[rowStart + 1 + index] ?? 0, left, up, upLeft);
    }
    prior.set(row);
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      red += row[index] ?? 0;
      green += row[index + 1] ?? 0;
      blue += row[index + 2] ?? 0;
      count += 1;
    }
    rowStart += stride + 1;
  }

  return {
    b: Math.round(blue / count),
    g: Math.round(green / count),
    r: Math.round(red / count),
  };
}

export function colorsStay(before: Rgb, after: Rgb): boolean {
  return Math.abs(before.r - after.r) <= 1 && Math.abs(before.g - after.g) <= 1 && Math.abs(before.b - after.b) <= 1;
}

export function formatRgb(color: Rgb): string {
  return `${color.r},${color.g},${color.b}`;
}
