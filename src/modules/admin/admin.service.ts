import { Injectable } from '@nestjs/common';
import { AlgorithmKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAlgorithmDto } from './dto/update-algorithm.dto';
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}
  list() { return this.prisma.algorithmConfig.findMany({ orderBy: { key: 'asc' } }); }
  update(key: AlgorithmKey, dto: UpdateAlgorithmDto) { return this.prisma.algorithmConfig.upsert({ where: { key }, create: { key, enabled: dto.enabled ?? true, weight: dto.weight ?? 1, version: dto.version ?? '1.0.0', settings: (dto.settings ?? {}) as Prisma.InputJsonValue }, update: { ...dto, settings: dto.settings as Prisma.InputJsonValue | undefined } }); }
}
