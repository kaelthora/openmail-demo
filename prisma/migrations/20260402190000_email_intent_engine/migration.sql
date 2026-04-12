-- AlterTable
ALTER TABLE "Email" ADD COLUMN "intent" TEXT;
ALTER TABLE "Email" ADD COLUMN "intentUrgency" TEXT;
ALTER TABLE "Email" ADD COLUMN "intentConfidence" REAL;
