CREATE TYPE "LookingFor" AS ENUM ('male', 'female', 'all');

ALTER TABLE "users"
ADD COLUMN "looking_for" "LookingFor" NOT NULL DEFAULT 'all';

DROP INDEX "users_is_discoverable_onboarding_complete_gender_idx";

CREATE INDEX "users_is_discoverable_onboarding_complete_looking_for_gender_idx"
ON "users"("is_discoverable", "onboarding_complete", "looking_for", "gender");
