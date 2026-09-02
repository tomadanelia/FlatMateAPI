import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { permitsGender } from "../../common/looking-for.policy";
import { PrismaService } from "../../prisma/prisma.service";

const publicUserSelect = {
  id: true,
  displayName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateConversation(userId: string, recipientId: string) {
    if (userId === recipientId) {
      throw new BadRequestException("You cannot message yourself");
    }

    const participants = await this.prisma.user.findMany({
      where: { id: { in: [userId, recipientId] } },
      select: { id: true, gender: true, lookingFor: true },
    });
    const sender = participants.find(({ id }) => id === userId);
    const recipient = participants.find(({ id }) => id === recipientId);
    if (!recipient) throw new NotFoundException("Recipient not found");
    if (!sender) throw new NotFoundException("User not found");
    if (!permitsGender(recipient.lookingFor, sender.gender)) {
      throw new ForbiddenException(
        "Recipient does not accept messages from your gender",
      );
    }

    const [participantOneId, participantTwoId] = [userId, recipient.id].sort();
    return this.prisma.conversation.upsert({
      where: {
        participantOneId_participantTwoId: {
          participantOneId,
          participantTwoId,
        },
      },
      create: { participantOneId, participantTwoId },
      update: {},
      include: {
        participantOne: { select: publicUserSelect },
        participantTwo: { select: publicUserSelect },
      },
    });
  }

  listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        OR: [{ participantOneId: userId }, { participantTwoId: userId }],
      },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      include: {
        participantOne: { select: publicUserSelect },
        participantTwo: { select: publicUserSelect },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: {
          select: {
            messages: { where: { senderId: { not: userId }, readAt: null } },
          },
        },
      },
    });
  }

  async listMessages(
    userId: string,
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ) {
    await this.assertParticipant(userId, conversationId);
    if (cursor) {
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: cursor },
        select: { conversationId: true },
      });
      if (cursorMessage?.conversationId !== conversationId) {
        throw new BadRequestException("Invalid message cursor");
      }
    }

    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { sender: { select: publicUserSelect } },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id : null,
    };
  }

  async sendMessage(userId: string, conversationId: string, rawBody: string) {
    const conversation = await this.assertCanSend(userId, conversationId);
    const body = rawBody.trim();
    if (!body) throw new BadRequestException("Message cannot be empty");

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId, senderId: userId, body },
        include: { sender: { select: publicUserSelect } },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.createdAt },
      });
      return { message, participantIds: this.participantIds(conversation) };
    });
  }

  private async assertCanSend(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        participantOneId: true,
        participantTwoId: true,
        participantOne: { select: { gender: true, lookingFor: true } },
        participantTwo: { select: { gender: true, lookingFor: true } },
      },
    });
    const participantConversation = this.assertIsParticipant(
      conversation,
      userId,
    );

    const sender =
      participantConversation.participantOneId === userId
        ? participantConversation.participantOne
        : participantConversation.participantTwo;
    const recipient =
      participantConversation.participantOneId === userId
        ? participantConversation.participantTwo
        : participantConversation.participantOne;
    if (!permitsGender(recipient.lookingFor, sender.gender)) {
      throw new ForbiddenException(
        "Recipient does not accept messages from your gender",
      );
    }
    return participantConversation;
  }

  async markRead(userId: string, conversationId: string) {
    const conversation = await this.assertParticipant(userId, conversationId);
    const readAt = new Date();
    const result = await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt },
    });
    return {
      conversationId,
      userId,
      readAt,
      updated: result.count,
      participantIds: this.participantIds(conversation),
    };
  }

  private async assertParticipant(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, participantOneId: true, participantTwoId: true },
    });
    return this.assertIsParticipant(conversation, userId);
  }

  private assertIsParticipant<
    T extends {
      participantOneId: string;
      participantTwoId: string;
    },
  >(conversation: T | null, userId: string): T {
    if (!conversation) throw new NotFoundException("Conversation not found");
    if (
      conversation.participantOneId !== userId &&
      conversation.participantTwoId !== userId
    ) {
      throw new ForbiddenException("You are not part of this conversation");
    }
    return conversation;
  }

  private participantIds(conversation: {
    participantOneId: string;
    participantTwoId: string;
  }) {
    return [conversation.participantOneId, conversation.participantTwoId];
  }
}
