import { HttpException, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import {
  AuthenticatedUser,
  JwtPayload,
} from '../auth/interfaces/jwt-payload.interface';
import {
  SocketReadConversationDto,
  SocketSendMessageDto,
} from './dto/send-message.dto';
import { MessagingService } from './messaging.service';

type AuthenticatedSocket = Socket & {
  data: { user?: AuthenticatedUser };
};

@WebSocketGateway({
  namespace: '/chat',
  transports: ['websocket'],
  pingInterval: 25_000,
  pingTimeout: 20_000,
  cors: { origin: true, credentials: true },
})
export class MessagingGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  private server: Namespace;

  constructor(
    private readonly messaging: MessagingService,
    private readonly jwt: JwtService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const rawToken = client.handshake.auth?.token;
      if (typeof rawToken !== 'string') throw new Error('Missing access token');
      const token = rawToken.replace(/^Bearer\s+/i, '');
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (!payload.sub || !payload.email || !payload.role) {
        throw new Error('Invalid access token');
      }
      client.data.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      await client.join(this.userRoom(payload.sub));
      client.emit('realtime:ready', { userId: payload.sub });
    } catch {
      client.emit('realtime:error', {
        message: 'Unauthorized realtime connection',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    delete client.data.user;
  }

  onModuleDestroy() {
    this.server?.disconnectSockets(true);
  }

  @SubscribeMessage('message:send')
  async send(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SocketSendMessageDto,
  ) {
    const user = this.requireUser(client);
    try {
      const result = await this.messaging.sendMessage(
        user.id,
        dto.conversationId,
        dto.body,
      );
      this.emitNewMessage(result.participantIds, result.message);
      return { event: 'message:sent', data: result.message };
    } catch (error) {
      throw this.websocketError(error);
    }
  }

  @SubscribeMessage('conversation:read')
  async read(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SocketReadConversationDto,
  ) {
    const user = this.requireUser(client);
    try {
      const result = await this.messaging.markRead(user.id, dto.conversationId);
      this.emitReadReceipt(result.participantIds, result);
      return { event: 'conversation:read', data: result };
    } catch (error) {
      throw this.websocketError(error);
    }
  }

  emitNewMessage(participantIds: string[], message: unknown) {
    for (const id of participantIds) {
      this.server.to(this.userRoom(id)).emit('message:new', message);
    }
  }

  emitReadReceipt(participantIds: string[], receipt: unknown) {
    for (const id of participantIds) {
      this.server.to(this.userRoom(id)).emit('conversation:read', receipt);
    }
  }

  private requireUser(client: AuthenticatedSocket) {
    if (!client.data.user) throw new WsException('Unauthorized');
    return client.data.user;
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private websocketError(error: unknown) {
    return new WsException(
      error instanceof HttpException ? error.message : 'Messaging failed',
    );
  }
}
