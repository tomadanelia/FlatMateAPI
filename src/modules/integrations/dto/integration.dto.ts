import { IntegrationProvider } from '@prisma/client';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ConnectIntegrationDto {
  @IsUUID() userId: string;
  @IsEnum(IntegrationProvider) provider: IntegrationProvider;
  @IsOptional() @IsString() username?: string;
}
class TasteItemDto {
  @IsString() externalId: string;
  @IsString() kind: string;
  @IsString() name: string;
  @IsOptional() @IsArray() @IsString({ each: true }) artists?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) genres?: string[];
  @IsOptional() @IsNumber() score?: number;
}
export class SyncTasteDto {
  @IsUUID() userId: string;
  @IsEnum(IntegrationProvider) provider: IntegrationProvider;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TasteItemDto) items: TasteItemDto[];
}
