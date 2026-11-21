export const DESTINATION_COLORS = [
  "#ffdf00",
  "#9e88ff",
  "#a29989",
  "#fdfffd",
  "#d2ccff",
  "#c69920",
  "#c8deac",
  "#9499a7",
  "#becccf",
  "#ecd176",
  "#d2f0fe",
  "#b08fcb",
  "#b7abff",
  "#9fb9cd",
  "#e0fede",
  "#cbcbbc",
  "#e9ffb0",
  "#b8a9aa",
  "#ffff75",
  "#a9ba92",
  "#fc886e",
  "#dbbb0e",
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

// Minimum CIEDE2000 across normal vision, protanopia, protanomaly, deuteranopia, and deuteranomaly,
// in hundredths, for DESTINATION_COLORS in farthest-point order.
const DISTANCE = [
  [0, 6362, 2991, 2942, 4905, 1701, 1782, 4139, 3306, 949, 3902, 5319, 5671, 4213, 2312, 2542, 1481, 3127, 861, 2153, 1747, 862],
  [6362, 0, 3518, 3571, 1812, 5834, 4673, 1781, 2266, 5634, 2448, 929, 911, 1346, 4377, 3605, 5565, 2606, 6753, 4218, 3952, 6053],
  [2991, 3518, 0, 2553, 2984, 1998, 1709, 1501, 1710, 2264, 2696, 2649, 3242, 2073, 2244, 1316, 2531, 868, 3007, 860, 913, 2448],
  [2942, 3571, 2553, 0, 1933, 3355, 1650, 2594, 1181, 2432, 930, 2921, 2763, 1940, 894, 1289, 1909, 1905, 2567, 2109, 2684, 3077],
  [4905, 1812, 2984, 1933, 0, 4752, 3317, 1794, 1302, 4292, 934, 1412, 921, 931, 2837, 2404, 4170, 1928, 4948, 3199, 3472, 4821],
  [1701, 5834, 1998, 3355, 4752, 0, 1943, 3400, 3201, 1377, 4098, 4645, 5303, 3864, 2761, 2368, 2196, 2499, 2079, 1668, 854, 847],
  [1782, 4673, 1709, 1650, 3317, 1943, 0, 2851, 1878, 981, 2457, 3684, 3993, 2830, 886, 881, 876, 1667, 1567, 879, 1163, 1763],
  [4139, 1781, 1501, 2594, 1794, 3400, 2851, 0, 1391, 3506, 2096, 984, 1676, 892, 2902, 1951, 3720, 903, 4354, 2271, 2458, 3752],
  [3306, 2266, 1710, 1181, 1302, 3201, 1878, 1391, 0, 2680, 940, 1788, 1764, 886, 1655, 902, 2544, 887, 3167, 1756, 2378, 3197],
  [949, 5634, 2264, 2432, 4292, 1377, 981, 3506, 2680, 0, 3377, 4591, 5000, 3592, 1710, 1816, 874, 2420, 920, 1315, 972, 874],
  [3902, 2448, 2696, 930, 934, 4098, 2457, 2096, 940, 3377, 0, 2110, 1690, 1294, 1885, 1706, 2987, 1827, 3708, 2567, 3278, 3971],
  [5319, 929, 2649, 2921, 1412, 4645, 3684, 984, 1788, 4591, 2110, 0, 919, 895, 3524, 2737, 4681, 1905, 5507, 3221, 3192, 4951],
  [5671, 911, 3242, 2763, 921, 5303, 3993, 1676, 1764, 5000, 1690, 919, 0, 962, 3611, 3001, 5058, 2213, 5901, 3691, 3687, 5470],
  [4213, 1346, 2073, 1940, 931, 3864, 2830, 892, 886, 3592, 1294, 895, 962, 0, 2649, 1800, 3661, 1092, 4370, 2529, 2933, 4008],
  [2312, 4377, 2244, 894, 2837, 2761, 886, 2902, 1655, 1710, 1885, 3524, 3611, 2649, 0, 996, 1094, 1874, 1900, 1574, 2028, 2462],
  [2542, 3605, 1316, 1289, 2404, 2368, 881, 1951, 902, 1816, 1706, 2737, 3001, 1800, 996, 0, 1663, 908, 2342, 863, 1631, 2358],
  [1481, 5565, 2531, 1909, 4170, 2196, 876, 3720, 2544, 874, 2987, 4681, 5058, 3661, 1094, 1663, 0, 2476, 870, 1677, 1599, 1709],
  [3127, 2606, 868, 1905, 1928, 2499, 1667, 903, 887, 2420, 1827, 1905, 2213, 1092, 1874, 908, 2476, 0, 3026, 1133, 1688, 2727],
  [861, 6753, 3007, 2567, 4948, 2079, 1567, 4354, 3167, 920, 3708, 5507, 5901, 4370, 1900, 2342, 870, 3026, 0, 2175, 1811, 1380],
  [2153, 4218, 860, 2109, 3199, 1668, 879, 2271, 1756, 1315, 2567, 3221, 3691, 2529, 1574, 863, 1677, 1133, 2175, 0, 867, 1771],
  [1747, 3952, 913, 2684, 3472, 854, 1163, 2458, 2378, 972, 3278, 3192, 3687, 2933, 2028, 1631, 1599, 1688, 1811, 867, 0, 1103],
  [862, 6053, 2448, 3077, 4821, 847, 1763, 3752, 3197, 874, 3971, 4951, 5470, 4008, 2462, 2358, 1709, 2727, 1380, 1771, 1103, 0],
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
