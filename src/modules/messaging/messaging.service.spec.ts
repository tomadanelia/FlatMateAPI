import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';

describe('MessagingService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    conversation: { findUnique: jest.fn(), upsert: jest.fn() },
    message: { findMany: jest.fn() },
  };
  const service = new MessagingService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('rejects conversations with yourself', async () => {
    await expect(
      service.getOrCreateConversation('user-a', 'user-a'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing recipient', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.getOrCreateConversation('user-a', 'user-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses a canonical participant order for unique direct conversations', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-a' });
    prisma.conversation.upsert.mockResolvedValue({ id: 'conversation' });

    await service.getOrCreateConversation('user-z', 'user-a');

    expect(prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          participantOneId_participantTwoId: {
            participantOneId: 'user-a',
            participantTwoId: 'user-z',
          },
        },
      }),
    );
  });

  it('does not expose message history to a non-participant', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation',
      participantOneId: 'user-a',
      participantTwoId: 'user-b',
    });

    await expect(
      service.listMessages('user-c', 'conversation', undefined, 50),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
});
