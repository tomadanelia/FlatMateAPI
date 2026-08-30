import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { UserRole } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerificationEmailService } from './verification-email.service';

const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_CODE_MAX_ATTEMPTS = 5;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const INVALID_CODE_MESSAGE = 'Invalid or expired verification code';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly verificationEmail: VerificationEmailService,
  ) {}

  async signUp(dto: SignUpDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { emailVerifiedAt: true },
    });
    if (existing?.emailVerifiedAt)
      throw new ConflictException('An account with this email already exists');
    if (existing) {
      throw new ConflictException(
        'This email is awaiting verification. Request a new code to continue',
      );
    }

    const passwordHash = await hash(dto.password, 12);
    const code = this.generateVerificationCode();
    const codeHash = await hash(code, 12);
    try {
      await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            id: randomUUID(),
            email,
            passwordHash,
            displayName: dto.displayName.trim(),
          },
          select: { id: true },
        });
        await transaction.emailVerificationCode.create({
          data: {
            userId: user.id,
            codeHash,
            expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
          },
        });
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }

    await this.verificationEmail.sendVerificationCode(email, code);
    return this.verificationPendingResponse(email);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerifiedAt: true,
        emailVerification: true,
      },
    });

    const verification = user?.emailVerification;
    if (
      !user ||
      user.emailVerifiedAt ||
      !verification ||
      verification.expiresAt.getTime() <= Date.now() ||
      verification.attempts >= VERIFICATION_CODE_MAX_ATTEMPTS
    ) {
      if (verification) {
        await this.prisma.emailVerificationCode.deleteMany({
          where: { id: verification.id },
        });
      }
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    if (!(await compare(dto.code, verification.codeHash))) {
      const nextAttempts = verification.attempts + 1;
      if (nextAttempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
        await this.prisma.emailVerificationCode.delete({
          where: { id: verification.id },
        });
      } else {
        await this.prisma.emailVerificationCode.update({
          where: { id: verification.id },
          data: { attempts: { increment: 1 } },
        });
      }
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.emailVerificationCode.delete({
        where: { id: verification.id },
      }),
    ]);

    const { emailVerifiedAt: _, emailVerification: __, ...safeUser } = user;
    return this.issueToken(safeUser);
  }

  async resendVerification(dto: ResendVerificationDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        emailVerifiedAt: true,
        emailVerification: { select: { lastSentAt: true } },
      },
    });

    if (!user || user.emailVerifiedAt) {
      return this.verificationPendingResponse(email);
    }

    await this.sendVerificationCodeIfAllowed(
      user.id,
      email,
      user.emailVerification?.lastSentAt,
    );
    return this.verificationPendingResponse(email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        passwordHash: true,
        emailVerifiedAt: true,
        emailVerification: { select: { lastSentAt: true } },
      },
    });
    if (
      !user?.passwordHash ||
      !(await compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerifiedAt) {
      const verificationEmailSent = await this.sendVerificationCodeIfAllowed(
        user.id,
        user.email,
        user.emailVerification?.lastSentAt,
      );
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Email verification is required',
        code: 'EMAIL_VERIFICATION_REQUIRED',
        verificationEmailSent,
      });
    }
    const {
      passwordHash: _,
      emailVerifiedAt: __,
      emailVerification: ___,
      ...safeUser
    } = user;
    return this.issueToken(safeUser);
  }

  private async sendVerificationCodeIfAllowed(
    userId: string,
    email: string,
    lastSentAt?: Date | null,
  ) {
    if (
      lastSentAt &&
      Date.now() - lastSentAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS
    ) {
      return false;
    }

    const code = this.generateVerificationCode();
    const codeHash = await hash(code, 12);
    await this.prisma.emailVerificationCode.upsert({
      where: { userId },
      create: {
        userId,
        codeHash,
        expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
      },
      update: {
        codeHash,
        expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
        attempts: 0,
        lastSentAt: new Date(),
      },
    });
    await this.verificationEmail.sendVerificationCode(email, code);
    return true;
  }

  private generateVerificationCode() {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private verificationPendingResponse(email: string) {
    return {
      message:
        'If this email has an unverified account, a verification code has been sent',
      email,
      expiresInSeconds: VERIFICATION_CODE_TTL_MS / 1000,
    };
  }

  private async issueToken(user: {
    id: string;
    email: string;
    displayName: string | null;
    role: UserRole;
  }) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, tokenType: 'Bearer', user };
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
