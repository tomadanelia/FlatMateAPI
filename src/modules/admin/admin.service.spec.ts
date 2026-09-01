import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new AdminService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('lists user names and IDs in a stable sorted order', async () => {
    const users = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        displayName: 'Alex',
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        displayName: 'Taylor',
      },
    ];
    prisma.user.findMany.mockResolvedValue(users);

    await expect(service.listUsers()).resolves.toEqual(users);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      select: { id: true, displayName: true },
      orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
    });
  });

  it('deletes a user and returns a deletion receipt', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'test@example.com',
    });
    prisma.user.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.deleteUser('00000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'test@example.com',
      deleted: true,
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: '00000000-0000-4000-8000-000000000001' },
    });
  });

  it('rejects an unknown user without attempting a delete', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.deleteUser('missing-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
  });

  it('handles a user deleted concurrently as not found', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'test@example.com',
    });
    prisma.user.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      service.deleteUser('00000000-0000-4000-8000-000000000001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
