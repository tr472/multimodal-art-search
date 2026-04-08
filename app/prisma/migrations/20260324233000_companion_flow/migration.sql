-- CreateEnum
CREATE TYPE "ThreadImageRole" AS ENUM ('PRIMARY', 'SUPPORTING', 'DETAIL', 'WALL_LABEL', 'COMPARATIVE');

-- CreateEnum
CREATE TYPE "ExternalLookupMode" AS ENUM ('IDENTIFICATION', 'CONTEXT', 'RECOMMENDATION');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "metadataJson" JSONB;

-- CreateTable
CREATE TABLE "ThreadImage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "role" "ThreadImageRole" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalLookupResult" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "mode" "ExternalLookupMode" NOT NULL,
    "queryText" TEXT NOT NULL,
    "candidateTitle" TEXT,
    "candidateArtist" TEXT,
    "movementOrPeriod" TEXT,
    "evidenceSummary" TEXT NOT NULL,
    "sourceUrls" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalLookupResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreadImage_threadId_createdAt_idx" ON "ThreadImage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalLookupResult_threadId_createdAt_idx" ON "ExternalLookupResult"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ThreadImage" ADD CONSTRAINT "ThreadImage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLookupResult" ADD CONSTRAINT "ExternalLookupResult_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
