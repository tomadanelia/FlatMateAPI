import { Injectable } from '@nestjs/common';
import { AlgorithmKey } from '../../generated/prisma/client';
import { LifestyleAlgorithm } from './algorithms/lifestyle.algorithm';
import { MatchingAlgorithm } from './algorithms/matching-algorithm';
import { PersonalityAlgorithm } from './algorithms/personality.algorithm';
import { TasteAlgorithm } from './algorithms/taste.algorithm';

@Injectable()
export class AlgorithmRegistry {
  private readonly algorithms: Map<AlgorithmKey, MatchingAlgorithm>;
  constructor(personality: PersonalityAlgorithm, taste: TasteAlgorithm, lifestyle: LifestyleAlgorithm) {
    this.algorithms = new Map([personality, taste, lifestyle].map((algorithm) => [algorithm.key, algorithm]));
  }
  get(key: AlgorithmKey) { return this.algorithms.get(key); }
  keys() { return [...this.algorithms.keys()]; }
}
