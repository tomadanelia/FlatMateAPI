import { validate } from "class-validator";
import { UpdateAvatarDto } from "./update-avatar.dto";

const dto = (avatarUrl?: string | null) =>
  Object.assign(
    new UpdateAvatarDto(),
    avatarUrl === undefined ? {} : { avatarUrl },
  );

describe("UpdateAvatarDto", () => {
  it("accepts HTTP(S) image addresses and null", async () => {
    await expect(
      validate(dto("https://images.example.com/profile.jpg")),
    ).resolves.toHaveLength(0);
    await expect(validate(dto(null))).resolves.toHaveLength(0);
  });

  it("rejects missing, relative, and non-HTTP(S) addresses", async () => {
    await expect(validate(dto())).resolves.not.toHaveLength(0);
    await expect(validate(dto("/profile.jpg"))).resolves.not.toHaveLength(0);
    await expect(
      validate(dto("ftp://images.example.com/profile.jpg")),
    ).resolves.not.toHaveLength(0);
  });
});
