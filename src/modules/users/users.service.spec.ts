import { NotFoundException } from "@nestjs/common";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
});
