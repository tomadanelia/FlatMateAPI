import { Injectable } from '@nestjs/common';
import { AlgorithmKey } from '../../../generated/prisma/client';
import { AlgorithmScore, MatchingAlgorithm, MatchProfile, similarity } from './matching-algorithm';

@Injectable()
export class PersonalityAlgorithm implements MatchingAlgorithm {
  readonly key = AlgorithmKey.PERSONALITY;
  readonly version = '1.0.0';
  score(a: MatchProfile, b: MatchProfile): AlgorithmScore | null {
    const left = new Map(a.testAttempts[0]?.traitScores.map((x) => [x.trait, x.score]) ?? []);
    const right = new Map(b.testAttempts[0]?.traitScores.map((x) => [x.trait, x.score]) ?? []);
    const shared = [...left.keys()].filter((trait) => right.has(trait));
    if (!shared.length) return null;
    const byTrait = Object.fromEntries(shared.map((trait) => [trait, similarity(left.get(trait)!, right.get(trait)!)]));
    return { score: Object.values(byTrait).reduce((sum, value) => sum + value, 0) / shared.length, explanation: { sharedTraits: shared.length, byTrait } };
  }
}
