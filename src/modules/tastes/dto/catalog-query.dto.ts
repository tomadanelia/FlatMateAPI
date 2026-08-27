import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CatalogQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
