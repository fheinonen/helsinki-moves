import {
  buildIndex,
  queriesFromLines,
  recommend,
  search,
  type AromaIndex,
  type Query,
  type RecommendedLine,
} from "../../vendor/aroma-typescript/src/index.ts";

const MIN_QUERY_FEATURES = 30;
const MIN_SIMILARITY = 0.71;
const SIMILAR_LIMIT = 3;

export type CorpusFile = {
  readonly path: string;
  readonly source: string;
};

export type ChangedFile = CorpusFile & {
  readonly lines: readonly number[];
};

export type SimilarMethod = {
  readonly path: string;
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly similarity: number;
};

export type MethodPlace = {
  readonly path: string;
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
};

export type SharedCode = MethodPlace & {
  readonly similarity: number;
  readonly alsoIn: readonly MethodPlace[];
  readonly added: readonly string[];
};

export type ChangeReview = {
  readonly path: string;
  readonly methodName: string;
  readonly similar: readonly SimilarMethod[];
  readonly recommendations: readonly SharedCode[];
};

export function reviewChanges(
  corpus: readonly CorpusFile[],
  changes: readonly ChangedFile[]
): readonly ChangeReview[] {
  const index = buildIndex(corpus);
  return changes.flatMap((change) => reviewsFor(index, change));
}

function reviewsFor(index: AromaIndex, change: ChangedFile): ChangeReview[] {
  const reviews: ChangeReview[] = [];
  for (const query of queriesFromLines(index, change, change.lines)) {
    const origin = query.origin;
    if (query.size < MIN_QUERY_FEATURES || origin === undefined) {
      continue;
    }
    reviews.push({
      path: change.path,
      methodName: origin.name,
      similar: similarMethods(index, query),
      recommendations: sharedCode(index, query),
    });
  }
  return reviews;
}

function similarMethods(index: AromaIndex, query: Query): SimilarMethod[] {
  return search(index, query, { minSimilarity: MIN_SIMILARITY, limit: SIMILAR_LIMIT }).map((hit) => ({
    path: hit.method.path,
    name: hit.method.name,
    startLine: hit.method.startLine,
    endLine: hit.method.endLine,
    similarity: hit.similarity,
  }));
}

function sharedCode(index: AromaIndex, query: Query): SharedCode[] {
  return recommend(index, query).map((recommendation) => {
    const method = recommendation.members[0];
    return {
      path: method.path,
      name: method.name,
      startLine: method.startLine,
      endLine: method.endLine,
      similarity: recommendation.similarity,
      alsoIn: recommendation.members.slice(1).map((member) => ({
        path: member.path,
        name: member.name,
        startLine: member.startLine,
        endLine: member.endLine,
      })),
      added: addedLines(recommendation.lines),
    };
  });
}

function addedLines(lines: readonly RecommendedLine[]): string[] {
  return lines.filter((line) => line.role === "added").map((line) => line.text.trim());
}
