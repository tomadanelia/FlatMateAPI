import { AlgorithmKey } from '@prisma/client';
import { IsArray, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
export class FindMatchesDto {
  @IsUUID() userId: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsArray() @IsEnum(AlgorithmKey, { each: true }) algorithms?: AlgorithmKey[];
}
