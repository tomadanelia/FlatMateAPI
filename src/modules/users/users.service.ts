import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpsertProfileDto } from "./dto/upsert-profile.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateAvatar(id: string, avatarUrl: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });
  }

  upsert(dto: UpsertProfileDto) {
    if (dto.minMonthlyBudget > dto.maxMonthlyBudget)
      throw new BadRequestException(
        "Minimum budget cannot exceed maximum budget",
      );
    const {
      city,
      countryCode,
      minMonthlyBudget,
      maxMonthlyBudget,
      currency,
      moveInDate,
      preferredAreas,
      preferredRoommateGenders,
      cleanliness,
      socialLevel,
      sleepSchedule,
      noiseTolerance,
      guestsFrequency,
      smokingAllowed,
      petsAllowed,
      hasPets,
      ...user
    } = dto;
    return this.prisma.user.upsert({
      where: { id: dto.id },
      create: {
        ...user,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        onboardingComplete: true,
        housingPreference: {
          create: {
            city,
            countryCode: countryCode.toUpperCase(),
            minMonthlyBudget,
            maxMonthlyBudget,
            currency: currency.toUpperCase(),
            moveInDate: moveInDate ? new Date(moveInDate) : undefined,
            preferredAreas: preferredAreas ?? [],
            ...(preferredRoommateGenders ? { preferredRoommateGenders } : {}),
          },
        },
        lifestyleProfile: {
          create: {
            cleanliness,
            socialLevel,
            sleepSchedule,
            noiseTolerance,
            guestsFrequency,
            smokingAllowed,
            petsAllowed,
            hasPets,
          },
        },
      },
      update: {
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        gender: user.gender,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        onboardingComplete: true,
        housingPreference: {
          upsert: {
            create: {
              city,
              countryCode: countryCode.toUpperCase(),
              minMonthlyBudget,
              maxMonthlyBudget,
              currency: currency.toUpperCase(),
              moveInDate: moveInDate ? new Date(moveInDate) : undefined,
              preferredAreas: preferredAreas ?? [],
              ...(preferredRoommateGenders ? { preferredRoommateGenders } : {}),
            },
            update: {
              city,
              countryCode: countryCode.toUpperCase(),
              minMonthlyBudget,
              maxMonthlyBudget,
              currency: currency.toUpperCase(),
              preferredAreas: preferredAreas ?? [],
              ...(preferredRoommateGenders ? { preferredRoommateGenders } : {}),
              ...(moveInDate ? { moveInDate: new Date(moveInDate) } : {}),
            },
          },
        },
        lifestyleProfile: {
          upsert: {
            create: {
              cleanliness,
              socialLevel,
              sleepSchedule,
              noiseTolerance,
              guestsFrequency,
              smokingAllowed,
              petsAllowed,
              hasPets,
            },
            update: {
              cleanliness,
              socialLevel,
              sleepSchedule,
              noiseTolerance,
              guestsFrequency,
              smokingAllowed,
              petsAllowed,
              hasPets,
            },
          },
        },
      },
      include: { housingPreference: true, lifestyleProfile: true },
    });
  }

  async findPrivateProfile(id: string) {
    const profile = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        displayName: true,
        birthDate: true,
        gender: true,
        bio: true,
        avatarUrl: true,
        isDiscoverable: true,
        onboardingComplete: true,
        createdAt: true,
        updatedAt: true,
        housingPreference: true,
        lifestyleProfile: true,
        integrations: {
          select: {
            provider: true,
            username: true,
            status: true,
            lastSyncedAt: true,
          },
        },
      },
    });
    if (!profile) throw new NotFoundException("User not found");
    return profile;
  }

  async findPublicProfile(viewerId: string, profileId: string) {
    const profile = await this.prisma.user.findFirst({
      where: {
        id: profileId,
        ...(viewerId === profileId
          ? {}
          : { isDiscoverable: true, onboardingComplete: true }),
        blocksInitiated: { none: { blockedId: viewerId } },
        blocksReceived: { none: { blockerId: viewerId } },
      },
      select: {
        id: true,
        displayName: true,
        birthDate: true,
        gender: true,
        bio: true,
        avatarUrl: true,
        housingPreference: {
          select: {
            city: true,
            countryCode: true,
            minMonthlyBudget: true,
            maxMonthlyBudget: true,
            currency: true,
            moveInDate: true,
            preferredAreas: true,
            preferredRoommateGenders: true,
          },
        },
        lifestyleProfile: {
          select: {
            cleanliness: true,
            socialLevel: true,
            sleepSchedule: true,
            noiseTolerance: true,
            guestsFrequency: true,
            smokingAllowed: true,
            petsAllowed: true,
            hasPets: true,
          },
        },
        testAttempts: {
          where: { completedAt: { not: null } },
          orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            completedAt: true,
            testDefinition: {
              select: { slug: true, name: true, type: true, version: true },
            },
            traitScores: {
              orderBy: { trait: "asc" },
              select: { trait: true, score: true },
            },
          },
        },
        musicGenres: {
          select: { musicGenre: { select: { id: true, name: true } } },
        },
        favoriteArtists: {
          select: { artist: { select: { id: true, name: true } } },
        },
        movieGenres: {
          select: { movieGenre: { select: { id: true, name: true } } },
        },
        favoriteMovies: {
          select: { movie: { select: { id: true, title: true } } },
        },
        tasteItems: {
          orderBy: [{ score: "desc" }, { name: "asc" }],
          select: {
            provider: true,
            kind: true,
            name: true,
            artists: true,
            genres: true,
            score: true,
          },
        },
      },
    });
    if (!profile) throw new NotFoundException("Profile not found");

    const {
      birthDate,
      testAttempts,
      musicGenres,
      favoriteArtists,
      movieGenres,
      favoriteMovies,
      tasteItems,
      ...publicProfile
    } = profile;
    const latestAttempt = testAttempts[0];
    return {
      ...publicProfile,
      age: birthDate ? this.ageFromBirthDate(birthDate) : null,
      personality: latestAttempt
        ? {
            test: latestAttempt.testDefinition,
            completedAt: latestAttempt.completedAt,
            traits: latestAttempt.traitScores,
          }
        : null,
      tastes: {
        musicGenres: musicGenres.map(({ musicGenre }) => musicGenre),
        favoriteArtists: favoriteArtists.map(({ artist }) => artist),
        movieGenres: movieGenres.map(({ movieGenre }) => movieGenre),
        favoriteMovies: favoriteMovies.map(({ movie }) => movie),
        importedItems: tasteItems,
      },
    };
  }

  async block(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException("You cannot block yourself");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("User not found");

    return this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
      select: { blockedId: true, createdAt: true },
    });
  }

  async unblock(blockerId: string, blockedId: string) {
    const result = await this.prisma.userBlock.deleteMany({
      where: { blockerId, blockedId },
    });
    return { blockedId, unblocked: result.count > 0 };
  }

  listBlocks(blockerId: string) {
    return this.prisma.userBlock.findMany({
      where: { blockerId },
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        blocked: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });
  }

  private ageFromBirthDate(birthDate: Date) {
    const today = new Date();
    let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
    const beforeBirthday =
      today.getUTCMonth() < birthDate.getUTCMonth() ||
      (today.getUTCMonth() === birthDate.getUTCMonth() &&
        today.getUTCDate() < birthDate.getUTCDate());
    if (beforeBirthday) age--;
    return age;
  }
}
