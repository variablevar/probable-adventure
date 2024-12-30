-- CreateTable
CREATE TABLE "Wallet" (
    "telegramId" TEXT NOT NULL PRIMARY KEY,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "type" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_telegramId_key" ON "Wallet"("telegramId");
