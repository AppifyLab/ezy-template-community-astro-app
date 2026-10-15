-- Wrapped in one transaction: if any statement fails, none of them apply
-- and the live site keeps its old schema (see AGENTS.md).
BEGIN;

-- CreateTable
CREATE TABLE "jobs" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "company" VARCHAR(80) NOT NULL,
    "location" VARCHAR(80) NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'full-time',
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(10000) NOT NULL,
    "apply_url" VARCHAR(500) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'open',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" SERIAL NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "original_name" VARCHAR(100) NOT NULL,
    "file_type" VARCHAR(20) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_slug_key" ON "jobs"("slug");

-- CreateIndex
CREATE INDEX "jobs_status_id_idx" ON "jobs"("status", "id");

-- CreateIndex
CREATE INDEX "uploads_profile_id_id_idx" ON "uploads"("profile_id", "id");


COMMIT;
