import { UserRole } from '../../generated/prisma/client';
import { MessagingGateway } from './messaging.gateway';

describe('MessagingGateway connection lifecycle', () => {
  const messaging = {};
  const jwt = { verifyAsync: jest.fn() };
  const gateway = new MessagingGateway(messaging as never, jwt as never);

  beforeEach(() => jest.clearAllMocks());

  function socket(token?: string) {
    return {
      handshake: { auth: token ? { token } : {} },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      disconnect: jest.fn(),
    } as unknown as Parameters<MessagingGateway['handleConnection']>[0];
  }

  it('connects an authenticated website session without a chat-page flag', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'user@example.com',
      role: UserRole.USER,
    });
    const client = socket('access-token');

    await gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('user:user-id');
    expect(client.emit).toHaveBeenCalledWith('realtime:ready', {
      userId: 'user-id',
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects sessions without a valid token', async () => {
    const client = socket();

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('realtime:error', {
      message: 'Unauthorized realtime connection',
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });
});
