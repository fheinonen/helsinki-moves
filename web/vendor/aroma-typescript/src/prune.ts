/** A multiset of features: how many times each feature id occurs. */
export type Multiset = ReadonlyMap<number, number>;

/**
 * The features of a snippet's non-keyword tokens: token `i` has
 * `features[offsets[i]]` up to, not including, `features[offsets[i + 1]]`.
 */
export type TokenTable = { features: Int32Array; offsets: Uint32Array };

export type Pruned = {
  /** Indexes of the tokens kept, ascending. */
  tokens: number[];
  /** SimScore: the size of the multiset intersection of the target and the kept tokens' features. */
  score: number;
};

/**
 * Algorithm 1 of the paper: the tokens of a snippet that it has in common with
 * `target`, chosen greedily. Each step adds the token that raises the
 * similarity to the target most, the earliest one on a tie, and it stops when
 * no token raises it.
 *
 * A token's gain never grows as tokens are added, because a feature the target
 * has can only get closer to used up. So a token whose gain was computed
 * earlier and has not changed is still the best one, and the search rechecks
 * tokens from the highest earlier gain down instead of rescanning them all.
 *
 * @param candidates The tokens to choose from; all of them when omitted.
 */
export function prune(target: Multiset, table: TokenTable, candidates?: ArrayLike<number>): Pruned {
  const { features, offsets } = table;
  const used = new Map<number, number>();
  const gain = (token: number): number => {
    const start = offsets[token]!;
    const end = offsets[token + 1]!;
    let total = 0;
    for (let at = start; at < end; at += 1) {
      const feature = features[at]!;
      const capacity = target.get(feature);
      if (capacity === undefined) {
        continue;
      }
      let taken = used.get(feature) ?? 0;
      for (let earlier = start; earlier < at; earlier += 1) {
        if (features[earlier] === feature) {
          taken += 1;
        }
      }
      if (taken < capacity) {
        total += 1;
      }
    }
    return total;
  };

  const buckets: number[][] = [];
  const add = (token: number, value: number) => {
    if (value > 0) {
      (buckets[value] ??= []).push(token);
    }
  };
  const count = candidates ? candidates.length : offsets.length - 1;
  for (let at = 0; at < count; at += 1) {
    const token = candidates ? candidates[at]! : at;
    add(token, gain(token));
  }

  const tokens: number[] = [];
  let score = 0;
  for (let value = buckets.length - 1; value > 0; value -= 1) {
    const bucket = buckets[value];
    if (!bucket) {
      continue;
    }
    // Tokens only ever move to a lower bucket, so this one is complete.
    bucket.sort((a, b) => a - b);
    for (const token of bucket) {
      const current = gain(token);
      if (current < value) {
        add(token, current);
        continue;
      }
      tokens.push(token);
      score += value;
      for (let at = offsets[token]!; at < offsets[token + 1]!; at += 1) {
        const feature = features[at]!;
        if (target.has(feature)) {
          used.set(feature, (used.get(feature) ?? 0) + 1);
        }
      }
    }
  }
  tokens.sort((a, b) => a - b);
  return { tokens, score };
}
