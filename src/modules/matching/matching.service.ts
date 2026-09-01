import { Injectable, NotFoundException } from "@nestjs/common";
import { AlgorithmKey, Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AlgorithmRegistry } from "./algorithm.registry";
import {
  AlgorithmScore,
  MatchProfile,
  matchProfileInclude,
} from "./algorithms/matching-algorithm";
import { FindMatchesDto } from "./dto/find-matches.dto";

export const MATCH_SHORTLIST_SIZE = 50;

type EnabledConfig = {
  key: AlgorithmKey;
  weight: number;
  version: string;
  settings: unknown;
};

type ScoreBreakdown = AlgorithmScore & {
  key: AlgorithmKey;
  weight: number;
  version: string;
};

@Injectable()
export class MatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AlgorithmRegistry,
  ) {}

  async find(dto: FindMatchesDto) {
    const subject = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      include: matchProfileInclude,
    });
    if (!subject?.housingPreference) {
      throw new NotFoundException("User or housing preference not found");
    }

    const configs: EnabledConfig[] = await this.prisma.algorithmConfig.findMany(
      {
        where: {
          enabled: true,
          ...(dto.algorithms?.length ? { key: { in: dto.algorithms } } : {}),
        },
      },
    );
    const candidateWhere = this.candidateWhere(subject);

    // Keep the broad query cheap. Personality tests and taste relations are
    // deliberately loaded only after this set has been reduced to 50 users.
    const candidates = await this.prisma.user.findMany({
      where: candidateWhere,
      select: {
        id: true,
        housingPreference: true,
        lifestyleProfile: true,
      },
    });

    const lifestyleConfig = configs.find(
      ({ key }) => key === AlgorithmKey.LIFESTYLE,
    );
    const lifestyleAlgorithm = lifestyleConfig
      ? this.registry.get(AlgorithmKey.LIFESTYLE)
      : undefined;
    const cachedLifestyle = new Map<string, ScoreBreakdown>();

    const shortlistIds = candidates
      .map((candidate) => {
        const quickScores = [this.budgetScore(subject, candidate)];

        if (lifestyleConfig && lifestyleAlgorithm) {
          const result = lifestyleAlgorithm.score(
            subject,
            candidate as MatchProfile,
            this.settings(lifestyleConfig),
          );
          if (result) {
            quickScores.push(result.score);
            cachedLifestyle.set(candidate.id, {
              key: lifestyleConfig.key,
              score: result.score,
              weight: lifestyleConfig.weight,
              version: lifestyleConfig.version || lifestyleAlgorithm.version,
              explanation: result.explanation,
            });
          }
        }

        return {
          id: candidate.id,
          quickScore:
            quickScores.reduce((sum, score) => sum + score, 0) /
            quickScores.length,
        };
      })
      .sort(
        (left, right) =>
          right.quickScore - left.quickScore || left.id.localeCompare(right.id),
      )
      .slice(0, MATCH_SHORTLIST_SIZE)
      .map(({ id }) => id);

    if (!shortlistIds.length) return { matches: [] };

    const hydrated = await this.prisma.user.findMany({
      where: { AND: [candidateWhere, { id: { in: shortlistIds } }] },
      include: matchProfileInclude,
    });
    const byId = new Map(
      hydrated.map((candidate) => [candidate.id, candidate]),
    );
    const shortlistedCandidates = shortlistIds.flatMap((id) => {
      const candidate = byId.get(id);
      return candidate ? [candidate] : [];
    });

    const ranked = shortlistedCandidates
      .map((candidate) => {
        const scores = configs.flatMap((config) => {
          if (config.key === AlgorithmKey.LIFESTYLE) {
            const cached = cachedLifestyle.get(candidate.id);
            return cached ? [cached] : [];
          }
          const algorithm = this.registry.get(config.key);
          const result = algorithm?.score(
            subject,
            candidate,
            this.settings(config),
          );
          return algorithm && result
            ? [
                {
                  key: config.key,
                  score: result.score,
                  weight: config.weight,
                  version: config.version || algorithm.version,
                  explanation: result.explanation,
                },
              ]
            : [];
        });
        const totalWeight = scores.reduce(
          (sum, score) => sum + score.weight,
          0,
        );
        return {
          candidate,
          scores,
          totalScore: totalWeight
            ? scores.reduce(
                (sum, score) => sum + score.score * score.weight,
                0,
              ) / totalWeight
            : 0,
        };
      })
      .filter(({ scores }) => scores.length > 0)
      .sort(
        (left, right) =>
          right.totalScore - left.totalScore ||
          left.candidate.id.localeCompare(right.candidate.id),
      )
      .slice(0, dto.limit);

    return {
      matches: ranked.map((item, index) => ({
        rank: index + 1,
        score: item.totalScore,
        user: {
          id: item.candidate.id,
          displayName: item.candidate.displayName,
          avatarUrl: item.candidate.avatarUrl,
          bio: item.candidate.bio,
        },
        breakdown: item.scores,
      })),
    };
  }

  private candidateWhere(subject: MatchProfile): Prisma.UserWhereInput {
    const preference = subject.housingPreference!;
    const housingPreference: Prisma.HousingPreferenceWhereInput = {
      countryCode: preference.countryCode,
      city: { equals: preference.city, mode: "insensitive" },
      currency: preference.currency,
      minMonthlyBudget: { lte: preference.maxMonthlyBudget },
      maxMonthlyBudget: { gte: preference.minMonthlyBudget },
      ...(subject.gender
        ? { preferredRoommateGenders: { has: subject.gender } }
        : {}),
    };

    return {
      id: { not: subject.id },
      blocksInitiated: { none: { blockedId: subject.id } },
      blocksReceived: { none: { blockerId: subject.id } },
      isDiscoverable: true,
      onboardingComplete: true,
      gender: { in: preference.preferredRoommateGenders },
      housingPreference,
    };
  }

  private budgetScore(
    subject: Pick<MatchProfile, "housingPreference">,
    candidate: Pick<MatchProfile, "housingPreference">,
  ) {
    const left = subject.housingPreference!;
    const right = candidate.housingPreference!;
    const overlap =
      Math.min(left.maxMonthlyBudget, right.maxMonthlyBudget) -
      Math.max(left.minMonthlyBudget, right.minMonthlyBudget);
    const union =
      Math.max(left.maxMonthlyBudget, right.maxMonthlyBudget) -
      Math.min(left.minMonthlyBudget, right.minMonthlyBudget);
    return union === 0 ? 1 : Math.max(0, overlap / union);
  }

  private settings(config: EnabledConfig) {
    return (config.settings ?? {}) as Record<string, unknown>;
  }
}
