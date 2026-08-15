import { Injectable } from '@nestjs/common';
import { AlgorithmKey } from '@prisma/client';
import { AlgorithmScore, MatchingAlgorithm, MatchProfile, similarity } from './matching-algorithm';

@Injectable()
export class LifestyleAlgorithm implements MatchingAlgorithm {
  readonly key = AlgorithmKey.LIFESTYLE;
  readonly version = '1.0.0';
  score(a: MatchProfile, b: MatchProfile): AlgorithmScore | null {
    const x = a.lifestyleProfile; const y = b.lifestyleProfile;
    if (!x || !y) return null;
    if ((x.hasPets && !y.petsAllowed) || (y.hasPets && !x.petsAllowed)) return { score: 0, explanation: { conflict: 'pets' } };
    if (x.smokingAllowed !== y.smokingAllowed) return { score: 0.2, explanation: { conflict: 'smoking' } };
    const dimensions = ['cleanliness', 'socialLevel', 'sleepSchedule', 'noiseTolerance', 'guestsFrequency'] as const;
    const byDimension = Object.fromEntries(dimensions.map((key) => [key, similarity(x[key], y[key], 4)]));
    return { score: Object.values(byDimension).reduce((sum, value) => sum + value, 0) / dimensions.length, explanation: { byDimension } };
  }
}
