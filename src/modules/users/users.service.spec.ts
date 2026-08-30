import { NotFoundException } from "@nestjs/common";
import { Gender } from "../../generated/prisma/client";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    userBlock: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
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

  it("loads only a visible profile when neither user has blocked the other", async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: "profile-id",
      displayName: "Taylor",
      birthDate: null,
      gender: Gender.NON_BINARY,
      bio: "Hello",
      avatarUrl: null,
      housingPreference: null,
      lifestyleProfile: null,
      testAttempts: [],
      musicGenres: [{ musicGenre: { id: "genre-id", name: "Jazz" } }],
      favoriteArtists: [],
      movieGenres: [],
      favoriteMovies: [],
      tasteItems: [],
    });

    const result = await service.findPublicProfile("viewer-id", "profile-id");

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "profile-id",
          isDiscoverable: true,
          onboardingComplete: true,
          blocksInitiated: { none: { blockedId: "viewer-id" } },
          blocksReceived: { none: { blockerId: "viewer-id" } },
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "profile-id",
        age: null,
        personality: null,
        tastes: expect.objectContaining({
          musicGenres: [{ id: "genre-id", name: "Jazz" }],
        }),
      }),
    );
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("birthDate");
  });

  it("hides missing, private, and blocked profiles behind the same error", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.findPublicProfile("viewer-id", "profile-id"),
    ).rejects.toThrow("Profile not found");
  });

  it("creates a block idempotently", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "blocked-id" });
    prisma.userBlock.upsert.mockResolvedValue({
      blockedId: "blocked-id",
      createdAt: new Date("2026-08-30T00:00:00Z"),
    });

    await service.block("blocker-id", "blocked-id");

    expect(prisma.userBlock.upsert).toHaveBeenCalledWith({
      where: {
        blockerId_blockedId: {
          blockerId: "blocker-id",
          blockedId: "blocked-id",
        },
      },
      create: { blockerId: "blocker-id", blockedId: "blocked-id" },
      update: {},
      select: { blockedId: true, createdAt: true },
    });
  });

  it("rejects blocking yourself", async () => {
    await expect(service.block("same-id", "same-id")).rejects.toThrow(
      "You cannot block yourself",
    );
    expect(prisma.userBlock.upsert).not.toHaveBeenCalled();
  });

  it("unblocks idempotently", async () => {
    prisma.userBlock.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.unblock("blocker-id", "blocked-id")).resolves.toEqual({
      blockedId: "blocked-id",
      unblocked: false,
    });
  });
});
