import { AlgorithmKey, Prisma } from '@prisma/client';

export const matchProfileInclude = Prisma.validator<Prisma.UserInclude>()({
  housingPreference: true,
  lifestyleProfile: true,
  tasteItems: true,
  testAttempts: { where: { completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, take: 1, include: { traitScores: true } },
});
export type MatchProfile = Prisma.UserGetPayload<{ include: typeof matchProfileInclude }>;
export interface AlgorithmScore { score: number; explanation: Record<string, unknown>; }
export interface MatchingAlgorithm {
  readonly key: AlgorithmKey;
  readonly version: string;
  score(subject: MatchProfile, candidate: MatchProfile, settings: Record<string, unknown>): AlgorithmScore | null;
}
export function similarity(a: number, b: number, range = 1) { return Math.max(0, 1 - Math.abs(a - b) / range); }
