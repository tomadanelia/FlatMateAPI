import { LifestyleAlgorithm } from './lifestyle.algorithm';
import { PersonalityAlgorithm } from './personality.algorithm';

const profile = (overrides: Record<string, unknown> = {}) => ({ testAttempts: [], tasteItems: [], lifestyleProfile: null, ...overrides } as never);
describe('matching algorithms', () => {
  it('scores identical personality traits as 1', () => {
    const p = profile({ testAttempts: [{ traitScores: [{ trait: 'openness', score: 0.8 }] }] });
    expect(new PersonalityAlgorithm().score(p, p)?.score).toBe(1);
  });
  it('makes a pet incompatibility a zero lifestyle score', () => {
    const base = { cleanliness: 3, socialLevel: 3, sleepSchedule: 3, noiseTolerance: 3, guestsFrequency: 3, smokingAllowed: false };
    const a = profile({ lifestyleProfile: { ...base, hasPets: true, petsAllowed: true } });
    const b = profile({ lifestyleProfile: { ...base, hasPets: false, petsAllowed: false } });
    expect(new LifestyleAlgorithm().score(a, b)?.score).toBe(0);
  });
});
