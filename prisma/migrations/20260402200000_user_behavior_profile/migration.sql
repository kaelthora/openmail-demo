-- CreateTable
CREATE TABLE "UserBehaviorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profileKey" TEXT NOT NULL,
    "memory" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "UserBehaviorProfile_profileKey_key" ON "UserBehaviorProfile"("profileKey");
