import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}

export class SocketSendMessageDto extends SendMessageDto {
  @IsUUID()
  conversationId: string;
}

export class SocketReadConversationDto {
  @IsUUID()
  conversationId: string;
}
