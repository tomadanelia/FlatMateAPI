import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectIntegrationDto, SyncTasteDto } from './dto/integration.dto';

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}
  connect(dto: ConnectIntegrationDto) {
    return this.prisma.externalIntegration.upsert({ where: { userId_provider: { userId: dto.userId, provider: dto.provider } }, create: { ...dto, status: 'CONNECTED' }, update: { username: dto.username, status: 'CONNECTED' } });
  }
  async sync(dto: SyncTasteDto) {
    await this.prisma.$transaction([
      this.prisma.tasteItem.deleteMany({ where: { userId: dto.userId, provider: dto.provider } }),
      this.prisma.tasteItem.createMany({ data: dto.items.map((item) => ({ ...item, userId: dto.userId, provider: dto.provider, artists: item.artists ?? [], genres: item.genres ?? [], score: item.score ?? 1 })) }),
      this.prisma.externalIntegration.update({ where: { userId_provider: { userId: dto.userId, provider: dto.provider } }, data: { status: 'CONNECTED', lastSyncedAt: new Date() } }),
    ]);
    return { synced: dto.items.length };
  }
}
