-- CreateEnum
CREATE TYPE "KnowledgeIngestionStage" AS ENUM ('UPLOADING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'INDEXING', 'PUBLISHED');

-- AlterTable
ALTER TABLE "KnowledgeSource" ADD COLUMN "stage" "KnowledgeIngestionStage",
ADD COLUMN "failedStage" "KnowledgeIngestionStage";
