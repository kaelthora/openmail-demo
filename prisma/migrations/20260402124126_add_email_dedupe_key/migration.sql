/*
  Warnings:

  - Added the required column `dedupeKey` to the `Email` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupeKey" TEXT NOT NULL,
    "subject" TEXT,
    "from" TEXT,
    "body" TEXT,
    "date" DATETIME,
    "risk" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Email" ("body", "createdAt", "date", "from", "id", "risk", "subject", "summary") SELECT "body", "createdAt", "date", "from", "id", "risk", "subject", "summary" FROM "Email";
DROP TABLE "Email";
ALTER TABLE "new_Email" RENAME TO "Email";
CREATE UNIQUE INDEX "Email_dedupeKey_key" ON "Email"("dedupeKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
