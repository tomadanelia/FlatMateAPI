import { IsArray, IsUUID } from "class-validator";

export class UpdateMovieTastesDto {
  @IsArray()
  @IsUUID("4", { each: true })
  movieGenreIds: string[];

  @IsArray()
  @IsUUID("4", { each: true })
  movieIds: string[];
}
