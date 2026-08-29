import { NotFoundException } from "@nestjs/common";
import { Gender } from "../../generated/prisma/client";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const service = new UsersService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("stores a profile image URL", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-id" });
    prisma.user.update.mockResolvedValue({
      id: "user-id",
      avatarUrl: "https://images.example/avatar.jpg",
    });

    await expect(
      service.updateAvatar("user-id", "https://images.example/avatar.jpg"),
    ).resolves.toEqual({
      id: "user-id",
      avatarUrl: "https://images.example/avatar.jpg",
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-id" },
      data: { avatarUrl: "https://images.example/avatar.jpg" },
      select: { id: true, avatarUrl: true },
    });
  });

  it("clears a profile image with null", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-id" });
    prisma.user.update.mockResolvedValue({ id: "user-id", avatarUrl: null });

    await service.updateAvatar("user-id", null);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avatarUrl: null } }),
    );
  });

  it("rejects an unknown user", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.updateAvatar("missing-user", "https://images.example/avatar.jpg"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("stores roommate gender preferences with the housing profile", () => {
    prisma.user.upsert.mockResolvedValue({});

    service.upsert({
      id: "00000000-0000-4000-8000-000000000001",
      email: "user@example.test",
      displayName: "User",
      gender: Gender.WOMAN,
      city: "Berlin",
      countryCode: "de",
      minMonthlyBudget: 800,
      maxMonthlyBudget: 1200,
      currency: "eur",
      preferredRoommateGenders: [Gender.MAN, Gender.NON_BINARY],
      cleanliness: 3,
      socialLevel: 3,
      sleepSchedule: 3,
      noiseTolerance: 3,
      guestsFrequency: 3,
      smokingAllowed: false,
      petsAllowed: true,
      hasPets: false,
    });

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          housingPreference: {
            create: expect.objectContaining({
              preferredRoommateGenders: [Gender.MAN, Gender.NON_BINARY],
            }),
          },
        }),
        update: expect.objectContaining({
          housingPreference: {
            upsert: expect.objectContaining({
              update: expect.objectContaining({
                preferredRoommateGenders: [Gender.MAN, Gender.NON_BINARY],
              }),
            }),
          },
        }),
      }),
    );
  });
});
