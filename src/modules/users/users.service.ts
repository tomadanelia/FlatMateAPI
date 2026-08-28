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
              preferredAreas: preferredAreas ?? [],
            },
            update: {
              city,
              countryCode: countryCode.toUpperCase(),
              minMonthlyBudget,
              maxMonthlyBudget,
              currency: currency.toUpperCase(),
              preferredAreas: preferredAreas ?? [],
              moveInDate: moveInDate ? new Date(moveInDate) : null,
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
  findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
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
  }
}
