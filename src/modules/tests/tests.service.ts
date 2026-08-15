import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmitTestDto } from './dto/submit-test.dto';

@Injectable()
export class TestsService {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.testDefinition.findMany({ where: { isActive: true }, select: { id: true, slug: true, name: true, type: true, version: true, description: true } }); }
  questions(slug: string) { return this.prisma.testDefinition.findUnique({ where: { slug }, include: { questions: { orderBy: { position: 'asc' }, select: { id: true, code: true, prompt: true, kind: true, position: true, options: true, minValue: true, maxValue: true } } } }); }
  async submit(dto: SubmitTestDto) {
    const definition = await this.prisma.testDefinition.findUnique({ where: { id: dto.testDefinitionId }, include: { questions: true } });
    if (!definition) throw new NotFoundException('Test not found');
    if (new Set(dto.answers.map((a) => a.questionId)).size !== definition.questions.length) throw new BadRequestException('Every question must be answered exactly once');
    const answers = new Map(dto.answers.map((a) => [a.questionId, a.value]));
    const sums = new Map<string, { total: number; weight: number }>();
    for (const q of definition.questions) {
      const raw = answers.get(q.id);
      if (raw === undefined || raw < (q.minValue ?? 1) || raw > (q.maxValue ?? 5)) throw new BadRequestException(`Invalid answer for ${q.code}`);
      const value = q.reverseScored ? (q.maxValue ?? 5) + (q.minValue ?? 1) - raw : raw;
      const entry = sums.get(q.trait) ?? { total: 0, weight: 0 };
      entry.total += value * q.weight; entry.weight += q.weight; sums.set(q.trait, entry);
    }
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.testAttempt.create({ data: { userId: dto.userId, testDefinitionId: dto.testDefinitionId, completedAt: new Date(), responses: { create: dto.answers.map((a) => ({ questionId: a.questionId, value: a.value as unknown as Prisma.InputJsonValue })) }, traitScores: { create: [...sums.entries()].map(([trait, value]) => ({ trait, score: ((value.total / value.weight) - 1) / 4 })) } }, include: { traitScores: true } });
      return attempt;
    });
  }
}
