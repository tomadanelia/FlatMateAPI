CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "participant_one_id" UUID NOT NULL,
    "participant_two_id" UUID NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_distinct_ordered_participants_check"
      CHECK ("participant_one_id" < "participant_two_id")
);

CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_participant_one_id_participant_two_id_key"
  ON "conversations"("participant_one_id", "participant_two_id");
CREATE INDEX "conversations_participant_one_id_last_message_at_idx"
  ON "conversations"("participant_one_id", "last_message_at");
CREATE INDEX "conversations_participant_two_id_last_message_at_idx"
  ON "conversations"("participant_two_id", "last_message_at");
CREATE INDEX "messages_conversation_id_created_at_id_idx"
  ON "messages"("conversation_id", "created_at", "id");
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_one_id_fkey"
  FOREIGN KEY ("participant_one_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_two_id_fkey"
  FOREIGN KEY ("participant_two_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
