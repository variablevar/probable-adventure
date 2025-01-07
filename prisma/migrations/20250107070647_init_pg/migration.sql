-- CreateTable
CREATE TABLE "Wallet" (
    "telegramId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "type" TEXT,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("telegramId")
);

-- CreateTable
CREATE TABLE "TargetWallet" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "telegramId" TEXT NOT NULL,

    CONSTRAINT "TargetWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_telegramId_key" ON "Wallet"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetWallet_address_key" ON "TargetWallet"("address");

-- AddForeignKey
ALTER TABLE "TargetWallet" ADD CONSTRAINT "TargetWallet_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES "Wallet"("telegramId") ON DELETE RESTRICT ON UPDATE CASCADE;
