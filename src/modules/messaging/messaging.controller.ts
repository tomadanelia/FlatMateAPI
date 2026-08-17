import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ListMessagesDto } from './dto/list-messages.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly gateway: MessagingGateway,
  ) {}

  @Post('conversations')
  createConversation(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messaging.getOrCreateConversation(
      request.user.id,
      dto.recipientId,
    );
  }

  @Get('conversations')
  listConversations(@Req() request: AuthenticatedRequest) {
    return this.messaging.listConversations(request.user.id);
  }

  @Get('conversations/:id')
  listMessages(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: ListMessagesDto,
  ) {
    return this.messaging.listMessages(
      request.user.id,
      id,
      query.cursor,
      query.limit,
    );
  }

  @Post('conversations/:id')
  async sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendMessageDto,
  ) {
    const result = await this.messaging.sendMessage(
      request.user.id,
      id,
      dto.body,
    );
    this.gateway.emitNewMessage(result.participantIds, result.message);
    return result.message;
  }

  @Patch('conversations/:id/read')
  async markRead(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const result = await this.messaging.markRead(request.user.id, id);
    this.gateway.emitReadReceipt(result.participantIds, result);
    return result;
  }
}
