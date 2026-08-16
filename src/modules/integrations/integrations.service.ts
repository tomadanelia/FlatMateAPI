import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ConnectIntegrationDto,
  ConnectLetterboxdDto,
  SyncTasteDto,
} from "./dto/integration.dto";
import {
  isLetterboxdProfilePage,
  LetterboxdFavorite,
  scrapeLetterboxdFavorites,
} from "./letterboxd.scraper";

const LETTERBOXD_ORIGIN = "https://letterboxd.com";

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}
  connect(dto: ConnectIntegrationDto) {
    return this.prisma.externalIntegration.upsert({
      where: {
        userId_provider: { userId: dto.userId, provider: dto.provider },
      },
      create: { ...dto, status: "CONNECTED" },
      update: { username: dto.username, status: "CONNECTED" },
    });
  }
  async sync(dto: SyncTasteDto) {
    await this.prisma.$transaction([
      this.prisma.tasteItem.deleteMany({
        where: { userId: dto.userId, provider: dto.provider },
      }),
      this.prisma.tasteItem.createMany({
        data: dto.items.map((item) => ({
          ...item,
          userId: dto.userId,
          provider: dto.provider,
          artists: item.artists ?? [],
          genres: item.genres ?? [],
          score: item.score ?? 1,
        })),
      }),
      this.prisma.externalIntegration.update({
        where: {
          userId_provider: { userId: dto.userId, provider: dto.provider },
        },
        data: { status: "CONNECTED", lastSyncedAt: new Date() },
      }),
    ]);
    return { synced: dto.items.length };
  }

  async connectLetterboxd(dto: ConnectLetterboxdDto) {
    const username = dto.username.trim();
    const profileUrl = `${LETTERBOXD_ORIGIN}/${encodeURIComponent(username)}/`;
    let response: Response;

    try {
      response = await fetch(profileUrl, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Flatmate/1.0 Letterboxd profile integration",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new BadGatewayException("Could not reach Letterboxd");
    }

    if (response.status === 404) {
      throw new NotFoundException("Public Letterboxd profile not found");
    }
    if (!response.ok) {
      throw new BadGatewayException(
        `Letterboxd returned HTTP ${response.status}`,
      );
    }

    const html = await response.text();
    if (!isLetterboxdProfilePage(html)) {
      throw new NotFoundException("Public Letterboxd profile not found");
    }

    const favorites = scrapeLetterboxdFavorites(html);
    const syncedAt = new Date();
    const [integration] = await this.prisma.$transaction([
      this.prisma.externalIntegration.upsert({
        where: {
          userId_provider: { userId: dto.userId, provider: "LETTERBOXD" },
        },
        create: {
          userId: dto.userId,
          provider: "LETTERBOXD",
          username,
          status: "CONNECTED",
          lastSyncedAt: syncedAt,
          metadata: { profileUrl },
        },
        update: {
          username,
          status: "CONNECTED",
          lastSyncedAt: syncedAt,
          metadata: { profileUrl },
        },
      }),
      this.prisma.tasteItem.deleteMany({
        where: { userId: dto.userId, provider: "LETTERBOXD" },
      }),
      this.prisma.tasteItem.createMany({
        data: favorites.map((favorite, position) => ({
          userId: dto.userId,
          provider: "LETTERBOXD" as const,
          externalId: favorite.externalId,
          kind: "film",
          name: favorite.title,
          metadata: {
            year: favorite.year,
            posterUrl: favorite.posterUrl,
            filmUrl: favorite.filmUrl,
            position,
          },
        })),
      }),
    ]);

    return {
      provider: "LETTERBOXD" as const,
      username: integration.username,
      profileUrl,
      lastSyncedAt: integration.lastSyncedAt,
      favorites,
    };
  }

  async getLetterboxdFavorites(userId: string) {
    const integration = await this.prisma.externalIntegration.findUnique({
      where: { userId_provider: { userId, provider: "LETTERBOXD" } },
      select: {
        username: true,
        status: true,
        lastSyncedAt: true,
        metadata: true,
      },
    });
    if (!integration || integration.status !== "CONNECTED") {
      throw new NotFoundException("Letterboxd integration not found");
    }

    const items = await this.prisma.tasteItem.findMany({
      where: { userId, provider: "LETTERBOXD", kind: "film" },
      select: { externalId: true, name: true, metadata: true },
    });

    const favorites: LetterboxdFavorite[] = items
      .map((item) => {
        const metadata = this.asMetadata(item.metadata);
        return {
          favorite: {
            externalId: item.externalId,
            title: item.name,
            year: typeof metadata.year === "number" ? metadata.year : null,
            posterUrl:
              typeof metadata.posterUrl === "string"
                ? metadata.posterUrl
                : null,
            filmUrl:
              typeof metadata.filmUrl === "string"
                ? metadata.filmUrl
                : `${LETTERBOXD_ORIGIN}/film/${encodeURIComponent(item.externalId)}/`,
          },
          position:
            typeof metadata.position === "number"
              ? metadata.position
              : Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((left, right) => left.position - right.position)
      .map(({ favorite }) => favorite);
    const integrationMetadata = this.asMetadata(integration.metadata);

    return {
      provider: "LETTERBOXD" as const,
      username: integration.username,
      profileUrl:
        typeof integrationMetadata.profileUrl === "string"
          ? integrationMetadata.profileUrl
          : `${LETTERBOXD_ORIGIN}/${encodeURIComponent(integration.username ?? "")}/`,
      lastSyncedAt: integration.lastSyncedAt,
      favorites,
    };
  }

  private asMetadata(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
