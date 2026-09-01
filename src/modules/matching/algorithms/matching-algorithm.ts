import { AlgorithmKey, Prisma } from "../../../generated/prisma/client";

export const matchProfileInclude = {
  housingPreference: true,
  lifestyleProfile: true,
  musicGenres: { include: { musicGenre: true } },
  favoriteArtists: { include: { artist: true } },
  movieGenres: { include: { movieGenre: true } },
  favoriteMovies: { include: { movie: true } },
  testAttempts: {
    where: { completedAt: { not: null } },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: 1,
    include: { traitScores: true },
  },
} as const satisfies Prisma.UserInclude;
export type MatchProfile = Prisma.UserGetPayload<{
  include: typeof matchProfileInclude;
}>;
export interface AlgorithmScore {
  score: number;
  explanation: Record<string, unknown>;
}
export interface MatchingAlgorithm {
  readonly key: AlgorithmKey;
  readonly version: string;
  score(
    subject: MatchProfile,
    candidate: MatchProfile,
    settings: Record<string, unknown>,
  ): AlgorithmScore | null;
}
export function similarity(a: number, b: number, range = 1) {
  return Math.max(0, 1 - Math.abs(a - b) / range);
}
