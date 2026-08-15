import { Injectable, NotFoundException } from '@nestjs/common';
import { AlgorithmKey, MatchRunStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlgorithmRegistry } from './algorithm.registry';
import { matchProfileInclude } from './algorithms/matching-algorithm';
import { FindMatchesDto } from './dto/find-matches.dto';

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService, private readonly registry: AlgorithmRegistry) {}
  async find(dto: FindMatchesDto) {
    const subject = await this.prisma.user.findUnique({ where: { id: dto.userId }, include: matchProfileInclude });
    if (!subject?.housingPreference) throw new NotFoundException('User or housing preference not found');
    const hp = subject.housingPreference;
    const candidates = await this.prisma.user.findMany({ where: { id: { not: subject.id }, isDiscoverable: true, onboardingComplete: true, housingPreference: { city: { equals: hp.city, mode: 'insensitive' }, currency: hp.currency, minMonthlyBudget: { lte: hp.maxMonthlyBudget }, maxMonthlyBudget: { gte: hp.minMonthlyBudget } } }, include: matchProfileInclude });
    const configs = await this.prisma.algorithmConfig.findMany({ where: { enabled: true, ...(dto.algorithms?.length ? { key: { in: dto.algorithms } } : {}) } });
    const run = await this.prisma.matchRun.create({ data: { subjectId: subject.id, context: { requestedAlgorithms: dto.algorithms ?? 'enabled' } } });
    try {
      const ranked = candidates.map((candidate) => {
        const scores = configs.flatMap((config) => {
          const algorithm = this.registry.get(config.key); const result = algorithm?.score(subject, candidate, config.settings as Record<string, unknown>);
          return algorithm && result ? [{ key: config.key, score: result.score, weight: config.weight, version: config.version || algorithm.version, explanation: result.explanation }] : [];
        });
        const weight = scores.reduce((sum, x) => sum + x.weight, 0);
        return { candidate, scores, totalScore: weight ? scores.reduce((sum, x) => sum + x.score * x.weight, 0) / weight : 0 };
      }).filter((x) => x.scores.length).sort((a, b) => b.totalScore - a.totalScore).slice(0, dto.limit);
      await this.prisma.$transaction(async (tx) => {
        for (const [index, item] of ranked.entries()) await tx.matchResult.create({ data: { matchRunId: run.id, subjectId: subject.id, candidateId: item.candidate.id, totalScore: item.totalScore, rank: index + 1, explanation: { algorithmsUsed: item.scores.length }, scores: { create: item.scores.map((x) => ({ algorithmKey: x.key, score: x.score, weight: x.weight, version: x.version, explanation: x.explanation as Prisma.InputJsonValue })) } } });
        await tx.matchRun.update({ where: { id: run.id }, data: { status: MatchRunStatus.COMPLETED } });
      });
      return { runId: run.id, matches: ranked.map((x, index) => ({ rank: index + 1, score: x.totalScore, user: { id: x.candidate.id, displayName: x.candidate.displayName, avatarUrl: x.candidate.avatarUrl, bio: x.candidate.bio }, breakdown: x.scores })) };
    } catch (error) {
      await this.prisma.matchRun.update({ where: { id: run.id }, data: { status: MatchRunStatus.FAILED, error: error instanceof Error ? error.message : 'Unknown error' } });
      throw error;
    }
  }
}
