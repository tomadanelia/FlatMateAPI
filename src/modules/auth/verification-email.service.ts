import {
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const EMAIL_UNAVAILABLE_MESSAGE =
  'Email verification is temporarily unavailable';

type EmailFailureCode =
  | 'EMAIL_CONFIG_MISSING'
  | 'EMAIL_PROVIDER_UNREACHABLE'
  | 'EMAIL_PROVIDER_REJECTED';

@Injectable()
export class VerificationEmailService {
  private readonly logger = new Logger(VerificationEmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationCode(email: string, code: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.fail(
        'EMAIL_CONFIG_MISSING',
        'RESEND_API_KEY is missing or empty in the server environment',
      );
    }

    const from =
      this.config.get<string>('RESEND_FROM_EMAIL') ??
      'Flatmate <onboarding@resend.dev>';
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Verify your Flatmate email',
          text: `Your Flatmate verification code is ${code}. It expires in 10 minutes.`,
          html: `<p>Your Flatmate verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not create this account, you can ignore this email.</p>`,
        }),
      });
    } catch (error) {
      const reason =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : 'Unknown network error';
      this.fail(
        'EMAIL_PROVIDER_UNREACHABLE',
        `Could not reach the Resend API (${reason})`,
      );
    }

    if (!response.ok) {
      const providerMessage = await this.readProviderError(response);
      this.fail(
        'EMAIL_PROVIDER_REJECTED',
        `Resend returned HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`,
        response.status,
      );
    }
  }

  private async readProviderError(response: Response) {
    try {
      const body: unknown = await response.json();
      if (typeof body !== 'object' || body === null) return undefined;

      const message = 'message' in body ? body.message : undefined;
      const name = 'name' in body ? body.name : undefined;
      const parts = [name, message].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );
      return parts.join(': ').slice(0, 500) || undefined;
    } catch {
      return undefined;
    }
  }

  private fail(
    code: EmailFailureCode,
    diagnostic: string,
    providerStatus?: number,
  ): never {
    this.logger.error(`[${code}] ${diagnostic}`);
    throw new ServiceUnavailableException({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      error: 'Service Unavailable',
      message: EMAIL_UNAVAILABLE_MESSAGE,
      code,
      diagnostic,
      ...(providerStatus === undefined ? {} : { providerStatus }),
    });
  }
}
