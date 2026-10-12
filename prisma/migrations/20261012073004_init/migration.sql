-- Wrapped in one transaction: if any statement fails, none of them apply
-- and the live site keeps its old schema (see AGENTS.md).
BEGIN;

-- CreateTable
CREATE TABLE "notes" (
    "id" SERIAL NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "author" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notes_created_at_idx" ON "notes"("created_at");

COMMIT;
