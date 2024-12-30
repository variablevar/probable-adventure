import { Keypair } from '@solana/web3.js';
import { PrismaClient, Wallet } from '@prisma/client';
import path from 'path';

interface WalletData {
  publicKey: string;
  privateKey: string;
  telegramId: string;
  createdAt: Date;
  firstName?: string | null
    lastName?: string | null
    username?: string | null
    type?: string | null
}

export class WalletService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // Create a new wallet for a given telegramId
  public async createWallet(telegramId: string,firstName :string ,
    lastName :string  ,
    username :string  ,
    type:string): Promise<string> {
    const existingWallet = await this.prisma.wallet.findUnique({
      where: { telegramId },
    });

    if (existingWallet) {
      throw new Error('Wallet already exists for this user');
    }

    const wallet = Keypair.generate();
    const walletData: WalletData = {
      publicKey: wallet.publicKey.toString(),
      privateKey: Buffer.from(wallet.secretKey).toString('base64'),
      telegramId,
      createdAt: new Date(Date.now()),
      firstName,
    lastName,
    username,
    type,
    };

    // Save the wallet to the database
    await this.prisma.wallet.create({
      data: walletData,
    });

    return wallet.publicKey.toString();
  }

  // Get wallet by telegramId
  public async getWallet(telegramId: string): Promise<Keypair | null> {
    const walletData = await this.prisma.wallet.findUnique({
      where: { telegramId },
    });

    if (!walletData) {
      return null;
    }

    const privateKeyBuffer = Buffer.from(walletData.privateKey, 'base64');
    return Keypair.fromSecretKey(new Uint8Array(privateKeyBuffer));
  }

  // Get public key by telegramId
  public async getWalletPublicKey(telegramId: string): Promise<string | null> {
    const walletData = await this.prisma.wallet.findUnique({
      where: { telegramId },
      select: { publicKey: true },
    });
    return walletData?.publicKey || null;
  }

  // Delete wallet by telegramId
  public async deleteWallet(telegramId: string): Promise<boolean> {
    const result = await this.prisma.wallet.delete({
      where: { telegramId },
    });
    return result !== null;
  }
}
