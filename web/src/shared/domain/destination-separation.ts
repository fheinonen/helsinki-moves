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
const NEIGHBOR_FLOOR = 2900;
const REUSE_FLOOR = 3500;
const TWO_HOP_FLOOR = 1600;
const CLOSE_PAIR_FLOOR = 1400;
const DIVERSE_PAIR_FLOOR = 1500;
const SCARCITY_SPARE_LIMIT = 2;
const MAX_STARTS = 12;
const CLIMB_ROUNDS = 40;
const WIDE_ROUNDS = 4;
const POLISH_ROUNDS = 20;
const EPS = 1e-6;

type Edge = readonly [number, number];

interface Problem {
  adj: number[][];
  adj2: number[][];
  avail: number;
  baseUsed: Uint8Array;
  distinct: boolean;
  edges: readonly Edge[];
  fixed: readonly number[];
  forceReuse: boolean;
  free: number[];
  reuseMode: boolean;
  sparse: boolean;
  w1: Float64Array;
}

interface Candidate {
  colors: number[];
  energy: number;
  used: Uint8Array;
}

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

const { flatDistance, w1Distinct, w1Reuse, w2Cost, wpCost } = buildEnergyTables(DISTANCE);

function buildEnergyTables(matrix: readonly (readonly number[])[]) {
  const flatDistance = new Int32Array(PALETTE_SIZE * PALETTE_SIZE);
  const w1Distinct = new Float64Array(PALETTE_SIZE * PALETTE_SIZE);
  const w1Reuse = new Float64Array(PALETTE_SIZE * PALETTE_SIZE);
  const w2Cost = new Float64Array(PALETTE_SIZE * PALETTE_SIZE);
  const wpCost = new Float64Array(PALETTE_SIZE * PALETTE_SIZE);
  for (let row = 0; row < PALETTE_SIZE; row += 1) {
    for (let col = 0; col < PALETTE_SIZE; col += 1) {
      const idx = row * PALETTE_SIZE + col;
      const d = matrix[row][col];
      flatDistance[idx] = d;
      w1Distinct[idx] = d < NEIGHBOR_FLOOR ? 1e8 * Math.exp((NEIGHBOR_FLOOR - d) / 140) : -d;
      w1Reuse[idx] = d < REUSE_FLOOR ? 1e8 * Math.exp((REUSE_FLOOR - d) / 160) : -d;
      w2Cost[idx] = d < TWO_HOP_FLOOR ? 3e5 * Math.exp((TWO_HOP_FLOOR - d) / 100) : 0;
      wpCost[idx] = pairPenalty(row, col, d);
    }
  }
  return { flatDistance, w1Distinct, w1Reuse, w2Cost, wpCost };
}

function pairPenalty(row: number, col: number, distance: number): number {
  if (row === col) {
    return 0;
  }
  if (distance < CLOSE_PAIR_FLOOR) {
    return 3e6 + 1e5 * Math.exp((CLOSE_PAIR_FLOOR - distance) / 150);
  }
  if (distance < DIVERSE_PAIR_FLOOR) {
    return 5e5;
  }
  return 1e4 * Math.exp((1800 - distance) / 180);
}

function reuseCost(count: number): number {
  return count <= 1 ? 0 : 5e7 * (count - 1) * (count - 1);
}

export function separateNeighbors(
  fixed: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number> = new Set()
): number[] {
  const problem = buildProblem(fixed, edges, reserved, false);
  const first = solveProblem(problem);
  const firstMin = minActiveEdge(first, problem);
  if (!shouldFallbackReuse(firstMin, problem)) {
    return first;
  }
  const fallbackProblem = buildProblem(fixed, edges, reserved, true);
  const fallback = solveProblem(fallbackProblem);
  return minActiveEdge(fallback, fallbackProblem) > firstMin ? fallback : first;
}

function shouldFallbackReuse(minEdge: number, problem: Problem): boolean {
  if (minEdge >= NEIGHBOR_FLOOR || problem.reuseMode) {
    return false;
  }
  return problem.avail < PALETTE_SIZE && problem.avail - problem.free.length <= SCARCITY_SPARE_LIMIT;
}

function buildProblem(
  fixed: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number>,
  forceReuse: boolean
): Problem {
  const { avail, baseUsed, free } = scanFixed(fixed, reserved);
  const distinct = !forceReuse && free.length <= avail;
  const reuseMode = !distinct;
  const sparse = !reuseMode && free.length < avail;
  const { adj, adj2 } = buildGraphs(fixed, edges, sparse);
  const w1 = reuseMode ? w1Reuse : w1Distinct;
  return { adj, adj2, avail, baseUsed, distinct, edges, fixed, forceReuse, free, reuseMode, sparse, w1 };
}

function scanFixed(
  fixed: readonly number[],
  reserved: ReadonlySet<number>
): { avail: number; baseUsed: Uint8Array; free: number[] } {
  const baseUsed = new Uint8Array(PALETTE_SIZE);
  for (const color of reserved) {
    baseUsed[color] = 1;
  }
  const onBoard = new Uint8Array(PALETTE_SIZE);
  const free: number[] = [];
  for (let node = 0; node < fixed.length; node += 1) {
    const color = fixed[node];
    if (color >= 0) {
      baseUsed[color] = onBoard[color] ? baseUsed[color] + 1 : 1;
      onBoard[color] = 1;
    } else {
      free.push(node);
    }
  }
  let avail = 0;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (baseUsed[color] === 0) {
      avail += 1;
    }
  }
  return { avail, baseUsed, free };
}

function buildGraphs(
  fixed: readonly number[],
  edges: readonly Edge[],
  sparse: boolean
): { adj: number[][]; adj2: number[][] } {
  const size = fixed.length;
  const adj = Array.from({ length: size }, () => [] as number[]);
  const fullAdj = Array.from({ length: size }, () => [] as number[]);
  const direct = new Set<number>();
  for (const [left, right] of edges) {
    fullAdj[left].push(right);
    fullAdj[right].push(left);
    direct.add(pairCode(left, right, size));
    if (fixed[left] < 0 || fixed[right] < 0) {
      adj[left].push(right);
      adj[right].push(left);
    }
  }
  const adj2 = Array.from({ length: size }, () => [] as number[]);
  if (sparse) {
    const seen = new Set<number>();
    for (let mid = 0; mid < size; mid += 1) {
      addTwoHopNeighbors(fullAdj[mid], fixed, direct, seen, adj2);
    }
  }
  return { adj, adj2 };
}

function addTwoHopNeighbors(
  neighbors: readonly number[],
  fixed: readonly number[],
  direct: ReadonlySet<number>,
  seen: Set<number>,
  adj2: number[][]
): void {
  const size = fixed.length;
  for (let i = 0; i < neighbors.length; i += 1) {
    for (let j = i + 1; j < neighbors.length; j += 1) {
      const left = neighbors[i];
      const right = neighbors[j];
      if (left === right || (fixed[left] >= 0 && fixed[right] >= 0)) {
        continue;
      }
      const code = pairCode(left, right, size);
      if (direct.has(code) || seen.has(code)) {
        continue;
      }
      seen.add(code);
      adj2[left].push(right);
      adj2[right].push(left);
    }
  }
}

function pairCode(left: number, right: number, size: number): number {
  return left < right ? left * size + right : right * size + left;
}

function solveProblem(problem: Problem): number[] {
  if (problem.free.length <= 1) {
    return greedyStart(problem, -1).colors;
  }
  const best = bestSeededCandidate(problem);
  if (problem.free.length > PALETTE_SIZE) {
    climb(best, problem, CLIMB_ROUNDS);
  } else if (problem.distinct && problem.free.length > 2) {
    polishTwoOpt(best, problem);
  }
  return best.colors;
}

function bestSeededCandidate(problem: Problem): Candidate {
  const wide = problem.free.length > PALETTE_SIZE;
  const rounds = wide ? WIDE_ROUNDS : CLIMB_ROUNDS;
  const maxStarts = wide ? 6 : MAX_STARTS;
  let best: Candidate | null = null;
  let tried = 0;
  for (let start = 0; start < PALETTE_SIZE && tried < maxStarts; start += 1) {
    if (!problem.forceReuse && problem.avail > 0 && problem.baseUsed[start] > 0) {
      continue;
    }
    const candidate = greedyStart(problem, start);
    climb(candidate, problem, rounds);
    candidate.energy = totalEnergy(candidate.colors, candidate.used, problem);
    if (!best || candidate.energy < best.energy) {
      best = candidate;
    }
    tried += 1;
  }
  return best as Candidate;
}

function greedyStart(problem: Problem, startColor: number): Candidate {
  const colors = problem.fixed.slice();
  const used = problem.baseUsed.slice();
  let unusedLeft = problem.avail;
  let index = 0;
  if (startColor >= 0) {
    colors[problem.free[0]] = startColor;
    if (used[startColor] === 0) {
      unusedLeft -= 1;
    }
    used[startColor] += 1;
    index = 1;
  }
  for (; index < problem.free.length; index += 1) {
    const node = problem.free[index];
    const freshOnly = !problem.forceReuse && unusedLeft > 0;
    const chosen = bestGreedyColor(node, colors, used, freshOnly, problem);
    colors[node] = chosen;
    if (used[chosen] === 0) {
      unusedLeft -= 1;
    }
    used[chosen] += 1;
  }
  return { colors, energy: 0, used };
}

function bestGreedyColor(
  node: number,
  colors: readonly number[],
  used: Uint8Array,
  freshOnly: boolean,
  problem: Problem
): number {
  let chosen = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (freshOnly && used[color] > 0) {
      continue;
    }
    let cost = nodeEdgeCost(colors, node, color, -1, problem);
    if (problem.sparse) {
      cost += nodePairCost(used, color, -1);
    }
    if (problem.reuseMode) {
      cost += reuseCost(used[color] + 1) - reuseCost(used[color]);
    }
    if (cost < bestCost) {
      bestCost = cost;
      chosen = color;
    }
  }
  return chosen;
}

function climb(candidate: Candidate, problem: Problem, maxRounds: number): void {
  const canRecolor = problem.reuseMode || problem.sparse;
  for (let round = 0; round < maxRounds; round += 1) {
    let improved = false;
    for (let index = 0; index < problem.free.length; index += 1) {
      if (trySwapsFrom(candidate.colors, problem, index)) {
        improved = true;
      }
      if (canRecolor && tryBestRecolor(candidate, problem.free[index], problem)) {
        improved = true;
      }
    }
    if (!improved) {
      return;
    }
  }
}

function trySwapsFrom(colors: number[], problem: Problem, leftIndex: number): boolean {
  const left = problem.free[leftIndex];
  let improved = false;
  for (let rightIndex = leftIndex + 1; rightIndex < problem.free.length; rightIndex += 1) {
    const right = problem.free[rightIndex];
    const leftColor = colors[left];
    const rightColor = colors[right];
    if (leftColor === rightColor) {
      continue;
    }
    const delta =
      nodeEdgeCost(colors, left, rightColor, right, problem) -
      nodeEdgeCost(colors, left, leftColor, right, problem) +
      nodeEdgeCost(colors, right, leftColor, left, problem) -
      nodeEdgeCost(colors, right, rightColor, left, problem);
    if (delta < -EPS) {
      colors[left] = rightColor;
      colors[right] = leftColor;
      improved = true;
    }
  }
  return improved;
}

function tryBestRecolor(candidate: Candidate, node: number, problem: Problem): boolean {
  const { colors, used } = candidate;
  const previous = colors[node];
  const canDrop = problem.reuseMode && (problem.forceReuse || used[previous] > 1);
  const baseEdge = nodeEdgeCost(colors, node, previous, -1, problem);
  const basePair = problem.sparse ? nodePairCost(used, previous, -1) : 0;
  let bestColor = -1;
  let bestDelta = -EPS;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (color === previous || (used[color] > 0 && !canDrop)) {
      continue;
    }
    const delta = recolorDelta(colors, used, node, previous, color, baseEdge, basePair, problem);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestColor = color;
    }
  }
  if (bestColor < 0) {
    return false;
  }
  used[previous] -= 1;
  used[bestColor] += 1;
  colors[node] = bestColor;
  return true;
}

function recolorDelta(
  colors: readonly number[],
  used: Uint8Array,
  node: number,
  previous: number,
  next: number,
  baseEdge: number,
  basePair: number,
  problem: Problem
): number {
  let delta = nodeEdgeCost(colors, node, next, -1, problem) - baseEdge;
  if (problem.sparse) {
    delta += nodePairCost(used, next, previous) - basePair;
  }
  if (problem.reuseMode) {
    delta +=
      reuseCost(used[next] + 1) -
      reuseCost(used[next]) +
      reuseCost(used[previous] - 1) -
      reuseCost(used[previous]);
  }
  return delta;
}

function nodeEdgeCost(
  colors: readonly number[],
  node: number,
  color: number,
  skip: number,
  problem: Problem
): number {
  const row = color * PALETTE_SIZE;
  let cost = 0;
  for (const neighbor of problem.adj[node]) {
    if (neighbor !== skip && colors[neighbor] >= 0) {
      cost += problem.w1[row + colors[neighbor]];
    }
  }
  if (problem.sparse) {
    for (const neighbor of problem.adj2[node]) {
      if (neighbor !== skip && colors[neighbor] >= 0) {
        cost += w2Cost[row + colors[neighbor]];
      }
    }
  }
  return cost;
}

function nodePairCost(used: Uint8Array, color: number, skipColor: number): number {
  const row = color * PALETTE_SIZE;
  let cost = 0;
  for (let other = 0; other < PALETTE_SIZE; other += 1) {
    if (other !== color && other !== skipColor && used[other] > 0) {
      cost += wpCost[row + other];
    }
  }
  return cost;
}

function polishTwoOpt(candidate: Candidate, problem: Problem): void {
  for (let round = 0; round < POLISH_ROUNDS; round += 1) {
    if (!tryTwoOptSlice(candidate, problem)) {
      return;
    }
    climb(candidate, problem, CLIMB_ROUNDS);
    candidate.energy = totalEnergy(candidate.colors, candidate.used, problem);
  }
}

function tryTwoOptSlice(candidate: Candidate, problem: Problem): boolean {
  const { colors, used } = candidate;
  const { free } = problem;
  for (let start = 0; start < free.length - 1; start += 1) {
    for (let end = start + 2; end < free.length; end += 1) {
      reverseSlice(colors, free, start, end);
      const nextEnergy = totalEnergy(colors, used, problem);
      if (nextEnergy < candidate.energy - EPS) {
        candidate.energy = nextEnergy;
        return true;
      }
      reverseSlice(colors, free, start, end);
    }
  }
  return false;
}

function reverseSlice(colors: number[], free: readonly number[], start: number, end: number): void {
  for (let left = start, right = end; left < right; left += 1, right -= 1) {
    const u = free[left];
    const v = free[right];
    const saved = colors[u];
    colors[u] = colors[v];
    colors[v] = saved;
  }
}

function totalEnergy(colors: readonly number[], used: Uint8Array, problem: Problem): number {
  let energy = 0;
  for (const [left, right] of problem.edges) {
    if (problem.fixed[left] < 0 || problem.fixed[right] < 0) {
      energy += problem.w1[colors[left] * PALETTE_SIZE + colors[right]];
    }
  }
  if (problem.sparse) {
    energy += sparseEnergy(colors, used, problem.adj2);
  }
  if (problem.reuseMode) {
    for (let color = 0; color < PALETTE_SIZE; color += 1) {
      energy += reuseCost(used[color]);
    }
  }
  return energy;
}

function sparseEnergy(colors: readonly number[], used: Uint8Array, adj2: readonly (readonly number[])[]): number {
  let energy = 0;
  for (let node = 0; node < adj2.length; node += 1) {
    for (const neighbor of adj2[node]) {
      if (node < neighbor) {
        energy += w2Cost[colors[node] * PALETTE_SIZE + colors[neighbor]];
      }
    }
  }
  for (let first = 0; first < PALETTE_SIZE; first += 1) {
    if (used[first] === 0) {
      continue;
    }
    for (let second = first + 1; second < PALETTE_SIZE; second += 1) {
      if (used[second] > 0) {
        energy += wpCost[first * PALETTE_SIZE + second];
      }
    }
  }
  return energy;
}

function minActiveEdge(colors: readonly number[], problem: Problem): number {
  let min = UNSEPARATED;
  for (const [left, right] of problem.edges) {
    if (problem.fixed[left] < 0 || problem.fixed[right] < 0) {
      const distance = flatDistance[colors[left] * PALETTE_SIZE + colors[right]];
      if (distance < min) {
        min = distance;
      }
    }
  }
  return min;
}
