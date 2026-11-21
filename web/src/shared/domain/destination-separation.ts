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
const CLIMB_ROUNDS = 40;
const WIDE_STAGE_ROUNDS = 4;
const POLISH_ROUNDS = 20;
const POLISH_CANDIDATES = 4;

type Edge = readonly [number, number];

interface Separation {
  count: number;
  min: number;
  sum: number;
}

interface Problem {
  adj: number[][];
  avail: number;
  baseUsed: Uint8Array;
  distinct: boolean;
  eu: Int32Array;
  ev: Int32Array;
  free: number[];
  hasRecolorTarget: boolean;
  isFree: Uint8Array;
}

interface Candidate {
  colors: number[];
  score: Separation;
  used: Uint8Array;
}

const DELTA_ACC = new Int32Array(3);

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

const FLAT_DISTANCE = flattenDistances(DISTANCE);

function flattenDistances(matrix: readonly (readonly number[])[]): Int32Array {
  const flat = new Int32Array(PALETTE_SIZE * PALETTE_SIZE);
  for (let row = 0; row < PALETTE_SIZE; row += 1) {
    for (let col = 0; col < PALETTE_SIZE; col += 1) {
      flat[(row << 4) | col] = matrix[row][col];
    }
  }
  return flat;
}

export function separateNeighbors(
  fixed: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number> = new Set()
): number[] {
  const problem = buildProblem(fixed, edges, reserved);
  if (problem.free.length === 0) {
    return fixed.slice();
  }
  if (problem.free.length === 1) {
    return greedyStart(fixed, problem, -1).colors;
  }
  return searchHillClimb(fixed, problem);
}

function buildProblem(
  fixed: readonly number[],
  edges: readonly Edge[],
  reserved: ReadonlySet<number>
): Problem {
  const baseUsed = new Uint8Array(PALETTE_SIZE);
  for (const color of reserved) {
    baseUsed[color] = 1;
  }
  const freeRaw: number[] = [];
  const isFree = new Uint8Array(fixed.length);
  for (let node = 0; node < fixed.length; node += 1) {
    if (fixed[node] >= 0) {
      baseUsed[fixed[node]] = 1;
    } else {
      freeRaw.push(node);
      isFree[node] = 1;
    }
  }
  const avail = countAvailable(baseUsed);
  const { adj, eu, ev } = activeGraph(fixed.length, edges, fixed);
  const free = orderFree(freeRaw, isFree, adj);
  const distinct = free.length <= avail;
  const hasRecolorTarget = !distinct || free.length < avail;
  return { adj, avail, baseUsed, distinct, eu, ev, free, hasRecolorTarget, isFree };
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

function searchHillClimb(fixed: readonly number[], problem: Problem): number[] {
  const candidates = seedCandidates(fixed, problem);
  candidates.sort((left, right) => compareScores(right.score, left.score));
  const best = candidates[0];
  if (problem.free.length > PALETTE_SIZE) {
    fastClimb(best, problem, CLIMB_ROUNDS);
    return best.colors;
  }
  if (!problem.distinct || problem.free.length <= 2) {
    return best.colors;
  }
  return polishCandidates(candidates, problem).colors;
}

function seedCandidates(fixed: readonly number[], problem: Problem): Candidate[] {
  const rounds = problem.free.length > PALETTE_SIZE ? WIDE_STAGE_ROUNDS : CLIMB_ROUNDS;
  const candidates: Candidate[] = [];
  for (let start = 0; start < PALETTE_SIZE; start += 1) {
    if (problem.avail > 0 && problem.baseUsed[start] > 0) {
      continue;
    }
    const { colors, used } = greedyStart(fixed, problem, start);
    const candidate: Candidate = {
      colors,
      score: scoreGraph(colors, problem.eu, problem.ev),
      used,
    };
    fastClimb(candidate, problem, rounds);
    candidates.push(candidate);
  }
  return candidates;
}

function greedyStart(
  fixed: readonly number[],
  problem: Problem,
  startColor: number
): { colors: number[]; used: Uint8Array } {
  const colors = fixed.slice();
  const used = problem.baseUsed.slice();
  let unusedLeft = problem.avail;
  const open = problem.free.slice();
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
    const chosen = bestColorForNode(problem.adj[node], colors, used, unusedLeft > 0);
    colors[node] = chosen;
    if (used[chosen] === 0) {
      unusedLeft -= 1;
    }
    used[chosen] += 1;
  }
  return { colors, used };
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
  freshOnly: boolean
): number {
  let chosen = 0;
  let bestMin = -1;
  let bestSum = -1;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (freshOnly && used[color] > 0) {
      continue;
    }
    const fit = againstColored(neighbors, colors, color);
    if (fit.min > bestMin || (fit.min === bestMin && fit.sum > bestSum)) {
      chosen = color;
      bestMin = fit.min;
      bestSum = fit.sum;
    }
  }
  return chosen;
}

function againstColored(
  neighbors: readonly number[],
  colors: readonly number[],
  color: number
): { min: number; sum: number } {
  let min = UNSEPARATED;
  let sum = 0;
  for (const neighbor of neighbors) {
    const neighborColor = colors[neighbor];
    if (neighborColor < 0) {
      continue;
    }
    const distance = FLAT_DISTANCE[(neighborColor << 4) | color];
    sum += distance;
    if (distance < min) {
      min = distance;
    }
  }
  return { min, sum };
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
  const canDrop = !problem.distinct && candidate.used[candidate.colors[node]] > 1;
  let improved = false;
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    const previous = candidate.colors[node];
    if (color === previous || (candidate.used[color] > 0 && !canDrop)) {
      continue;
    }
    if (tryRecolorNode(candidate, node, color, problem)) {
      candidate.used[previous] -= 1;
      candidate.used[color] += 1;
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
  applyDeltaInPlace(candidate, problem, diff, DELTA_ACC[2]);
  return true;
}

function tryRecolorNode(
  candidate: Candidate,
  node: number,
  nextColor: number,
  problem: Problem
): boolean {
  const { colors, score } = candidate;
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
  applyDeltaInPlace(candidate, problem, diff, DELTA_ACC[2]);
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
  const oldRow = colors[node] << 4;
  const newRow = nextColor << 4;
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
    const oldDist = FLAT_DISTANCE[oldRow | otherColor];
    const newDist = FLAT_DISTANCE[newRow | otherColor];
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

function applyDeltaInPlace(
  candidate: Candidate,
  problem: Problem,
  diff: number,
  deltaSum: number
): void {
  if (diff === candidate.score.count) {
    candidate.score = scoreGraph(candidate.colors, problem.eu, problem.ev);
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
    const key = `${candidate.score.min}:${candidate.score.count}:${candidate.score.sum}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    polishCandidate(candidate, problem);
    if (outranks(candidate.score, best.score)) {
      best = candidate;
    }
    polished += 1;
    if (polished >= POLISH_CANDIDATES) {
      break;
    }
  }
  return best;
}

function polishCandidate(candidate: Candidate, problem: Problem): void {
  for (let round = 0; round < POLISH_ROUNDS; round += 1) {
    const improved = nextPolishMove(candidate, problem);
    if (!improved) {
      return;
    }
    candidate.score = improved;
    fastClimb(candidate, problem, CLIMB_ROUNDS);
  }
}

function nextPolishMove(candidate: Candidate, problem: Problem): Separation | null {
  return (
    tryTwoOpt(candidate.colors, problem, candidate.score) ??
    tryRelocate(candidate.colors, problem, candidate.score) ??
    (problem.hasRecolorTarget ? tryUnusedShift(candidate, problem) : null) ??
    tryBottleneckCycle(candidate.colors, problem, candidate.score)
  );
}

function tryTwoOpt(colors: number[], problem: Problem, score: Separation): Separation | null {
  const { adj, eu, ev, free } = problem;
  for (let start = 0; start < free.length - 1; start += 1) {
    for (let end = start + 2; end < free.length; end += 1) {
      reverseFreeSlice(colors, free, start, end);
      if (incidentOk(colors, free[start], adj, score.min) && incidentOk(colors, free[end], adj, score.min)) {
        const next = scoreGraph(colors, eu, ev);
        if (outranks(next, score)) {
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

function tryRelocate(colors: number[], problem: Problem, score: Separation): Separation | null {
  for (let index = 0; index < problem.free.length; index += 1) {
    const moved =
      tryRelocateDirection(colors, problem, index, 1, score) ??
      tryRelocateDirection(colors, problem, index, -1, score);
    if (moved) {
      return moved;
    }
  }
  return null;
}

function tryRelocateDirection(
  colors: number[],
  problem: Problem,
  start: number,
  step: 1 | -1,
  score: Separation
): Separation | null {
  const { adj, eu, ev, free } = problem;
  const saved = colors[free[start]];
  const limit = step > 0 ? free.length : -1;
  let last = start;
  for (let target = start + step; target !== limit; target += step) {
    colors[free[target - step]] = colors[free[target]];
    colors[free[target]] = saved;
    last = target;
    if (
      Math.abs(target - start) > 1 &&
      incidentOk(colors, free[target], adj, score.min) &&
      incidentOk(colors, free[start], adj, score.min)
    ) {
      const next = scoreGraph(colors, eu, ev);
      if (outranks(next, score)) {
        return next;
      }
    }
  }
  for (let cursor = last; cursor !== start; cursor -= step) {
    colors[free[cursor]] = colors[free[cursor - step]];
  }
  colors[free[start]] = saved;
  return null;
}

function tryUnusedShift(candidate: Candidate, problem: Problem): Separation | null {
  for (let color = 0; color < PALETTE_SIZE; color += 1) {
    if (candidate.used[color] > 0) {
      continue;
    }
    const shifted = tryShiftColor(candidate, problem, color);
    if (shifted) {
      return shifted;
    }
  }
  return null;
}

function tryShiftColor(candidate: Candidate, problem: Problem, unusedColor: number): Separation | null {
  const { colors, score, used } = candidate;
  const { adj, eu, ev, free } = problem;
  for (const first of free) {
    const firstColor = colors[first];
    for (const second of free) {
      if (first === second) {
        continue;
      }
      const secondColor = colors[second];
      colors[first] = secondColor;
      colors[second] = unusedColor;
      if (incidentOk(colors, first, adj, score.min) && incidentOk(colors, second, adj, score.min)) {
        const next = scoreGraph(colors, eu, ev);
        if (outranks(next, score)) {
          used[firstColor] -= 1;
          used[unusedColor] += 1;
          return next;
        }
      }
      colors[first] = firstColor;
      colors[second] = secondColor;
    }
  }
  return null;
}

function tryBottleneckCycle(colors: number[], problem: Problem, score: Separation): Separation | null {
  for (const target of bottleneckNodes(colors, problem, score.min)) {
    const cycled = tryCycleFrom(colors, target, problem, score);
    if (cycled) {
      return cycled;
    }
  }
  return null;
}

function bottleneckNodes(colors: readonly number[], problem: Problem, min: number): number[] {
  const nodes: number[] = [];
  const seen = new Uint8Array(colors.length);
  for (let edge = 0; edge < problem.eu.length; edge += 1) {
    const left = problem.eu[edge];
    const right = problem.ev[edge];
    if (FLAT_DISTANCE[(colors[left] << 4) | colors[right]] !== min) {
      continue;
    }
    if (problem.isFree[left] && !seen[left]) {
      seen[left] = 1;
      nodes.push(left);
    }
    if (problem.isFree[right] && !seen[right]) {
      seen[right] = 1;
      nodes.push(right);
    }
  }
  return nodes;
}

function tryCycleFrom(
  colors: number[],
  first: number,
  problem: Problem,
  score: Separation
): Separation | null {
  const { adj, eu, ev, free } = problem;
  const firstColor = colors[first];
  for (const second of free) {
    if (second === first || colors[second] === firstColor) {
      continue;
    }
    const secondColor = colors[second];
    for (const third of free) {
      if (third === first || third === second) {
        continue;
      }
      const thirdColor = colors[third];
      colors[first] = secondColor;
      colors[second] = thirdColor;
      colors[third] = firstColor;
      if (
        incidentOk(colors, first, adj, score.min) &&
        incidentOk(colors, second, adj, score.min) &&
        incidentOk(colors, third, adj, score.min)
      ) {
        const next = scoreGraph(colors, eu, ev);
        if (outranks(next, score)) {
          return next;
        }
      }
      colors[first] = firstColor;
      colors[second] = secondColor;
      colors[third] = thirdColor;
    }
  }
  return null;
}

function incidentOk(
  colors: readonly number[],
  node: number,
  adj: readonly (readonly number[])[],
  min: number
): boolean {
  const row = colors[node] << 4;
  const neighbors = adj[node];
  for (let index = 0; index < neighbors.length; index += 1) {
    if (FLAT_DISTANCE[row | colors[neighbors[index]]] < min) {
      return false;
    }
  }
  return true;
}

function scoreGraph(colors: readonly number[], eu: Int32Array, ev: Int32Array): Separation {
  if (eu.length === 0) {
    return { count: 0, min: UNSEPARATED, sum: 0 };
  }
  let min = UNSEPARATED;
  let count = 0;
  let sum = 0;
  for (let index = 0; index < eu.length; index += 1) {
    const distance = FLAT_DISTANCE[(colors[eu[index]] << 4) | colors[ev[index]]];
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

function compareScores(left: Separation, right: Separation): number {
  if (left.min !== right.min) {
    return left.min - right.min;
  }
  if (left.count !== right.count) {
    return right.count - left.count;
  }
  return left.sum - right.sum;
}

function outranks(next: Separation, current: Separation): boolean {
  return compareScores(next, current) > 0;
}
