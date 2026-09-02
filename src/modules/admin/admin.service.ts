import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlgorithmKey, Prisma, UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAlgorithmDto } from './dto/update-algorithm.dto';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
  UploadQuestionsDto,
} from './dto/question.dto';
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.algorithmConfig.findMany({ orderBy: { key: 'asc' } });
  }
  update(key: AlgorithmKey, dto: UpdateAlgorithmDto) {
    return this.prisma.algorithmConfig.upsert({
      where: { key },
      create: {
        key,
        enabled: dto.enabled ?? true,
        weight: dto.weight ?? 1,
        version: dto.version ?? '1.0.0',
        settings: (dto.settings ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        ...dto,
        settings: dto.settings as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async updateUserRole(id: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, displayName: true, role: true },
    });
  }

  listUsers() {
    return this.prisma.user.findMany({
      select: { id: true, displayName: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
  }

  async getUserCompletionStatus(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        testAttempts: {
          where: {
            completedAt: { not: null },
            testDefinition: {
              slug: { in: ['big-five-v1', 'big-five-v2'] },
            },
          },
          select: { testDefinition: { select: { slug: true } } },
        },
        _count: {
          select: {
            musicGenres: true,
            favoriteArtists: true,
            movieGenres: true,
            favoriteMovies: true,
            tasteItems: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const completedSlugs = new Set(
      user.testAttempts.map(({ testDefinition }) => testDefinition.slug),
    );
    const completedShort = completedSlugs.has('big-five-v1');
    const completedLong = completedSlugs.has('big-five-v2');
    const testStatus = completedShort
      ? completedLong
        ? 'BOTH'
        : 'SHORT_ONLY'
      : completedLong
        ? 'LONG_ONLY'
        : 'NONE';
    const tasteCount = Object.values(user._count).reduce(
      (total, count) => total + count,
      0,
    );

    return {
      userId: user.id,
      personalityTests: {
        status: testStatus,
        completedShort,
        completedLong,
      },
      tastes: {
        selected: tasteCount > 0,
        counts: {
          musicGenres: user._count.musicGenres,
          favoriteArtists: user._count.favoriteArtists,
          movieGenres: user._count.movieGenres,
          favoriteMovies: user._count.favoriteMovies,
          importedItems: user._count.tasteItems,
        },
      },
    };
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const deleted = await this.prisma.user.deleteMany({ where: { id } });
    if (deleted.count === 0) throw new NotFoundException('User not found');

    return { ...user, deleted: true };
  }

  async clearMessages() {
    return this.prisma.$transaction(async (tx) => {
      // Lock/reset conversations first so a concurrent sender either finishes
      // before the delete or updates lastMessageAt after this transaction.
      await tx.conversation.updateMany({ data: { lastMessageAt: null } });
      const deleted = await tx.message.deleteMany();
      return { deletedMessages: deleted.count };
    });
  }

  async uploadQuestions(testDefinitionId: string, dto: UploadQuestionsDto) {
    const definition = await this.prisma.testDefinition.findUnique({
      where: { id: testDefinitionId },
      select: { id: true },
    });
    if (!definition) throw new NotFoundException('Test definition not found');
    dto.questions.forEach((question) => this.validateRange(question));

    try {
      return await this.prisma.$transaction(
        dto.questions.map((question) =>
          this.prisma.question.create({
            data: {
              ...question,
              testDefinitionId,
              options: question.options as Prisma.InputJsonValue | undefined,
            },
          }),
        ),
      );
    } catch (error) {
      this.rethrowQuestionConflict(error);
      throw error;
    }
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto) {
    this.validateRange(dto);
    const existing = await this.prisma.question.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Question not found');
    if (dto.minValue !== undefined || dto.maxValue !== undefined) {
      this.validateRange({
        minValue: dto.minValue ?? existing.minValue ?? undefined,
        maxValue: dto.maxValue ?? existing.maxValue ?? undefined,
      });
    }

    try {
      return await this.prisma.question.update({
        where: { id },
        data: {
          ...dto,
          options: dto.options as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error) {
      this.rethrowQuestionConflict(error);
      throw error;
    }
  }

  private validateRange(
    question: Pick<CreateQuestionDto, 'minValue' | 'maxValue'>,
  ) {
    if (
      question.minValue !== undefined &&
      question.maxValue !== undefined &&
      question.minValue > question.maxValue
    ) {
      throw new BadRequestException('minValue cannot exceed maxValue');
    }
  }

  private rethrowQuestionConflict(error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Question code and position must be unique within a test',
      );
    }
  }
}
