import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
export class UpdateAlgorithmDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(100) weight?: number;
  @IsOptional() @IsString() version?: string;
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
}
