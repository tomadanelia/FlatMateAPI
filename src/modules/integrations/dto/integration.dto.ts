import { IntegrationProvider } from "../../../generated/prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from "class-validator";

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TasteItemDto)
  items: TasteItemDto[];
}

export class ConnectLetterboxdDto {
  @IsUUID() userId: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Matches(/^[A-Za-z0-9_]{1,32}$/, {
    message: "username may only contain letters, numbers, and underscores",
  })
  username: string;
}
