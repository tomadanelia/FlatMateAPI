import { Injectable } from "@nestjs/common";
import { AlgorithmKey } from "../../../generated/prisma/client";
import {
  AlgorithmScore,
  MatchingAlgorithm,
  MatchProfile,
} from "./matching-algorithm";

type TasteDimension = "musicGenres" | "artists" | "movieGenres" | "movies";

interface TasteChoice {
  id: string;
  name: string;
}

interface DimensionScore {
  score: number;
  weight: number;
  shared: string[];
}

const DEFAULT_WEIGHTS: Record<TasteDimension, number> = {
  musicGenres: 1,
  artists: 1.5,
  movieGenres: 1,
  movies: 1.5,
};

function configuredWeight(
  settings: Record<string, unknown>,
  dimension: TasteDimension,
): number {
  const configured = settings[`${dimension}Weight`];
  return typeof configured === "number" &&
    Number.isFinite(configured) &&
    configured >= 0
    ? configured
    : DEFAULT_WEIGHTS[dimension];
}

function jaccard(
  left: TasteChoice[],
  right: TasteChoice[],
  weight: number,
): DimensionScore | null {
  // A dimension is evidence only when both users answered it. Missing answers
  // must not be interpreted as incompatible taste.
  if (!left.length || !right.length || weight === 0) return null;

  const leftById = new Map(left.map((choice) => [choice.id, choice.name]));
  const rightIds = new Set(right.map((choice) => choice.id));
  const shared = [...leftById]
    .filter(([id]) => rightIds.has(id))
    .map(([, name]) => name)
    .sort((a, b) => a.localeCompare(b));
  const union = new Set([...leftById.keys(), ...rightIds]);

  return { score: shared.length / union.size, weight, shared };
}

@Injectable()
export class TasteAlgorithm implements MatchingAlgorithm {
  readonly key = AlgorithmKey.TASTE;
  readonly version = "2.0.0";

  score(
    a: MatchProfile,
    b: MatchProfile,
    settings: Record<string, unknown> = {},
  ): AlgorithmScore | null {
    const choices = (profile: MatchProfile) => ({
      musicGenres: profile.musicGenres.map(({ musicGenre }) => musicGenre),
      artists: profile.favoriteArtists.map(({ artist }) => artist),
      movieGenres: profile.movieGenres.map(({ movieGenre }) => movieGenre),
      movies: profile.favoriteMovies.map(({ movie }) => ({
        id: movie.id,
        name: movie.title,
      })),
    });
    const left = choices(a);
    const right = choices(b);
    const dimensions = (
      Object.keys(DEFAULT_WEIGHTS) as TasteDimension[]
    ).flatMap((dimension) => {
      const result = jaccard(
        left[dimension],
        right[dimension],
        configuredWeight(settings, dimension),
      );
      return result ? [[dimension, result] as const] : [];
    });

    if (!dimensions.length) return null;

    const totalWeight = dimensions.reduce(
      (sum, [, dimension]) => sum + dimension.weight,
      0,
    );
    const score =
      dimensions.reduce(
        (sum, [, dimension]) => sum + dimension.score * dimension.weight,
        0,
      ) / totalWeight;
    const byDimension = Object.fromEntries(
      dimensions.map(([name, dimension]) => [
        name,
        {
          score: dimension.score,
          weight: dimension.weight,
          shared: dimension.shared.slice(0, 12),
        },
      ]),
    );

    return {
      score,
      explanation: {
        comparedDimensions: dimensions.map(([name]) => name),
        byDimension,
      },
    };
  }
}
