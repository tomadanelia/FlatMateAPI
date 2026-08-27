import { IsArray, IsUUID } from "class-validator";

export class UpdateMusicTastesDto {
  @IsArray()
  @IsUUID("4", { each: true })
  musicGenreIds: string[];

  @IsArray()
  @IsUUID("4", { each: true })
  artistIds: string[];
}
