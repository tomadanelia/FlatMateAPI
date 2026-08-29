ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);

-- Existing accounts predate email verification. Treat them as verified so this
-- migration does not lock current users out of password login.
UPDATE "users" SET "email_verified_at" = CURRENT_TIMESTAMP;

CREATE TABLE "email_verification_codes" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "code_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_verification_codes_user_id_key" ON "email_verification_codes"("user_id");
CREATE INDEX "email_verification_codes_expires_at_idx" ON "email_verification_codes"("expires_at");

ALTER TABLE "email_verification_codes"
ADD CONSTRAINT "email_verification_codes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
