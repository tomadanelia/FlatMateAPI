import { IsDefined, IsUrl, MaxLength, ValidateIf } from "class-validator";

export class UpdateAvatarDto {
  @ValidateIf((_, value) => value !== null)
  @IsDefined()
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  @MaxLength(2048)
  avatarUrl!: string | null;
}
