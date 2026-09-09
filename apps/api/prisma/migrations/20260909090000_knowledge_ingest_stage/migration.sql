-- CreateEnum
CREATE TYPE "KnowledgeIngestStage" AS ENUM ('UPLOADING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'PUBLISHED');

-- AlterTable
ALTER TABLE "KnowledgeSource" ADD COLUMN "stage" "KnowledgeIngestStage",
ADD COLUMN "failedStage" "KnowledgeIngestStage";
