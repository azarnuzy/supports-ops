
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "KnowledgeSourceType" AS ENUM ('MANUAL_FAQ', 'PDF', 'URL', 'HELP_CENTER', 'INTERNAL_SOP');

-- CreateEnum
CREATE TYPE "KnowledgeVisibility" AS ENUM ('CUSTOMER_SAFE', 'INTERNAL_ONLY');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChunkKind" AS ENUM ('KNOWLEDGE', 'TICKET');

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "parentId" TEXT,
    "sourceType" "KnowledgeSourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "sourceUrl" TEXT,
    "visibility" "KnowledgeVisibility" NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "ChunkKind" NOT NULL DEFAULT 'KNOWLEDGE',
    "knowledgeSourceId" TEXT,
    "ticketId" TEXT,
    "customerIdentityId" TEXT,
    "channelType" "ChannelType",
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "position" INTEGER NOT NULL,
    "visibility" "KnowledgeVisibility",
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeSource_workspaceId_status_idx" ON "KnowledgeSource"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "KnowledgeSource_parentId_idx" ON "KnowledgeSource"("parentId");

-- CreateIndex
CREATE INDEX "Chunk_workspaceId_kind_isPublished_visibility_idx" ON "Chunk"("workspaceId", "kind", "isPublished", "visibility");

-- CreateIndex
CREATE INDEX "Chunk_knowledgeSourceId_idx" ON "Chunk"("knowledgeSourceId");

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_knowledgeSourceId_fkey" FOREIGN KEY ("knowledgeSourceId") REFERENCES "KnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex
-- HNSW over cosine distance, the operator packages/knowledge's retrieval
-- queries use (`<=>`). Prisma's schema DSL has no vector-index syntax, so
-- this index is hand-written rather than generated.
CREATE INDEX "Chunk_embedding_hnsw_idx" ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);
