import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Gender, LookingFor } from "../../generated/prisma/client";
import { MessagingService } from "./messaging.service";

describe("MessagingService", () => {
  const prisma = {
    user: { findMany: jest.fn() },
    conversation: { findUnique: jest.fn(), upsert: jest.fn() },
    message: { findMany: jest.fn() },
  };
  const service = new MessagingService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("rejects conversations with yourself", async () => {
    await expect(
      service.getOrCreateConversation("user-a", "user-a"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it("rejects a missing recipient", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await expect(
      service.getOrCreateConversation("user-a", "user-b"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("uses a canonical participant order for unique direct conversations", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: "user-z", gender: Gender.MAN, lookingFor: LookingFor.all },
      { id: "user-a", gender: Gender.WOMAN, lookingFor: LookingFor.all },
    ]);
    prisma.conversation.upsert.mockResolvedValue({ id: "conversation" });

    await service.getOrCreateConversation("user-z", "user-a");

    expect(prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          participantOneId_participantTwoId: {
            participantOneId: "user-a",
            participantTwoId: "user-z",
          },
        },
      }),
    );
  });

  it("rejects a conversation when the recipient excludes the sender gender", async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: "user-a", gender: Gender.MAN, lookingFor: LookingFor.all },
      {
        id: "user-b",
        gender: Gender.WOMAN,
        lookingFor: LookingFor.female,
      },
    ]);

    await expect(
      service.getOrCreateConversation("user-a", "user-b"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("rechecks lookingFor before sending in an existing conversation", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "conversation",
      participantOneId: "user-a",
      participantTwoId: "user-b",
      participantOne: { gender: Gender.MAN, lookingFor: LookingFor.all },
      participantTwo: {
        gender: Gender.WOMAN,
        lookingFor: LookingFor.female,
      },
    });

    await expect(
      service.sendMessage("user-a", "conversation", "Hello"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("does not expose message history to a non-participant", async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: "conversation",
      participantOneId: "user-a",
      participantTwoId: "user-b",
    });

    await expect(
      service.listMessages("user-c", "conversation", undefined, 50),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
