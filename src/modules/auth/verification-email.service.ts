import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class VerificationEmailService {
  constructor(private readonly config: ConfigService) {}

  async sendVerificationCode(email: string, code: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Email verification is temporarily unavailable',
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
    } catch {
      throw new ServiceUnavailableException(
        'Email verification is temporarily unavailable',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Email verification is temporarily unavailable',
      );
    }
  }
}
