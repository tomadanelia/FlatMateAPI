import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    emailVerificationCode: {
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };
  const verificationEmail = { sendVerificationCode: jest.fn() };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    verificationEmail as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.signAsync.mockResolvedValue('signed-token');
    verificationEmail.sendVerificationCode.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(
      async (
        operation: ((client: typeof prisma) => unknown) | Promise<unknown>[],
      ) =>
        typeof operation === 'function'
          ? operation(prisma)
          : Promise.all(operation),
    );
    prisma.user.update.mockResolvedValue({});
    prisma.emailVerificationCode.create.mockResolvedValue({});
    prisma.emailVerificationCode.update.mockResolvedValue({});
    prisma.emailVerificationCode.delete.mockResolvedValue({});
    prisma.emailVerificationCode.deleteMany.mockResolvedValue({ count: 1 });
    prisma.emailVerificationCode.upsert.mockResolvedValue({});
  });

  it('creates an unverified account, hashes the code, and emails it', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({ id: data.id }),
    );

    const result = await service.signUp({
      email: ' Person@Example.com ',
      password: 'StrongPass1',
      displayName: 'Taylor',
    });

    expect(result).toMatchObject({
      email: 'person@example.com',
      expiresInSeconds: 600,
    });
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'person@example.com',
          passwordHash: expect.any(String),
        }),
      }),
    );
    const sentCode = verificationEmail.sendVerificationCode.mock.calls[0][1];
    expect(sentCode).toMatch(/^\d{6}$/);
    const createData =
      prisma.emailVerificationCode.create.mock.calls[0][0].data;
    expect(createData.codeHash).not.toBe(sentCode);
    await expect(compare(sentCode, createData.codeHash)).resolves.toBe(true);
  });

  it('rejects duplicate verified signup emails', async () => {
    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
    await expect(
      service.signUp({
        email: 'person@example.com',
        password: 'StrongPass1',
        displayName: 'Taylor',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('verifies a valid code, consumes it, and returns an access token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      displayName: 'Taylor',
      role: 'USER',
      emailVerifiedAt: null,
      emailVerification: {
        id: 'verification-id',
        codeHash: await hash('123456', 4),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      },
    });

    const result = await service.verifyEmail({
      email: 'PERSON@example.com',
      code: '123456',
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-id' },
        data: { emailVerifiedAt: expect.any(Date) },
      }),
    );
    expect(prisma.emailVerificationCode.delete).toHaveBeenCalledWith({
      where: { id: 'verification-id' },
    });
    expect(result.accessToken).toBe('signed-token');
  });

  it('counts incorrect verification attempts without exposing details', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      emailVerifiedAt: null,
      emailVerification: {
        id: 'verification-id',
        codeHash: await hash('123456', 4),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
      },
    });

    await expect(
      service.verifyEmail({ email: 'person@example.com', code: '654321' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.emailVerificationCode.update).toHaveBeenCalledWith({
      where: { id: 'verification-id' },
      data: { attempts: { increment: 1 } },
    });
  });

  it('logs verified users in without returning internal fields', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      displayName: 'Taylor',
      role: 'USER',
      passwordHash: await hash('StrongPass1', 4),
      emailVerifiedAt: new Date(),
    });

    const result = await service.login({
      email: 'person@example.com',
      password: 'StrongPass1',
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('emailVerifiedAt');
    expect(result.accessToken).toBe('signed-token');
  });

  it('emails a verification code after a pending user proves the password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      displayName: 'Taylor',
      role: 'USER',
      passwordHash: await hash('StrongPass1', 4),
      emailVerifiedAt: null,
      emailVerification: null,
    });

    await expect(
      service.login({
        email: 'person@example.com',
        password: 'StrongPass1',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'EMAIL_VERIFICATION_REQUIRED',
        verificationEmailSent: true,
      },
    });
    expect(verificationEmail.sendVerificationCode).toHaveBeenCalledWith(
      'person@example.com',
      expect.stringMatching(/^\d{6}$/),
    );

    await expect(
      service.login({
        email: 'person@example.com',
        password: 'WrongPassword1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verificationEmail.sendVerificationCode).toHaveBeenCalledTimes(1);
  });

  it('does not send another login code during the resend cooldown', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'person@example.com',
      displayName: 'Taylor',
      role: 'USER',
      passwordHash: await hash('StrongPass1', 4),
      emailVerifiedAt: null,
      emailVerification: { lastSentAt: new Date() },
    });

    await expect(
      service.login({
        email: 'person@example.com',
        password: 'StrongPass1',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'EMAIL_VERIFICATION_REQUIRED',
        verificationEmailSent: false,
      },
    });
    expect(verificationEmail.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('does not reveal whether an email exists when resending', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.resendVerification({
      email: 'missing@example.com',
    });

    expect(result.message).toContain('If this email');
    expect(verificationEmail.sendVerificationCode).not.toHaveBeenCalled();
  });
});
