import { IsArray, IsUUID } from "class-validator";

export class UpdateTastesDto {
  @IsArray()
  @IsUUID("4", { each: true })
  musicGenreIds: string[];

  @IsArray()
  @IsUUID("4", { each: true })
  artistIds: string[];

  @IsArray()
  @IsUUID("4", { each: true })
  movieGenreIds: string[];

  @IsArray()
  @IsUUID("4", { each: true })
  movieIds: string[];
}
