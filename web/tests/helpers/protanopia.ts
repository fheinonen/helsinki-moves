type Rgb = [number, number, number];
type Lab = [number, number, number];
type MatrixRow = readonly [number, number, number];

const BOARD_BACKGROUND: Rgb = [5, 5, 5];
const WHITE_X = 0.95047;
const WHITE_Y = 1;
const WHITE_Z = 1.08883;
const PROTANOPIA_MATRIX: readonly MatrixRow[] = [
  [0.152286, 1.052583, -0.204868],
  [0.114503, 0.786281, 0.099216],
  [-0.003882, -0.048116, 1.051998],
];

export const GLANCEABLE_PROTANOPIA_DISTANCE = 7;
export const READABLE_BOARD_CONTRAST = 7;

function srgbChannelToLinear(channel: number): number {
  const value = channel / 255;
  if (value <= 0.04045) {
    return value / 12.92;
  }
  return ((value + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  const encoded =
    clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

function mixRow(row: MatrixRow, rgb: Rgb): number {
  return (
    row[0] * srgbChannelToLinear(rgb[0]) +
    row[1] * srgbChannelToLinear(rgb[1]) +
    row[2] * srgbChannelToLinear(rgb[2])
  );
}

export function simulateProtanopia(rgb: Rgb): Rgb {
  return PROTANOPIA_MATRIX.map((row) => linearChannelToSrgb(mixRow(row, rgb))) as Rgb;
}

function relativeLuminance(rgb: Rgb): number {
  const red = srgbChannelToLinear(rgb[0]);
  const green = srgbChannelToLinear(rgb[1]);
  const blue = srgbChannelToLinear(rgb[2]);
  return 0.2126729 * red + 0.7151522 * green + 0.072175 * blue;
}

export function contrastOnDarkBoard(rgb: Rgb): number {
  const foreground = relativeLuminance(rgb);
  const background = relativeLuminance(BOARD_BACKGROUND);
  const lighter = Math.max(foreground, background);
  const darker = Math.min(foreground, background);
  return (lighter + 0.05) / (darker + 0.05);
}

function pivot(channel: number): number {
  const delta = 6 / 29;
  if (channel > delta ** 3) {
    return Math.cbrt(channel);
  }
  return channel / (3 * delta ** 2) + 4 / 29;
}

export function rgbToLab(rgb: Rgb): Lab {
  const red = srgbChannelToLinear(rgb[0]);
  const green = srgbChannelToLinear(rgb[1]);
  const blue = srgbChannelToLinear(rgb[2]);
  const x = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = red * 0.0193339 + green * 0.119192 + blue * 0.9503041;
  const fx = pivot(x / WHITE_X);
  const fy = pivot(y / WHITE_Y);
  const fz = pivot(z / WHITE_Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function hueDegrees(a: number, b: number): number {
  if (a === 0 && b === 0) {
    return 0;
  }
  const angle = (Math.atan2(b, a) * 180) / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

function hueDelta(first: number, second: number, chromaProduct: number): number {
  if (chromaProduct === 0) {
    return 0;
  }
  let delta = second - first;
  if (delta > 180) {
    delta -= 360;
  }
  if (delta < -180) {
    delta += 360;
  }
  return delta;
}

function meanHue(first: number, second: number, chromaProduct: number): number {
  const sum = first + second;
  if (chromaProduct === 0) {
    return sum;
  }
  if (Math.abs(first - second) <= 180) {
    return sum / 2;
  }
  if (sum < 360) {
    return (sum + 360) / 2;
  }
  return (sum - 360) / 2;
}

export function deltaE00(first: Lab, second: Lab): number {
  const [lightnessA, aA, bA] = first;
  const [lightnessB, aB, bB] = second;
  const chromaA = Math.hypot(aA, bA);
  const chromaB = Math.hypot(aB, bB);
  const chromaBar = (chromaA + chromaB) / 2;
  const chromaBar7 = chromaBar ** 7;
  const greenBoost = 0.5 * (1 - Math.sqrt(chromaBar7 / (chromaBar7 + 25 ** 7)));
  const primedA = (1 + greenBoost) * aA;
  const primedB = (1 + greenBoost) * aB;
  const primedChromaA = Math.hypot(primedA, bA);
  const primedChromaB = Math.hypot(primedB, bB);
  const hueA = hueDegrees(primedA, bA);
  const hueB = hueDegrees(primedB, bB);
  const chromaProduct = primedChromaA * primedChromaB;
  const lightnessDelta = lightnessB - lightnessA;
  const chromaDelta = primedChromaB - primedChromaA;
  const signedHueDelta = hueDelta(hueA, hueB, chromaProduct);
  const hueDistance = 2 * Math.sqrt(chromaProduct) * Math.sin((signedHueDelta * Math.PI) / 360);
  const meanLightness = (lightnessA + lightnessB) / 2;
  const meanChroma = (primedChromaA + primedChromaB) / 2;
  const hue = meanHue(hueA, hueB, chromaProduct);
  const hueTerm =
    1 -
    0.17 * Math.cos(((hue - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hue * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hue + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hue - 63) * Math.PI) / 180);
  const rotation = 30 * Math.exp(-(((hue - 275) / 25) ** 2));
  const chromaWeight = 2 * Math.sqrt(meanChroma ** 7 / (meanChroma ** 7 + 25 ** 7));
  const lightnessScale =
    1 + (0.015 * (meanLightness - 50) ** 2) / Math.sqrt(20 + (meanLightness - 50) ** 2);
  const chromaScale = 1 + 0.045 * meanChroma;
  const hueScale = 1 + 0.015 * meanChroma * hueTerm;
  const interaction = -Math.sin((2 * rotation * Math.PI) / 180) * chromaWeight;
  const lightnessTerm = lightnessDelta / lightnessScale;
  const chromaTerm = chromaDelta / chromaScale;
  const hueTermDistance = hueDistance / hueScale;
  return Math.sqrt(
    lightnessTerm ** 2 + chromaTerm ** 2 + hueTermDistance ** 2 + interaction * chromaTerm * hueTermDistance
  );
}

export function parseCssRgb(color: string): Rgb {
  const match = color.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  if (!match) {
    throw new Error(`Expected an rgb color, received ${color}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function closestProtanopiaDistance(colors: string[]): number {
  const simulated = colors.map((color) => rgbToLab(simulateProtanopia(parseCssRgb(color))));
  let closest = Number.POSITIVE_INFINITY;
  for (let left = 0; left < simulated.length; left += 1) {
    for (let right = left + 1; right < simulated.length; right += 1) {
      closest = Math.min(closest, deltaE00(simulated[left], simulated[right]));
    }
  }
  return closest;
}
