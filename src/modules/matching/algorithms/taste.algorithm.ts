import { Injectable } from '@nestjs/common';
import { AlgorithmKey } from '@prisma/client';
import { AlgorithmScore, MatchingAlgorithm, MatchProfile } from './matching-algorithm';

@Injectable()
export class TasteAlgorithm implements MatchingAlgorithm {
  readonly key = AlgorithmKey.TASTE;
  readonly version = '1.0.0';
  score(a: MatchProfile, b: MatchProfile): AlgorithmScore | null {
    const tokens = (p: MatchProfile) => new Set(p.tasteItems.flatMap((i) => [i.name, ...i.artists, ...i.genres]).map((x) => x.trim().toLowerCase()).filter(Boolean));
    const left = tokens(a); const right = tokens(b);
    if (!left.size || !right.size) return null;
    const shared = [...left].filter((x) => right.has(x));
    const union = new Set([...left, ...right]);
    return { score: shared.length / union.size, explanation: { sharedCount: shared.length, shared: shared.slice(0, 12) } };
  }
}
