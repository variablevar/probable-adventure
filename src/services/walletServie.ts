import { Keypair } from '@solana/web3.js';
import { PrismaClient, Wallet } from '@prisma/client';
import path from 'path';

interface WalletData {
  publicKey: string;
  privateKey: string;
  telegramId: string;
  createdAt: Date;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  type?: string | null;
}

export class WalletService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // Create a new wallet for a given telegramId
  public async createUserWallet(
    telegramId: string,
    firstName: string,
    lastName: string,
    username: string,
    type: string,
  ): Promise<string> {
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
  public async getUserWallet(telegramId: string): Promise<Keypair | null> {
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
  public async getUserWalletPublicKey(
    telegramId: string,
  ): Promise<string | null> {
    const walletData = await this.prisma.wallet.findUnique({
      where: { telegramId },
      select: { publicKey: true },
    });
    return walletData?.publicKey || null;
  }

  // Delete wallet by telegramId
  public async deleteUserWallet(telegramId: string): Promise<boolean> {
    const result = await this.prisma.wallet.delete({
      where: { telegramId },
    });
    return result !== null;
  }

  // Add a new Target Wallet
  async addTargetWallet(address: string | string[], telegramId: string) {
    try {
      if (Array.isArray(address)) {
        await this.prisma.targetWallet.createMany({
          data: address.map((a) => {
            return {
              address: a,
              telegramId,
            };
          }),
        });
      } else {
        await this.prisma.targetWallet.create({
          data: {
            address,
            telegramId,
          },
        });
      }
      return address;
    } catch (error) {
      return 'Error adding target wallet. Please try again.';
    }
  }

  async getUserByTargetedWallet(address: string) {
    const users = await this.prisma.targetWallet.findMany({
      where: { address },
      select: { telegramId: true },
    });
    return users.map((user) => user.telegramId);
  }
  // View all Target Wallets
  async viewTargetWalletsAll() {
    const wallets = await this.prisma.targetWallet.findMany();
    const walletList = wallets.map((wallet) => wallet.address);
    return walletList;
  }

  async getTargetWallets(telegramId: string) {
    const wallets = await this.prisma.targetWallet.findMany({
      where: { telegramId },
    });
    return wallets;
  }

  async viewTargetWallets(telegramId: string) {
    const wallets = await this.prisma.targetWallet.findMany({
      where: { telegramId },
    });
    if (wallets.length === 0) {
      return 'No target wallets found.';
    }
    const walletList = wallets
      .map((wallet) => `- ${wallet.address}`)
      .join('\n');
    return `Target Wallets:\n${walletList}`;
  }

  // Update an existing Target Wallet
  async updateTargetWallet(oldAddress: string, newAddress: string) {
    try {
      const targetWallet = await this.prisma.targetWallet.findUnique({
        where: {
          address: oldAddress,
        },
      });

      if (!targetWallet) {
        return 'Target Wallet not found.';
      }

      await this.prisma.targetWallet.update({
        where: {
          address: oldAddress,
        },
        data: {
          address: newAddress,
        },
      });

      return `Target Wallet address updated from ${oldAddress} to ${newAddress}`;
    } catch (error) {
      return 'Error updating target wallet. Please try again.';
    }
  }

  // Delete a Target Wallet
  async deleteTargetWallet(address: string) {
    try {
      await this.prisma.targetWallet.delete({
        where: {
          address,
        },
      });
      return `Target Wallet with address ${address} has been deleted.`;
    } catch (error) {
      return 'Error deleting target wallet. Please try again.';
    }
  }
}
