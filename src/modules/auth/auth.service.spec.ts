import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
  const service = new AuthService(prisma as never, jwt as never);

  beforeEach(() => jest.clearAllMocks());

  it('creates a normalized account and returns an access token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      email: data.email,
      displayName: data.displayName,
      role: 'USER',
    }));

    const result = await service.signUp({
      email: ' Person@Example.com ',
      password: 'StrongPass1',
      displayName: 'Taylor',
    });

    expect(result.accessToken).toBe('signed-token');
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: 'person@example.com',
        passwordHash: expect.any(String),
      }),
    }));
  });

  it('rejects duplicate signup emails', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.signUp({
      email: 'person@example.com',
      password: 'StrongPass1',
      displayName: 'Taylor',
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in without returning the password hash', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      displayName: 'Taylor',
      role: 'USER',
      passwordHash: await hash('StrongPass1', 4),
    });

    const result = await service.login({ email: 'person@example.com', password: 'StrongPass1' });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.accessToken).toBe('signed-token');
  });

  it('uses one generic error for invalid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.login({ email: 'missing@example.com', password: 'nope' }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });
});
