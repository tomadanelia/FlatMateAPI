import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VerificationEmailService } from './verification-email.service';

describe('VerificationEmailService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('reports a missing Resend API key without exposing a secret', async () => {
    const service = new VerificationEmailService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);

    await expect(
      service.sendVerificationCode('user@example.com', '123456'),
    ).rejects.toMatchObject({
      response: {
        code: 'EMAIL_CONFIG_MISSING',
        diagnostic:
          'RESEND_API_KEY is missing or empty in the server environment',
      },
    });
  });

  it('includes Resend rejection details in the debug response', async () => {
    const service = new VerificationEmailService({
      get: jest.fn((key: string) =>
        key === 'RESEND_API_KEY' ? 'secret-key' : undefined,
      ),
    } as unknown as ConfigService);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'validation_error',
          message: 'The sender domain is not verified',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      service.sendVerificationCode('user@example.com', '123456'),
    ).rejects.toMatchObject({
      response: {
        statusCode: 503,
        code: 'EMAIL_PROVIDER_REJECTED',
        providerStatus: 403,
        diagnostic:
          'Resend returned HTTP 403: validation_error: The sender domain is not verified',
      },
    });
  });

  it('reports network failures without including the API key', async () => {
    const service = new VerificationEmailService({
      get: jest.fn((key: string) =>
        key === 'RESEND_API_KEY' ? 'secret-key' : undefined,
      ),
    } as unknown as ConfigService);
    global.fetch = jest.fn().mockRejectedValue(new Error('connection refused'));

    try {
      await service.sendVerificationCode('user@example.com', '123456');
      throw new Error('Expected the email call to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(JSON.stringify(error)).not.toContain('secret-key');
      expect(error).toMatchObject({
        response: {
          code: 'EMAIL_PROVIDER_UNREACHABLE',
          diagnostic:
            'Could not reach the Resend API (Error: connection refused)',
        },
      });
    }
  });
});
