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

-- CreateTable
CREATE TABLE "TargetWallet" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "address" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telegramId" TEXT NOT NULL,
    CONSTRAINT "TargetWallet_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "Wallet" ("telegramId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_telegramId_key" ON "Wallet"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetWallet_address_key" ON "TargetWallet"("address");
