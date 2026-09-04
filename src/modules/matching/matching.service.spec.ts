import { NotFoundException } from "@nestjs/common";
import {
  AlgorithmKey,
  Gender,
  LookingFor,
} from "../../generated/prisma/client";
import {
  BUDGET_WEIGHT,
  MATCH_SHORTLIST_SIZE,
  MatchingService,
} from "./matching.service";

const housingPreference = (overrides: Record<string, unknown> = {}) => ({
  id: "housing",
  userId: "user",
  city: "Berlin",
  countryCode: "DE",
  minMonthlyBudget: 800,
  maxMonthlyBudget: 1_200,
  currency: "EUR",
  moveInDate: new Date("2026-10-15T00:00:00.000Z"),
  preferredAreas: [],
  preferredRoommateGenders: [Gender.MAN],
  ...overrides,
});

const lifestyleProfile = {
  id: "lifestyle",
  userId: "user",
  cleanliness: 3,
  socialLevel: 3,
  sleepSchedule: 3,
  noiseTolerance: 3,
  guestsFrequency: 3,
  smokingAllowed: false,
  petsAllowed: true,
  hasPets: false,
};

const profile = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    email: `${id}@example.test`,
    displayName: id,
    avatarUrl: null,
    bio: null,
    gender: Gender.WOMAN,
    lookingFor: LookingFor.all,
    housingPreference: housingPreference({ userId: id }),
    lifestyleProfile: { ...lifestyleProfile, userId: id },
    testAttempts: [],
    musicGenres: [],
    favoriteArtists: [],
    movieGenres: [],
    favoriteMovies: [],
    ...overrides,
  }) as never;

const thinCandidate = (id: string) => {
  const full = profile(id) as {
    id: string;
    housingPreference: unknown;
    lifestyleProfile: unknown;
  };
  return {
    id: full.id,
    housingPreference: full.housingPreference,
    lifestyleProfile: full.lifestyleProfile,
  };
};

describe("MatchingService", () => {
  const user = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  };
  const algorithmConfig = {
    findMany: jest.fn(),
  };
  const prisma = { user, algorithmConfig };
  const lifestyle = {
    key: AlgorithmKey.LIFESTYLE,
    version: "1.0.0",
    score: jest.fn((..._args: unknown[]) => ({ score: 0.75, explanation: {} })),
  };
  const personality = {
    key: AlgorithmKey.PERSONALITY,
    version: "1.0.0",
    score: jest.fn((..._args: unknown[]) => ({ score: 0.5, explanation: {} })),
  };
  const registry = {
    get: jest.fn((key: AlgorithmKey) =>
      key === AlgorithmKey.LIFESTYLE ? lifestyle : personality,
    ),
  };
  const service = new MatchingService(prisma as never, registry as never);

  beforeEach(() => {
    jest.clearAllMocks();
    lifestyle.score.mockReturnValue({ score: 0.75, explanation: {} });
    personality.score.mockReturnValue({ score: 0.5, explanation: {} });
  });

  it("requires a subject with housing preferences", async () => {
    user.findUnique.mockResolvedValue(null);

    await expect(
      service.find({ userId: "missing", limit: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("pushes hard eligibility rules into the database query but keeps budget soft", async () => {
    user.findUnique.mockResolvedValue(profile("subject"));
    algorithmConfig.findMany.mockResolvedValue([]);
    user.findMany.mockResolvedValue([]);

    await expect(
      service.find({ userId: "subject", limit: 20 }),
    ).resolves.toEqual({ matches: [] });

    const broadQuery = user.findMany.mock.calls[0][0];
    expect(broadQuery).toEqual({
      where: {
        id: { not: "subject" },
        blocksInitiated: { none: { blockedId: "subject" } },
        blocksReceived: { none: { blockerId: "subject" } },
        isDiscoverable: true,
        onboardingComplete: true,
        AND: [
          {
            lookingFor: {
              in: [LookingFor.female, LookingFor.all],
            },
          },
        ],
        gender: { in: [Gender.MAN] },
        housingPreference: {
          countryCode: "DE",
          city: { equals: "Berlin", mode: "insensitive" },
          currency: "EUR",
          preferredRoommateGenders: { has: Gender.WOMAN },
        },
      },
      select: {
        id: true,
        housingPreference: true,
        lifestyleProfile: true,
      },
    });
    expect(prisma).not.toHaveProperty("matchRun");
    expect(prisma).not.toHaveProperty("matchResult");
    expect(prisma).not.toHaveProperty("matchAlgorithmScore");
  });

  it("keeps candidates outside the budget range and ranks budget-compatible candidates higher", async () => {
    const compatible = profile("compatible");
    const outsideBudget = profile("outside-budget", {
      housingPreference: housingPreference({
        userId: "outside-budget",
        minMonthlyBudget: 1_500,
        maxMonthlyBudget: 1_800,
      }),
    });
    user.findUnique.mockResolvedValue(profile("subject"));
    algorithmConfig.findMany.mockResolvedValue([
      {
        key: AlgorithmKey.PERSONALITY,
        weight: 1,
        version: "1.0.0",
        settings: {},
      },
    ]);
    user.findMany
      .mockResolvedValueOnce([
        thinCandidate("outside-budget"),
        thinCandidate("compatible"),
      ])
      .mockResolvedValueOnce([outsideBudget, compatible]);

    const result = await service.find({ userId: "subject", limit: 20 });

    expect(result.matches.map(({ user: match }) => match.id)).toEqual([
      "compatible",
      "outside-budget",
    ]);
    expect(result.matches[1].breakdown).toContainEqual({
      key: "BUDGET",
      score: 0,
      weight: BUDGET_WEIGHT,
      version: "1.0.0",
      explanation: {
        overlaps: false,
        subjectRange: [800, 1_200],
        candidateRange: [1_500, 1_800],
        currency: "EUR",
      },
    });
  });

  it("runs cheap lifestyle scoring broadly but expensive scoring for only 50 candidates", async () => {
    const candidates = Array.from({ length: 100 }, (_, index) =>
      thinCandidate(`candidate-${String(index).padStart(3, "0")}`),
    );
    const hydrated = candidates
      .slice(0, MATCH_SHORTLIST_SIZE)
      .map(({ id }) => profile(id));
    user.findUnique.mockResolvedValue(profile("subject"));
    algorithmConfig.findMany.mockResolvedValue([
      {
        key: AlgorithmKey.LIFESTYLE,
        weight: 1,
        version: "1.0.0",
        settings: {},
      },
      {
        key: AlgorithmKey.PERSONALITY,
        weight: 1,
        version: "1.0.0",
        settings: {},
      },
    ]);
    user.findMany
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce(hydrated);

    const result = await service.find({ userId: "subject", limit: 20 });

    expect(lifestyle.score).toHaveBeenCalledTimes(100);
    expect(personality.score).toHaveBeenCalledTimes(MATCH_SHORTLIST_SIZE);
    expect(result.matches).toHaveLength(20);
    expect(user.findMany.mock.calls[1][0].where.AND[1].id.in).toHaveLength(
      MATCH_SHORTLIST_SIZE,
    );
    expect(user.findMany.mock.calls[1][0]).toHaveProperty(
      "include.testAttempts",
    );
    expect(user.findMany.mock.calls[0][0]).not.toHaveProperty("include");
  });

  it("applies the subject's lookingFor choice before scoring candidates", async () => {
    user.findUnique.mockResolvedValue(
      profile("subject", { lookingFor: LookingFor.female }),
    );
    algorithmConfig.findMany.mockResolvedValue([]);
    user.findMany.mockResolvedValue([]);

    await service.find({ userId: "subject", limit: 20 });

    expect(user.findMany.mock.calls[0][0].where.AND).toContainEqual({
      gender: Gender.WOMAN,
    });
  });

  it("re-queries current users on every request so new candidates appear immediately", async () => {
    const first = profile("candidate-a");
    const second = profile("candidate-b");
    let broadSearch = 0;
    user.findUnique.mockResolvedValue(profile("subject"));
    algorithmConfig.findMany.mockResolvedValue([
      {
        key: AlgorithmKey.PERSONALITY,
        weight: 1,
        version: "1.0.0",
        settings: {},
      },
    ]);
    user.findMany.mockImplementation((query) => {
      if (query.select) {
        broadSearch += 1;
        return Promise.resolve(
          (broadSearch === 1 ? [first] : [first, second]).map(({ id }) =>
            thinCandidate(id),
          ),
        );
      }
      const ids = query.where.AND[1].id.in as string[];
      return Promise.resolve(
        [first, second].filter(({ id }) => ids.includes(id)),
      );
    });

    const beforeSignup = await service.find({
      userId: "subject",
      limit: 20,
    });
    const afterSignup = await service.find({ userId: "subject", limit: 20 });

    expect(beforeSignup.matches.map(({ user }) => user.id)).toEqual([
      "candidate-a",
    ]);
    expect(afterSignup.matches.map(({ user }) => user.id)).toEqual([
      "candidate-a",
      "candidate-b",
    ]);
    expect(user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("uses current algorithm inputs and returns final matches in score order", async () => {
    const candidates = [profile("lower"), profile("higher")];
    user.findUnique
      .mockResolvedValueOnce(profile("subject", { bio: "version-one" }))
      .mockResolvedValueOnce(profile("subject", { bio: "version-two" }));
    algorithmConfig.findMany.mockResolvedValue([
      {
        key: AlgorithmKey.PERSONALITY,
        weight: 1,
        version: "1.0.0",
        settings: {},
      },
    ]);
    user.findMany.mockImplementation((query) =>
      Promise.resolve(
        query.select
          ? candidates.map(({ id }) => thinCandidate(id))
          : candidates,
      ),
    );
    personality.score.mockImplementation((...args: unknown[]) => {
      const [subject, candidate] = args as Array<{
        id: string;
        bio: string | null;
      }>;
      return {
        score:
          subject.bio === "version-two"
            ? candidate.id === "higher"
              ? 1
              : 0
            : candidate.id === "lower"
              ? 1
              : 0,
        explanation: {},
      };
    });

    const first = await service.find({ userId: "subject", limit: 20 });
    const secondResult = await service.find({ userId: "subject", limit: 20 });

    expect(first).not.toHaveProperty("runId");
    expect(first.matches[0].user.id).toBe("lower");
    expect(secondResult.matches[0].user.id).toBe("higher");
  });
});
