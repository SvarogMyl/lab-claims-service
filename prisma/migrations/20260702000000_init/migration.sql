-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "tenant_slug" VARCHAR(100) NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "user_id" INTEGER,
    "user_name" VARCHAR(255),
    "user_email" VARCHAR(255),
    "type" VARCHAR(20) NOT NULL DEFAULT 'reclamo',
    "subject" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'open',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'medium',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_updates" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "author_id" INTEGER,
    "author_role" VARCHAR(20) NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_documents" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "url" VARCHAR(1000) NOT NULL,
    "size" INTEGER NOT NULL,
    "uploaded_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_counters" (
    "tenant_slug" VARCHAR(100) NOT NULL,
    "year" INTEGER NOT NULL,
    "next_val" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "claim_counters_pkey" PRIMARY KEY ("tenant_slug","year")
);

-- CreateIndex
CREATE INDEX "claims_tenant_slug_idx" ON "claims"("tenant_slug");

-- CreateIndex
CREATE INDEX "claims_user_id_idx" ON "claims"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "claims_tenant_slug_number_key" ON "claims"("tenant_slug", "number");

-- CreateIndex
CREATE INDEX "claim_updates_claim_id_idx" ON "claim_updates"("claim_id");

-- CreateIndex
CREATE INDEX "claim_documents_claim_id_idx" ON "claim_documents"("claim_id");

-- AddForeignKey
ALTER TABLE "claim_updates" ADD CONSTRAINT "claim_updates_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_documents" ADD CONSTRAINT "claim_documents_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

