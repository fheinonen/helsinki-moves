export const DESTINATION_COLORS = [
  "#ffff22",
  "#a283ff",
  "#cb9484",
  "#b5ffe4",
  "#d4d6ff",
  "#7ca51b",
  "#feffb5",
  "#adcac7",
  "#a4959c",
  "#e5c7ac",
  "#a5ca00",
  "#dd9f6a",
  "#b3a8c2",
  "#f7e678",
  "#65c1ff",
  "#c684cf",
] as const;

const PALETTE_SIZE = DESTINATION_COLORS.length;
const UNSEPARATED = 1_000_000;
const SEARCH_EXACTLY_UNTIL = 8;
const LOCAL_ROUNDS = 40;

type Edge = readonly [number, number];

interface Separation {
  min: number;
  sum: number;
}

// Protanopia CIEDE2000, in hundredths, for DESTINATION_COLORS in order.
const DISTANCE = [
  [0, 6829, 3202, 2547, 5235, 2298, 1469, 3149, 4046, 2404, 1285, 2419, 4893, 929, 6222, 6511],
  [6829, 0, 3804, 4203, 2185, 5884, 6027, 2829, 2252, 4238, 6170, 4986, 1796, 6011, 1343, 768],
  [3202, 3804, 0, 2291, 3073, 1925, 2572, 1617, 1285, 1297, 2359, 1066, 2209, 2523, 3350, 3162],
  [2547, 4203, 2291, 0, 2362, 3136, 1378, 1300, 2564, 1102, 2653, 2349, 2565, 1987, 3122, 3730],
  [5235, 2185, 3073, 2362, 0, 4710, 3972, 1454, 2129, 2792, 4599, 3855, 1238, 4226, 879, 1893],
  [2298, 5884, 1925, 3136, 4710, 0, 2554, 2969, 3030, 2206, 1073, 1061, 3959, 1887, 5209, 5087],
  [1469, 6027, 2572, 1378, 3972, 2554, 0, 2297, 3338, 1426, 1830, 2036, 3844, 939, 4859, 5263],
  [3149, 2829, 1617, 1300, 1454, 2969, 2297, 0, 1345, 1197, 2847, 2164, 1234, 2587, 1941, 2352],
  [4046, 2252, 1285, 2564, 2129, 3030, 3338, 1345, 0, 1998, 3374, 2288, 1005, 3445, 2083, 1710],
  [2404, 4238, 1297, 1102, 2792, 2206, 1426, 1197, 1998, 0, 2006, 1296, 2456, 1665, 3375, 3638],
  [1285, 6170, 2359, 2653, 4599, 1073, 1830, 2847, 3374, 2006, 0, 1440, 4107, 979, 5261, 5378],
  [2419, 4986, 1066, 2349, 3855, 1061, 2036, 2164, 2288, 1296, 1440, 0, 3164, 1728, 4320, 4263],
  [4893, 1796, 2209, 2565, 1238, 3959, 3844, 1234, 1005, 2456, 4107, 3164, 0, 3985, 1179, 1191],
  [929, 6011, 2523, 1987, 4226, 1887, 939, 2587, 3445, 1665, 979, 1728, 3985, 0, 4979, 5290],
  [6222, 1343, 3350, 3122, 879, 5209, 4859, 1941, 2083, 3375, 5261, 4320, 1179, 4979, 0, 1197],
  [6511, 768, 3162, 3730, 1893, 5087, 5263, 2352, 1710, 3638, 5378, 4263, 1191, 5290, 1197, 0],
];

export function separateNeighbors(
  fixed: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number> = new Set()
): number[] {
  if (fixed.every((color) => color >= 0)) {
    return fixed.slice();
  }
  const free = freeIndexes(fixed);
  if (free.length === 1) {
    return paintOne(fixed, edges, free[0], reserved);
  }
  const ordered = singlePath(fixed, edges);
  const painted = ordered ? paintPath(fixed, ordered, edges, reserved) : null;
  if (painted) {
    return painted;
  }
  if (free.length <= SEARCH_EXACTLY_UNTIL) {
    return searchExact(fixed, edges, reserved);
  }
  return searchLocal(fixed, edges, reserved);
}

function paintOne(
  fixed: readonly number[],
  edges: readonly Edge[],
  node: number,
  reserved: ReadonlySet<number>
): number[] {
  const colors = fixed.slice();
  const used = visitColors(colors, reserved);
  colors[node] = bestColor(neighborColors(node, colors, edges), used, used.size < PALETTE_SIZE);
  return colors;
}

function paintPath(
  fixed: readonly number[],
  ordered: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number>
): number[] | null {
  const pool = unusedColors(fixed, reserved);
  if (pool.length < ordered.length) {
    return null;
  }
  const penalties = ordered.map((node) => neighborColors(node, fixed, edges));
  const chosen = solvePath(pool, penalties);
  const colors = fixed.slice();
  ordered.forEach((node, position) => {
    colors[node] = chosen[position];
  });
  return colors;
}

function searchExact(fixed: readonly number[], edges: readonly Edge[], reserved: ReadonlySet<number>): number[] {
  const free = freeIndexes(fixed);
  const assign = fixed.slice();
  const distinct = free.length <= unusedColors(assign, reserved).length;
  let best = climb(greedy(fixed, edges, reserved), free, edges);
  let bestScore = scoreEdges(best, edges);

  const visit = (step: number, mask: number): void => {
    if (step === free.length) {
      const score = scoreEdges(assign, edges);
      if (outranks(score, bestScore)) {
        best = assign.slice();
        bestScore = score;
      }
      return;
    }
    tryColors(assign, free[step], edges, distinct, mask, bestScore.min, (color, nextMask) => {
      assign[free[step]] = color;
      visit(step + 1, nextMask);
      assign[free[step]] = -1;
    });
  };

  visit(0, usedMask(assign));
  return best;
}

function tryColors(
  assign: readonly number[],
  node: number,
  edges: readonly Edge[],
  distinct: boolean,
  mask: number,
  bestMin: number,
  accept: (color: number, mask: number) => void
): void {
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (distinct && (mask & (1 << color)) !== 0) {
      continue;
    }
    if (worstPlaced(assign, node, color, edges) < bestMin) {
      continue;
    }
    accept(color, distinct ? mask | (1 << color) : mask);
  }
}

function searchLocal(fixed: readonly number[], edges: readonly Edge[], reserved: ReadonlySet<number>): number[] {
  const free = freeIndexes(fixed);
  let best = fixed.slice();
  let bestScore: Separation = { min: -1, sum: -1 };
  const pathSeed = paintPath(fixed, free, edges, reserved);
  if (pathSeed) {
    best = climb(pathSeed, free, edges);
    bestScore = scoreEdges(best, edges);
  }
  for (let start = 0; start < PALETTE_SIZE; start += 1) {
    const seeded = climb(greedy(forceStart(fixed, start, reserved), edges, reserved), free, edges);
    const score = scoreEdges(seeded, edges);
    if (outranks(score, bestScore)) {
      best = seeded;
      bestScore = score;
    }
  }
  return best;
}

function forceStart(fixed: readonly number[], start: number, reserved: ReadonlySet<number>): number[] {
  const colors = fixed.slice();
  const free = freeIndexes(colors);
  if (free.length === 0 || visitColors(colors, reserved).has(start)) {
    return colors;
  }
  colors[free[0]] = start;
  return colors;
}

function greedy(assign: readonly number[], edges: readonly Edge[], reserved: ReadonlySet<number>): number[] {
  return fillGreedy(assign.slice(), adjacency(assign.length, edges), reserved);
}

function fillGreedy(colors: number[], neigh: number[][], reserved: ReadonlySet<number>): number[] {
  const open = freeIndexes(colors);
  const used = visitColors(colors, reserved);
  while (open.length > 0) {
    const node = open.splice(mostColored(open, colors, neigh), 1)[0];
    const fresh = used.size + open.length < PALETTE_SIZE;
    colors[node] = bestColor(coloredNeighbors(node, colors, neigh), used, fresh);
    used.add(colors[node]);
  }
  return colors;
}

function mostColored(open: readonly number[], colors: readonly number[], neigh: readonly number[][]): number {
  let pick = 0;
  let rank = -1;
  for (let index = 0; index < open.length; index += 1) {
    const colored = coloredNeighbors(open[index], colors, neigh).length;
    if (colored > rank) {
      rank = colored;
      pick = index;
    }
  }
  return pick;
}

function climb(colors: number[], free: readonly number[], edges: readonly Edge[]): number[] {
  let current = colors;
  let currentScore = scoreEdges(current, edges);
  for (let round = 0; round < LOCAL_ROUNDS; round += 1) {
    const next = improvePass(current, free, edges, currentScore);
    if (!next) {
      return current;
    }
    current = next.colors;
    currentScore = next.score;
  }
  return current;
}

function improvePass(
  colors: number[],
  free: readonly number[],
  edges: readonly Edge[],
  currentScore: Separation
): { colors: number[]; score: Separation } | null {
  let working = colors;
  let score = currentScore;
  let changed = false;
  for (let left = 0; left < free.length; left += 1) {
    const swapped = improveBySwap(working, free, left, edges, score);
    if (swapped) {
      working = swapped.colors;
      score = swapped.score;
      changed = true;
    }
    const replaced = improveByUnused(working, free[left], edges, score);
    if (replaced) {
      working = replaced.colors;
      score = replaced.score;
      changed = true;
    }
  }
  return changed ? { colors: working, score } : null;
}

function improveBySwap(
  colors: readonly number[],
  free: readonly number[],
  left: number,
  edges: readonly Edge[],
  currentScore: Separation
): { colors: number[]; score: Separation } | null {
  let working = colors.slice();
  let score = currentScore;
  let changed = false;
  for (let right = left + 1; right < free.length; right += 1) {
    if (working[free[left]] === working[free[right]]) {
      continue;
    }
    const next = working.slice();
    const saved = next[free[left]];
    next[free[left]] = next[free[right]];
    next[free[right]] = saved;
    const nextScore = scoreEdges(next, edges);
    if (!outranks(nextScore, score)) {
      continue;
    }
    working = next;
    score = nextScore;
    changed = true;
  }
  return changed ? { colors: working, score } : null;
}

function improveByUnused(
  colors: readonly number[],
  node: number,
  edges: readonly Edge[],
  currentScore: Separation
): { colors: number[]; score: Separation } | null {
  let working = colors.slice();
  let score = currentScore;
  let changed = false;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (working.includes(color)) {
      continue;
    }
    const next = working.slice();
    next[node] = color;
    const nextScore = scoreEdges(next, edges);
    if (!outranks(nextScore, score)) {
      continue;
    }
    working = next;
    score = nextScore;
    changed = true;
  }
  return changed ? { colors: working, score } : null;
}

function solvePath(pool: readonly number[], penalties: readonly (readonly number[])[]): number[] {
  const width = pool.length;
  const length = penalties.length;
  const mins = new Int32Array((1 << width) * width);
  const sums = new Int32Array(mins.length);
  const previous = new Int16Array(mins.length);
  mins.fill(-1);
  previous.fill(-1);
  seedPath(pool, penalties[0], mins, sums, width);
  extendPath(pool, penalties, mins, sums, previous, width, length);
  return readPath(pool, mins, sums, previous, width, length);
}

function seedPath(
  pool: readonly number[],
  penalty: readonly number[],
  mins: Int32Array,
  sums: Int32Array,
  width: number
): void {
  for (let index = 0; index < width; index += 1) {
    const score = against(penalty, pool[index]);
    const slot = (1 << index) * width + index;
    mins[slot] = score.min;
    sums[slot] = score.sum;
  }
}

function extendPath(
  pool: readonly number[],
  penalties: readonly (readonly number[])[],
  mins: Int32Array,
  sums: Int32Array,
  previous: Int16Array,
  width: number,
  length: number
): void {
  const states = 1 << width;
  for (let mask = 0; mask < states; mask += 1) {
    const used = popcount(mask);
    if (used === 0 || used >= length) {
      continue;
    }
    for (let last = 0; last < width; last += 1) {
      extendFrom(pool, penalties[used], mins, sums, previous, width, mask, last);
    }
  }
}

function extendFrom(
  pool: readonly number[],
  penalty: readonly number[],
  mins: Int32Array,
  sums: Int32Array,
  previous: Int16Array,
  width: number,
  mask: number,
  last: number
): void {
  if ((mask & (1 << last)) === 0) {
    return;
  }
  const base = mask * width + last;
  const baseMin = mins[base];
  if (baseMin < 0) {
    return;
  }
  for (let next = 0; next < width; next += 1) {
    if ((mask & (1 << next)) !== 0) {
      continue;
    }
    writeStep(pool, penalty, mins, sums, previous, width, mask, last, next, baseMin, sums[base]);
  }
}

function writeStep(
  pool: readonly number[],
  penalty: readonly number[],
  mins: Int32Array,
  sums: Int32Array,
  previous: Int16Array,
  width: number,
  mask: number,
  last: number,
  next: number,
  baseMin: number,
  baseSum: number
): void {
  const edge = DISTANCE[pool[last]][pool[next]];
  const extra = against(penalty, pool[next]);
  const nextMin = Math.min(baseMin, edge, extra.min);
  const nextSum = baseSum + edge + extra.sum;
  const slot = (mask | (1 << next)) * width + next;
  if (nextMin > mins[slot] || (nextMin === mins[slot] && nextSum > sums[slot])) {
    mins[slot] = nextMin;
    sums[slot] = nextSum;
    previous[slot] = last;
  }
}

function readPath(
  pool: readonly number[],
  mins: Int32Array,
  sums: Int32Array,
  previous: Int16Array,
  width: number,
  length: number
): number[] {
  const slot = bestSlot(mins, sums, width, length);
  const colors: number[] = [];
  let cursor = slot;
  while (colors.length < length && cursor >= 0) {
    const index = cursor % width;
    colors.push(pool[index]);
    const parent = previous[cursor];
    if (parent < 0) {
      break;
    }
    cursor = (Math.floor(cursor / width) ^ (1 << index)) * width + parent;
  }
  colors.reverse();
  return colors;
}

function bestSlot(mins: Int32Array, sums: Int32Array, width: number, length: number): number {
  let chosen = -1;
  let bestMin = -1;
  let bestSum = -1;
  const states = 1 << width;
  for (let mask = 0; mask < states; mask += 1) {
    if (popcount(mask) !== length) {
      continue;
    }
    for (let last = 0; last < width; last += 1) {
      const slot = mask * width + last;
      const min = mins[slot];
      if (min > bestMin || (min === bestMin && sums[slot] > bestSum)) {
        bestMin = min;
        bestSum = sums[slot];
        chosen = slot;
      }
    }
  }
  return chosen;
}

function singlePath(fixed: readonly number[], edges: readonly Edge[]): number[] | null {
  const free = freeIndexes(fixed);
  if (free.length <= 1) {
    return free;
  }
  const pairs = inducedPairs(free, edges);
  if (pairs.length !== free.length - 1) {
    return null;
  }
  const links = free.map(() => [] as number[]);
  for (const [left, right] of pairs) {
    links[left].push(right);
    links[right].push(left);
  }
  if (links.some((list) => list.length > 2)) {
    return null;
  }
  return orderPath(free, links);
}

function inducedPairs(free: readonly number[], edges: readonly Edge[]): Array<[number, number]> {
  const id = new Map(free.map((node, index) => [node, index]));
  const seen = new Set<string>();
  const pairs: Array<[number, number]> = [];
  for (const [left, right] of edges) {
    const pair = pairIndex(id, left, right);
    if (!pair || seen.has(pair.key)) {
      continue;
    }
    seen.add(pair.key);
    pairs.push(pair.nodes);
  }
  return pairs;
}

function pairIndex(
  id: ReadonlyMap<number, number>,
  left: number,
  right: number
): { key: string; nodes: [number, number] } | null {
  const a = id.get(left);
  const b = id.get(right);
  if (a === undefined || b === undefined || a === b) {
    return null;
  }
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  return { key, nodes: [a, b] };
}

function orderPath(free: readonly number[], links: readonly number[][]): number[] | null {
  const start = links.findIndex((list) => list.length <= 1);
  if (start < 0) {
    return null;
  }
  const ordered = [free[start]];
  let previous = -1;
  let cursor = start;
  while (ordered.length < free.length) {
    const next = links[cursor].find((candidate) => candidate !== previous);
    if (next === undefined) {
      return null;
    }
    previous = cursor;
    cursor = next;
    ordered.push(free[cursor]);
  }
  return ordered;
}

function adjacency(size: number, edges: readonly Edge[]): number[][] {
  const neigh = Array.from({ length: size }, () => [] as number[]);
  for (const [left, right] of edges) {
    neigh[left].push(right);
    neigh[right].push(left);
  }
  return neigh;
}

function neighborColors(node: number, colors: readonly number[], edges: readonly Edge[]): number[] {
  const found: number[] = [];
  for (const [left, right] of edges) {
    const other = left === node ? right : right === node ? left : -1;
    if (other >= 0 && colors[other] >= 0) {
      found.push(colors[other]);
    }
  }
  return found;
}

function coloredNeighbors(node: number, colors: readonly number[], neigh: readonly number[][]): number[] {
  const found: number[] = [];
  for (const other of neigh[node]) {
    if (colors[other] >= 0) {
      found.push(colors[other]);
    }
  }
  return found;
}

function worstPlaced(assign: readonly number[], node: number, color: number, edges: readonly Edge[]): number {
  let worst = UNSEPARATED;
  for (const [left, right] of edges) {
    const other = left === node ? right : right === node ? left : -1;
    if (other >= 0 && assign[other] >= 0) {
      worst = Math.min(worst, DISTANCE[assign[other]][color]);
    }
  }
  return worst;
}

function bestColor(neighbors: readonly number[], used: ReadonlySet<number>, freshOnly: boolean): number {
  let chosen = 0;
  let bestMin = -1;
  let bestSum = -1;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (freshOnly && used.has(color)) {
      continue;
    }
    const score = against(neighbors, color);
    if (score.min > bestMin || (score.min === bestMin && (score.sum > bestSum || (score.sum === bestSum && color < chosen)))) {
      chosen = color;
      bestMin = score.min;
      bestSum = score.sum;
    }
  }
  return chosen;
}

function against(neighbors: readonly number[], color: number): Separation {
  if (neighbors.length === 0) {
    return { min: UNSEPARATED, sum: 0 };
  }
  let min = UNSEPARATED;
  let sum = 0;
  for (const neighbor of neighbors) {
    const distance = DISTANCE[neighbor][color];
    sum += distance;
    if (distance < min) {
      min = distance;
    }
  }
  return { min, sum };
}

function scoreEdges(colors: readonly number[], edges: readonly Edge[]): Separation {
  if (edges.length === 0) {
    return { min: UNSEPARATED, sum: 0 };
  }
  let min = UNSEPARATED;
  let sum = 0;
  for (const [left, right] of edges) {
    const distance = DISTANCE[colors[left]][colors[right]];
    sum += distance;
    if (distance < min) {
      min = distance;
    }
  }
  return { min, sum };
}

function outranks(next: Separation, current: Separation): boolean {
  if (next.min !== current.min) {
    return next.min > current.min;
  }
  return next.sum > current.sum;
}

function freeIndexes(colors: readonly number[]): number[] {
  const free: number[] = [];
  for (let index = 0; index < colors.length; index += 1) {
    if (colors[index] < 0) {
      free.push(index);
    }
  }
  return free;
}

function unusedColors(colors: readonly number[], reserved: ReadonlySet<number>): number[] {
  const used = visitColors(colors, reserved);
  const pool: number[] = [];
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (!used.has(color)) {
      pool.push(color);
    }
  }
  return pool;
}

function visitColors(colors: readonly number[], reserved: ReadonlySet<number>): Set<number> {
  const used = new Set(reserved);
  for (const color of colors) {
    if (color >= 0) {
      used.add(color);
    }
  }
  return used;
}

function usedMask(colors: readonly number[]): number {
  let mask = 0;
  for (const color of colors) {
    if (color >= 0) {
      mask |= 1 << color;
    }
  }
  return mask;
}

function popcount(mask: number): number {
  let count = 0;
  let bits = mask;
  while (bits) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}
