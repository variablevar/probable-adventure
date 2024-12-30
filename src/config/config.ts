// src/config/config.ts
import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  TELEGRAM_BOT_TOKEN: string;
  SOLANA_RPC_URL: string;
  RAYDIUM_PROGRAM_ID: string;
}

export const config: Config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL!,
  RAYDIUM_PROGRAM_ID: process.env.RAYDIUM_PROGRAM_ID!,
};

// Validation function
export function validateConfig(config: Config): void {
  const missingKeys = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingKeys.join(', ')}`
    );
  }
}