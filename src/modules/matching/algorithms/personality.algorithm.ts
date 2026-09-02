import { Injectable } from "@nestjs/common";
import { AlgorithmKey } from "../../../generated/prisma/client";
import {
  AlgorithmScore,
  MatchingAlgorithm,
  MatchProfile,
  similarity,
} from "./matching-algorithm";

type BigFiveTrait =
  | "conscientiousness"
  | "neuroticism"
  | "agreeableness"
  | "extraversion"
  | "openness";

type TraitModel = "similarity" | "low-stress" | "cooperative";

const TRAITS: BigFiveTrait[] = [
  "conscientiousness",
  "neuroticism",
  "agreeableness",
  "extraversion",
  "openness",
];

// These are product priors, not clinical effect sizes. Admins can tune each
// value through algorithm settings such as `conscientiousnessWeight`.
const DEFAULT_WEIGHTS: Record<BigFiveTrait, number> = {
  conscientiousness: 0.3,
  neuroticism: 0.25,
  agreeableness: 0.2,
  extraversion: 0.15,
  openness: 0.1,
};

const MODELS: Record<BigFiveTrait, TraitModel> = {
  conscientiousness: "similarity",
  neuroticism: "low-stress",
  agreeableness: "cooperative",
  extraversion: "similarity",
  openness: "similarity",
};

function clamp(score: number) {
  return Math.max(0, Math.min(1, score));
}

function configuredWeight(
  settings: Record<string, unknown>,
  trait: BigFiveTrait,
) {
  const configured = settings[`${trait}Weight`];
  return typeof configured === "number" &&
    Number.isFinite(configured) &&
    configured >= 0
    ? configured
    : DEFAULT_WEIGHTS[trait];
}

function traitCompatibility(trait: BigFiveTrait, a: number, b: number) {
  const left = clamp(a);
  const right = clamp(b);
  const gap = Math.abs(left - right);

  switch (trait) {
    case "neuroticism": {
      // Low-low is best. Average stress is the main penalty, with a smaller
      // mismatch penalty; consequently high-high is worse than high-low.
      const average = (left + right) / 2;
      return clamp(1 - 0.75 * average - 0.25 * gap);
    }
    case "agreeableness": {
      // Higher agreeableness is generally beneficial, while a large mismatch
      // can still create friction. This avoids an unsupported "midpoint is
      // always optimal" assumption.
      const average = (left + right) / 2;
      return clamp(0.6 * average + 0.4 * similarity(left, right));
    }
    default:
      return similarity(left, right);
  }
}

@Injectable()
export class PersonalityAlgorithm implements MatchingAlgorithm {
  readonly key = AlgorithmKey.PERSONALITY;
  readonly version = "2.0.0";

  score(
    a: MatchProfile,
    b: MatchProfile,
    settings: Record<string, unknown> = {},
  ): AlgorithmScore | null {
    const left = new Map(
      a.testAttempts[0]?.traitScores.map((x) => [x.trait, x.score]) ?? [],
    );
    const right = new Map(
      b.testAttempts[0]?.traitScores.map((x) => [x.trait, x.score]) ?? [],
    );
    const compared = TRAITS.flatMap((trait) => {
      const leftScore = left.get(trait);
      const rightScore = right.get(trait);
      const weight = configuredWeight(settings, trait);
      return leftScore === undefined || rightScore === undefined || weight === 0
        ? []
        : [
            {
              trait,
              score: traitCompatibility(trait, leftScore, rightScore),
              weight,
              model: MODELS[trait],
            },
          ];
    });

    if (!compared.length) return null;

    const totalWeight = compared.reduce((sum, trait) => sum + trait.weight, 0);
    const score =
      compared.reduce((sum, trait) => sum + trait.score * trait.weight, 0) /
      totalWeight;

    return {
      score,
      explanation: {
        sharedTraits: compared.length,
        byTrait: Object.fromEntries(
          compared.map(({ trait, score }) => [trait, score]),
        ),
        traitWeights: Object.fromEntries(
          compared.map(({ trait, weight }) => [trait, weight]),
        ),
        traitModels: Object.fromEntries(
          compared.map(({ trait, model }) => [trait, model]),
        ),
      },
    };
  }
}
