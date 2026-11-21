export const DESTINATION_COLORS = [
  "#f8ff00",
  "#ce78ff",
  "#b0968e",
  "#fff0ff",
  "#a0a028",
  "#fffed9",
  "#96b4d2",
  "#ff8769",
  "#f087a5",
  "#f0d2a0",
  "#4bc4b4",
  "#fdfdf4",
  "#aae66e",
  "#ffffaf",
  "#00c56d",
  "#ffb400",
  "#b4b496",
  "#ffd2c3",
  "#c8c8d2",
  "#31bfff",
  "#ffd2ff",
  "#7c9ad5",
] as const;

const PALETTE_SIZE = DESTINATION_COLORS.length;
const UNSEPARATED = 1_000_000;
const SOFT_DISTINCT_FLOOR = 2900;
const REUSE_COMFORT_FLOOR = 3500;
const MAX_STARTS = 12;
const CLIMB_ROUNDS = 40;
const WIDE_STAGE_ROUNDS = 4;
const POLISH_ROUNDS = 20;
const POLISH_CANDIDATES = 3;

type Edge = readonly [number, number];

interface Separation {
  count: number;
  min: number;
  pairCount: number;
  pairMin: number;
  reuseExcess: number;
  reuseMax: number;
  sum: number;
}

interface PaletteMetrics {
  pairCount: number;
  pairMin: number;
  reuseExcess: number;
  reuseMax: number;
}

interface NodeFit {
  min: number;
  multiplicity: number;
  pairMin: number;
  sum: number;
}

interface Problem {
  adj: number[][];
  avail: number;
  baseUsed: Uint8Array;
  distinct: boolean;
  eu: Int32Array;
  ev: Int32Array;
  forceReuse: boolean;
  free: number[];
  hasRecolorTarget: boolean;
  reuseMode: boolean;
}

interface Candidate {
  colors: number[];
  score: Separation;
  used: Uint8Array;
}

const DELTA_ACC = new Int32Array(3);

// Protanopia CIEDE2000, in hundredths, for DESTINATION_COLORS in farthest-point order.
const DISTANCE = [
  [0, 6810, 3435, 3915, 2292, 2162, 5185, 2783, 4443, 1864, 3101, 2811, 954, 1359, 1899, 1416, 2678, 2534, 3894, 6326, 5104, 5893],
  [6810, 0, 3298, 3075, 5852, 5070, 1695, 4729, 2058, 4965, 3070, 3883, 5996, 6169, 5319, 6115, 4084, 3983, 2540, 1235, 2256, 844],
  [3435, 3298, 0, 2576, 2230, 2523, 2141, 1218, 1210, 1962, 981, 2462, 2711, 2849, 1859, 2583, 943, 1675, 1761, 3019, 2726, 2662],
  [3915, 3075, 2576, 0, 4040, 2014, 1647, 3326, 2208, 2521, 1619, 981, 3300, 2922, 3222, 3775, 2408, 1614, 947, 1951, 911, 2529],
  [2292, 5852, 2230, 4040, 0, 2930, 4269, 1176, 3331, 1964, 2609, 3420, 1701, 2497, 1050, 927, 1883, 2606, 3525, 5230, 4607, 5030],
  [2162, 5070, 2523, 2014, 2930, 0, 3272, 2470, 3081, 1023, 1817, 985, 1705, 954, 1935, 2449, 1726, 932, 2207, 4017, 2978, 4286],
  [5185, 1695, 2141, 1647, 4269, 3272, 0, 3332, 1032, 3306, 1618, 2374, 4196, 4162, 3682, 4363, 2612, 2406, 954, 913, 1013, 961],
  [2783, 4729, 1218, 3326, 1176, 2470, 3332, 0, 2421, 1555, 1751, 2831, 1985, 2395, 950, 1678, 955, 1908, 2708, 4217, 3742, 3994],
  [4443, 2058, 1210, 2208, 3331, 3081, 1032, 2421, 0, 2827, 1240, 2572, 3624, 3694, 2940, 3590, 1931, 2167, 1282, 1808, 1904, 1401],
  [1864, 4965, 1962, 2521, 1964, 1023, 3306, 1555, 2827, 0, 1588, 1672, 1069, 970, 934, 1597, 1040, 940, 2344, 4097, 3467, 4209],
  [3101, 3070, 981, 1619, 2609, 1817, 1618, 1751, 1240, 1588, 0, 1538, 2452, 2356, 1923, 2618, 918, 916, 915, 2386, 1881, 2419],
  [2811, 3883, 2462, 981, 3420, 985, 2374, 2831, 2572, 1672, 1538, 0, 2407, 1835, 2502, 3021, 1936, 957, 1438, 2842, 1865, 3298],
  [954, 5996, 2711, 3300, 1701, 1705, 4196, 1985, 3624, 1069, 2452, 2407, 0, 990, 1050, 919, 1889, 1896, 3184, 5067, 4148, 5162],
  [1359, 6169, 2849, 2922, 2497, 954, 4162, 2395, 3694, 970, 2356, 1835, 990, 0, 1598, 1857, 1966, 1565, 2997, 5094, 3983, 5253],
  [1899, 5319, 1859, 3222, 1050, 1935, 3682, 950, 2940, 934, 1923, 2502, 1050, 1598, 0, 950, 1130, 1673, 2831, 4581, 3865, 4523],
  [1416, 6115, 2583, 3775, 927, 2449, 4363, 1678, 3590, 1597, 2618, 3021, 919, 1857, 950, 0, 1972, 2355, 3455, 5305, 4505, 5256],
  [2678, 4084, 943, 2408, 1883, 1726, 2612, 955, 1931, 1040, 918, 1936, 1889, 1966, 1130, 1972, 0, 999, 1861, 3439, 2978, 3379],
  [2534, 3983, 1675, 1614, 2606, 932, 2406, 1908, 2167, 940, 916, 957, 1896, 1565, 1673, 2355, 999, 0, 1443, 3109, 2383, 3314],
  [3894, 2540, 1761, 947, 3525, 2207, 954, 2708, 1282, 2344, 915, 1438, 3184, 2997, 2831, 3455, 1861, 1443, 0, 1616, 964, 1886],
  [6326, 1235, 3019, 1951, 5230, 4017, 913, 4217, 1808, 4097, 2386, 2842, 5067, 5094, 4581, 5305, 3439, 3109, 1616, 0, 1067, 910],
  [5104, 2256, 2726, 911, 4607, 2978, 1013, 3742, 1904, 3467, 1881, 1865, 4148, 3983, 3865, 4505, 2978, 2383, 964, 1067, 0, 1746],
  [5893, 844, 2662, 2529, 5030, 4286, 961, 3994, 1401, 4209, 2419, 3298, 5162, 5253, 4523, 5256, 3379, 3314, 1886, 910, 1746, 0],
];

const FLAT_DISTANCE = flattenDistances(DISTANCE);
const ALL_COLORS_MASK = (1 << PALETTE_SIZE) - 1;
const ALL_DISPERSION = computeMaskDispersion(ALL_COLORS_MASK);

function flattenDistances(matrix: readonly (readonly number[])[]): Int32Array {
  const flat = new Int32Array(PALETTE_SIZE * PALETTE_SIZE);
  for (let row = 0; row < PALETTE_SIZE; row += 1) {
    for (let col = 0; col < PALETTE_SIZE; col += 1) {
      flat[row * PALETTE_SIZE + col] = matrix[row][col];
    }
  }
  return flat;
}

export function separateNeighbors(
  fixed: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number> = new Set()
): number[] {
  const first = solvePass(fixed, edges, reserved, false);
  if (!shouldFallbackReuse(first.score.min, fixed, reserved)) {
    return first.colors;
  }
  const fallback = solvePass(fixed, edges, reserved, true);
  return fallback.score.min > first.score.min ? fallback.colors : first.colors;
}

function shouldFallbackReuse(
  min: number,
  fixed: readonly number[],
  reserved: ReadonlySet<number>
): boolean {
  if (min >= SOFT_DISTINCT_FLOOR) {
    return false;
  }
  return reserved.size > 0 || fixed.some((color) => color >= 0);
}

function solvePass(
  fixed: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number>,
  forceReuse: boolean
): Candidate {
  const problem = buildProblem(fixed, edges, reserved, forceReuse);
  if (problem.free.length === 0) {
    const colors = fixed.slice();
    return { colors, score: scoreCandidate(colors, problem.baseUsed, problem), used: problem.baseUsed };
  }
  if (problem.free.length === 1) {
    return greedyStart(fixed, problem, -1);
  }
  return searchHillClimb(fixed, problem);
}

function buildProblem(
  fixed: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number>,
  forceReuse: boolean
): Problem {
  const { baseUsed, freeRaw, isFree } = scanFixed(fixed, reserved);
  const avail = countAvailable(baseUsed);
  const { adj, eu, ev } = activeGraph(fixed.length, edges, fixed);
  const free = orderFree(freeRaw, isFree, adj);
  const distinct = !forceReuse && free.length <= avail;
  const reuseMode = !distinct;
  const hasRecolorTarget = reuseMode || free.length < avail;
  return { adj, avail, baseUsed, distinct, eu, ev, forceReuse, free, hasRecolorTarget, reuseMode };
}

function scanFixed(
  fixed: readonly number[],
  reserved: ReadonlySet<number>
): { baseUsed: Uint8Array; freeRaw: number[]; isFree: Uint8Array } {
  const baseUsed = new Uint8Array(PALETTE_SIZE);
  for (const color of reserved) {
    baseUsed[color] = 1;
  }
  const onBoard = new Uint8Array(PALETTE_SIZE);
  const freeRaw: number[] = [];
  const isFree = new Uint8Array(fixed.length);
  for (let node = 0; node < fixed.length; node += 1) {
    const color = fixed[node];
    if (color >= 0) {
      baseUsed[color] = onBoard[color] ? baseUsed[color] + 1 : 1;
      onBoard[color] = 1;
    } else {
      freeRaw.push(node);
      isFree[node] = 1;
    }
  }
  return { baseUsed, freeRaw, isFree };
}

function countAvailable(used: Uint8Array): number {
  let avail = 0;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (used[color] === 0) {
      avail += 1;
    }
  }
  return avail;
}

function activeGraph(
  size: number,
  edges: readonly Edge[],
  fixed: readonly number[]
): { adj: number[][]; eu: Int32Array; ev: Int32Array } {
  const eu: number[] = [];
  const ev: number[] = [];
  const adj = Array.from({ length: size }, () => [] as number[]);
  for (const [left, right] of edges) {
    if (fixed[left] >= 0 && fixed[right] >= 0) {
      continue;
    }
    eu.push(left);
    ev.push(right);
    adj[left].push(right);
    adj[right].push(left);
  }
  return { adj, eu: Int32Array.from(eu), ev: Int32Array.from(ev) };
}

function orderFree(
  free: readonly number[],
  isFree: Uint8Array,
  adj: readonly (readonly number[])[]
): number[] {
  if (free.length <= 2) {
    return free.slice();
  }
  const visited = new Uint8Array(isFree.length);
  const ordered: number[] = [];
  while (ordered.length < free.length) {
    let cursor = pickLeastFreeNeighbor(free, isFree, visited, adj);
    while (cursor >= 0) {
      visited[cursor] = 1;
      ordered.push(cursor);
      cursor = pickLeastFreeNeighbor(adj[cursor], isFree, visited, adj);
    }
  }
  return ordered;
}

function pickLeastFreeNeighbor(
  candidates: readonly number[],
  isFree: Uint8Array,
  visited: Uint8Array,
  adj: readonly (readonly number[])[]
): number {
  let chosen = -1;
  let bestDegree = UNSEPARATED;
  for (const node of candidates) {
    if (!isFree[node] || visited[node]) {
      continue;
    }
    const degree = openFreeDegree(node, isFree, visited, adj);
    if (degree < bestDegree) {
      bestDegree = degree;
      chosen = node;
    }
  }
  return chosen;
}

function openFreeDegree(
  node: number,
  isFree: Uint8Array,
  visited: Uint8Array,
  adj: readonly (readonly number[])[]
): number {
  let degree = 0;
  for (const neighbor of adj[node]) {
    if (isFree[neighbor] && !visited[neighbor]) {
      degree += 1;
    }
  }
  return degree;
}

function searchHillClimb(fixed: readonly number[], problem: Problem): Candidate {
  const candidates = seedCandidates(fixed, problem);
  candidates.sort((left, right) => compareScores(right.score, left.score, problem.reuseMode));
  const best = candidates[0];
  if (problem.free.length > PALETTE_SIZE) {
    fastClimb(best, problem, CLIMB_ROUNDS);
    return best;
  }
  if (!problem.distinct || problem.free.length <= 2) {
    return best;
  }
  return polishCandidates(candidates, problem);
}

function seedCandidates(fixed: readonly number[], problem: Problem): Candidate[] {
  const rounds = problem.free.length > PALETTE_SIZE ? WIDE_STAGE_ROUNDS : CLIMB_ROUNDS;
  const candidates: Candidate[] = [];
  for (let start = 0; start < PALETTE_SIZE && candidates.length < MAX_STARTS; start += 1) {
    if (!problem.forceReuse && problem.avail > 0 && problem.baseUsed[start] > 0) {
      continue;
    }
    const candidate = greedyStart(fixed, problem, start);
    fastClimb(candidate, problem, rounds);
    candidates.push(candidate);
  }
  return candidates;
}

function greedyStart(fixed: readonly number[], problem: Problem, startColor: number): Candidate {
  const colors = fixed.slice();
  const used = problem.baseUsed.slice();
  let unusedLeft = problem.avail;
  const open = problem.free.slice();
  const trackDispersion = problem.free.length < problem.avail;
  if (startColor >= 0) {
    colors[open[0]] = startColor;
    if (used[startColor] === 0) {
      unusedLeft -= 1;
    }
    used[startColor] += 1;
    open.shift();
  }
  while (open.length > 0) {
    const node = open.splice(pickMostColored(open, colors, problem.adj), 1)[0];
    const preferFresh = !problem.forceReuse && unusedLeft > 0;
    const chosen = bestColorForNode(
      problem.adj[node],
      colors,
      used,
      preferFresh,
      problem.reuseMode,
      trackDispersion
    );
    colors[node] = chosen;
    if (used[chosen] === 0) {
      unusedLeft -= 1;
    }
    used[chosen] += 1;
  }
  return { colors, score: scoreCandidate(colors, used, problem), used };
}

function pickMostColored(
  open: readonly number[],
  colors: readonly number[],
  adj: readonly (readonly number[])[]
): number {
  let chosen = 0;
  let best = -1;
  for (let index = 0; index < open.length; index += 1) {
    const degree = coloredDegree(open[index], colors, adj);
    if (degree > best) {
      best = degree;
      chosen = index;
    }
  }
  return chosen;
}

function coloredDegree(
  node: number,
  colors: readonly number[],
  adj: readonly (readonly number[])[]
): number {
  let count = 0;
  for (const neighbor of adj[node]) {
    if (colors[neighbor] >= 0) {
      count += 1;
    }
  }
  return count;
}

function bestColorForNode(
  neighbors: readonly number[],
  colors: readonly number[],
  used: Uint8Array,
  freshOnly: boolean,
  reuseMode: boolean,
  trackDispersion: boolean
): number {
  let chosen = 0;
  let best: NodeFit | null = null;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (freshOnly && used[color] > 0) {
      continue;
    }
    const fit = evaluateNodeFit(neighbors, colors, used, color, trackDispersion);
    if (!best || outranksFit(fit, best, reuseMode)) {
      chosen = color;
      best = fit;
    }
  }
  return chosen;
}

function evaluateNodeFit(
  neighbors: readonly number[],
  colors: readonly number[],
  used: Uint8Array,
  color: number,
  trackDispersion: boolean
): NodeFit {
  let min = UNSEPARATED;
  let sum = 0;
  const row = color * PALETTE_SIZE;
  for (const neighbor of neighbors) {
    const neighborColor = colors[neighbor];
    if (neighborColor < 0) {
      continue;
    }
    const distance = FLAT_DISTANCE[row + neighborColor];
    sum += distance;
    if (distance < min) {
      min = distance;
    }
  }
  let pairMin = UNSEPARATED;
  if (trackDispersion) {
    for (let index = 0; index < colors.length; index += 1) {
      const existing = colors[index];
      if (existing >= 0 && existing !== color) {
        const distance = FLAT_DISTANCE[row + existing];
        if (distance < pairMin) {
          pairMin = distance;
        }
      }
    }
  }
  return { min, multiplicity: used[color], pairMin, sum };
}

function outranksFit(next: NodeFit, current: NodeFit, reuseMode: boolean): boolean {
  if (reuseMode) {
    const nextFloor = Math.min(next.min, REUSE_COMFORT_FLOOR);
    const currentFloor = Math.min(current.min, REUSE_COMFORT_FLOOR);
    if (nextFloor !== currentFloor) {
      return nextFloor > currentFloor;
    }
    if (next.multiplicity !== current.multiplicity) {
      return next.multiplicity < current.multiplicity;
    }
  }
  if (next.min !== current.min) {
    return next.min > current.min;
  }
  if (next.pairMin !== current.pairMin) {
    return next.pairMin > current.pairMin;
  }
  return next.sum > current.sum;
}

function fastClimb(candidate: Candidate, problem: Problem, maxRounds: number): void {
  for (let round = 0; round < maxRounds; round += 1) {
    let improved = false;
    for (let index = 0; index < problem.free.length; index += 1) {
      if (tryNodeSwaps(candidate, problem, index)) {
        improved = true;
      }
      if (problem.hasRecolorTarget && tryNodeRecolors(candidate, problem, problem.free[index])) {
        improved = true;
      }
    }
    if (!improved) {
      return;
    }
  }
}

function tryNodeSwaps(candidate: Candidate, problem: Problem, leftIndex: number): boolean {
  const left = problem.free[leftIndex];
  let improved = false;
  for (let rightIndex = leftIndex + 1; rightIndex < problem.free.length; rightIndex += 1) {
    const right = problem.free[rightIndex];
    if (candidate.colors[left] === candidate.colors[right]) {
      continue;
    }
    if (trySwapPair(candidate, left, right, problem)) {
      improved = true;
    }
  }
  return improved;
}

function tryNodeRecolors(candidate: Candidate, problem: Problem, node: number): boolean {
  const canDrop = problem.reuseMode && (problem.forceReuse || candidate.used[candidate.colors[node]] > 1);
  let improved = false;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    const previous = candidate.colors[node];
    if (color === previous || (candidate.used[color] > 0 && !canDrop)) {
      continue;
    }
    if (tryRecolorNode(candidate, node, color, problem)) {
      improved = true;
    }
  }
  return improved;
}

function trySwapPair(candidate: Candidate, left: number, right: number, problem: Problem): boolean {
  const { colors, score } = candidate;
  const leftColor = colors[left];
  const rightColor = colors[right];
  DELTA_ACC[0] = 0;
  DELTA_ACC[1] = 0;
  DELTA_ACC[2] = 0;
  if (!addNodeDelta(colors, left, rightColor, right, problem.adj, score.min)) {
    return false;
  }
  if (!addNodeDelta(colors, right, leftColor, left, problem.adj, score.min)) {
    return false;
  }
  const diff = DELTA_ACC[0] - DELTA_ACC[1];
  if (diff < 0 || (diff === 0 && DELTA_ACC[2] <= 0)) {
    return false;
  }
  colors[left] = rightColor;
  colors[right] = leftColor;
  applySwapDelta(candidate, problem, diff, DELTA_ACC[2]);
  return true;
}

function tryRecolorNode(
  candidate: Candidate,
  node: number,
  nextColor: number,
  problem: Problem
): boolean {
  const { colors, score, used } = candidate;
  const previous = colors[node];
  if (problem.reuseMode && score.min >= REUSE_COMFORT_FLOOR && used[nextColor] + 1 > score.reuseMax) {
    return false;
  }
  if (isReuseInvariant(problem.reuseMode, used[previous], used[nextColor], score.reuseMax)) {
    return tryRecolorFastDelta(candidate, node, nextColor, problem);
  }
  const floor = problem.reuseMode ? Math.min(score.min, REUSE_COMFORT_FLOOR) : score.min;
  colors[node] = nextColor;
  if (!incidentOk(colors, node, problem.adj, floor)) {
    colors[node] = previous;
    return false;
  }
  used[previous] -= 1;
  used[nextColor] += 1;
  const next = scoreCandidate(colors, used, problem);
  if (outranks(next, score, problem.reuseMode)) {
    candidate.score = next;
    return true;
  }
  used[nextColor] -= 1;
  used[previous] += 1;
  colors[node] = previous;
  return false;
}

function isReuseInvariant(
  reuseMode: boolean,
  previousCount: number,
  nextCount: number,
  reuseMax: number
): boolean {
  if (!reuseMode || previousCount <= 1 || nextCount === 0) {
    return false;
  }
  return nextCount + 1 === previousCount || (previousCount < reuseMax && nextCount + 1 <= reuseMax);
}

function tryRecolorFastDelta(
  candidate: Candidate,
  node: number,
  nextColor: number,
  problem: Problem
): boolean {
  const { colors, score, used } = candidate;
  const previous = colors[node];
  DELTA_ACC[0] = 0;
  DELTA_ACC[1] = 0;
  DELTA_ACC[2] = 0;
  if (!addNodeDelta(colors, node, nextColor, -1, problem.adj, score.min)) {
    return false;
  }
  const diff = DELTA_ACC[0] - DELTA_ACC[1];
  if (diff < 0 || (diff === 0 && DELTA_ACC[2] <= 0)) {
    return false;
  }
  colors[node] = nextColor;
  used[previous] -= 1;
  used[nextColor] += 1;
  applySwapDelta(candidate, problem, diff, DELTA_ACC[2]);
  return true;
}

function addNodeDelta(
  colors: readonly number[],
  node: number,
  nextColor: number,
  skip: number,
  adj: readonly (readonly number[])[],
  min: number
): boolean {
  const oldRow = colors[node] * PALETTE_SIZE;
  const newRow = nextColor * PALETTE_SIZE;
  const neighbors = adj[node];
  let lost = 0;
  let gained = 0;
  let sum = 0;
  for (let index = 0; index < neighbors.length; index += 1) {
    const other = neighbors[index];
    if (other === skip) {
      continue;
    }
    const otherColor = colors[other];
    const oldDist = FLAT_DISTANCE[oldRow + otherColor];
    const newDist = FLAT_DISTANCE[newRow + otherColor];
    if (newDist < min) {
      return false;
    }
    if (oldDist === min) {
      lost += 1;
    }
    if (newDist === min) {
      gained += 1;
    }
    sum += newDist - oldDist;
  }
  DELTA_ACC[0] += lost;
  DELTA_ACC[1] += gained;
  DELTA_ACC[2] += sum;
  return true;
}

function applySwapDelta(
  candidate: Candidate,
  problem: Problem,
  diff: number,
  deltaSum: number
): void {
  if (diff === candidate.score.count) {
    candidate.score = scorePermutation(candidate.colors, problem, candidate.score);
    return;
  }
  candidate.score.count -= diff;
  candidate.score.sum += deltaSum;
}

function polishCandidates(candidates: readonly Candidate[], problem: Problem): Candidate {
  let best = candidates[0];
  let polished = 0;
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = scoreKey(candidate.score);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    polishCandidate(candidate, problem);
    if (outranks(candidate.score, best.score, false)) {
      best = candidate;
    }
    polished += 1;
    if (polished >= POLISH_CANDIDATES) {
      break;
    }
  }
  return best;
}

function scoreKey(score: Separation): string {
  return `${score.min}:${score.count}:${score.pairMin}:${score.sum}`;
}

function polishCandidate(candidate: Candidate, problem: Problem): void {
  for (let round = 0; round < POLISH_ROUNDS; round += 1) {
    const improved = tryTwoOpt(candidate.colors, problem, candidate.score);
    if (!improved) {
      return;
    }
    candidate.score = improved;
    fastClimb(candidate, problem, CLIMB_ROUNDS);
  }
}

function tryTwoOpt(colors: number[], problem: Problem, score: Separation): Separation | null {
  const { adj, free } = problem;
  for (let start = 0; start < free.length - 1; start += 1) {
    for (let end = start + 2; end < free.length; end += 1) {
      reverseFreeSlice(colors, free, start, end);
      if (incidentOk(colors, free[start], adj, score.min) && incidentOk(colors, free[end], adj, score.min)) {
        const next = scorePermutation(colors, problem, score);
        if (outranks(next, score, problem.reuseMode)) {
          return next;
        }
      }
      reverseFreeSlice(colors, free, start, end);
    }
  }
  return null;
}

function reverseFreeSlice(colors: number[], free: readonly number[], start: number, end: number): void {
  for (let left = start, right = end; left < right; left += 1, right -= 1) {
    const u = free[left];
    const v = free[right];
    const saved = colors[u];
    colors[u] = colors[v];
    colors[v] = saved;
  }
}

function incidentOk(
  colors: readonly number[],
  node: number,
  adj: readonly (readonly number[])[],
  min: number
): boolean {
  const row = colors[node] * PALETTE_SIZE;
  const neighbors = adj[node];
  for (let index = 0; index < neighbors.length; index += 1) {
    if (FLAT_DISTANCE[row + colors[neighbors[index]]] < min) {
      return false;
    }
  }
  return true;
}

function scoreCandidate(
  colors: readonly number[],
  used: Uint8Array,
  problem: Problem
): Separation {
  const edge = scoreEdges(colors, problem.eu, problem.ev);
  const metrics = paletteMetrics(colors, used);
  return { ...edge, ...metrics };
}

function scorePermutation(
  colors: readonly number[],
  problem: Problem,
  base: Separation
): Separation {
  const edge = scoreEdges(colors, problem.eu, problem.ev);
  return {
    count: edge.count,
    min: edge.min,
    pairCount: base.pairCount,
    pairMin: base.pairMin,
    reuseExcess: base.reuseExcess,
    reuseMax: base.reuseMax,
    sum: edge.sum,
  };
}

function scoreEdges(
  colors: readonly number[],
  eu: Int32Array,
  ev: Int32Array
): { count: number; min: number; sum: number } {
  if (eu.length === 0) {
    return { count: 0, min: UNSEPARATED, sum: 0 };
  }
  let min = UNSEPARATED;
  let count = 0;
  let sum = 0;
  for (let index = 0; index < eu.length; index += 1) {
    const distance = FLAT_DISTANCE[colors[eu[index]] * PALETTE_SIZE + colors[ev[index]]];
    sum += distance;
    if (distance < min) {
      min = distance;
      count = 1;
    } else if (distance === min) {
      count += 1;
    }
  }
  return { count, min, sum };
}

function paletteMetrics(colors: readonly number[], used: Uint8Array): PaletteMetrics {
  let reuseMax = 0;
  let reuseExcess = 0;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    const count = used[color];
    if (count > reuseMax) {
      reuseMax = count;
    }
    if (count > 1) {
      reuseExcess += count - 1;
    }
  }
  let boardMask = 0;
  for (let index = 0; index < colors.length; index += 1) {
    boardMask |= 1 << colors[index];
  }
  const dispersion = maskDispersion(boardMask);
  return { pairCount: dispersion.count, pairMin: dispersion.min, reuseExcess, reuseMax };
}

function maskDispersion(boardMask: number): { count: number; min: number } {
  if (boardMask === ALL_COLORS_MASK) {
    return ALL_DISPERSION;
  }
  return computeMaskDispersion(boardMask);
}

function computeMaskDispersion(boardMask: number): { count: number; min: number } {
  let min = UNSEPARATED;
  let count = 0;
  for (let first = 0; first < PALETTE_SIZE; first += 1) {
    if ((boardMask & (1 << first)) === 0) {
      continue;
    }
    const row = first * PALETTE_SIZE;
    for (let second = first + 1; second < PALETTE_SIZE; second += 1) {
      if ((boardMask & (1 << second)) === 0) {
        continue;
      }
      const distance = FLAT_DISTANCE[row + second];
      if (distance < min) {
        min = distance;
        count = 1;
      } else if (distance === min) {
        count += 1;
      }
    }
  }
  return { count, min };
}

function compareScores(left: Separation, right: Separation, reuseMode: boolean): number {
  if (reuseMode) {
    const reuseRank = compareReusePriority(left, right);
    if (reuseRank !== 0) {
      return reuseRank;
    }
  }
  if (left.min !== right.min) {
    return left.min - right.min;
  }
  if (left.count !== right.count) {
    return right.count - left.count;
  }
  if (left.pairMin !== right.pairMin) {
    return left.pairMin - right.pairMin;
  }
  if (left.pairCount !== right.pairCount) {
    return right.pairCount - left.pairCount;
  }
  return left.sum - right.sum;
}

function compareReusePriority(left: Separation, right: Separation): number {
  const leftFloor = Math.min(left.min, REUSE_COMFORT_FLOOR);
  const rightFloor = Math.min(right.min, REUSE_COMFORT_FLOOR);
  if (leftFloor !== rightFloor) {
    return leftFloor - rightFloor;
  }
  if (left.reuseMax !== right.reuseMax) {
    return right.reuseMax - left.reuseMax;
  }
  return right.reuseExcess - left.reuseExcess;
}

function outranks(next: Separation, current: Separation, reuseMode: boolean): boolean {
  return compareScores(next, current, reuseMode) > 0;
}
