import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { AlgorithmKey, PrismaClient, TestType } from '../src/generated/prisma/client';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const questions = [
  ['O1', 'I enjoy exploring new ideas.', 'openness', false], ['O2', 'I prefer familiar routines.', 'openness', true],
  ['C1', 'I keep my space organized.', 'conscientiousness', false], ['C2', 'I often leave tasks unfinished.', 'conscientiousness', true],
  ['E1', 'I feel energized around people.', 'extraversion', false], ['E2', 'I avoid social gatherings.', 'extraversion', true],
  ['A1', 'I try to understand other viewpoints.', 'agreeableness', false], ['A2', 'I start arguments easily.', 'agreeableness', true],
  ['N1', 'I often feel stressed.', 'neuroticism', false], ['N2', 'I remain calm under pressure.', 'neuroticism', true],
] as const;
async function main() {
  for (const key of Object.values(AlgorithmKey)) await prisma.algorithmConfig.upsert({ where: { key }, update: {}, create: { key, enabled: true, weight: key === AlgorithmKey.LIFESTYLE ? 1.25 : 1 } });
  await prisma.testDefinition.upsert({ where: { slug: 'big-five-v1' }, update: {}, create: { slug: 'big-five-v1', name: 'Big Five', type: TestType.BIG_FIVE, version: 1, description: 'Short starter Big Five inventory; replace with a validated/licensed questionnaire before production.', questions: { create: questions.map(([code, prompt, trait, reverseScored], position) => ({ code, prompt, trait, reverseScored, position: position + 1, minValue: 1, maxValue: 5, options: [{ value: 1, label: 'Strongly disagree' }, { value: 2, label: 'Disagree' }, { value: 3, label: 'Neutral' }, { value: 4, label: 'Agree' }, { value: 5, label: 'Strongly agree' }] })) } } });
}
main().finally(() => prisma.$disconnect());
