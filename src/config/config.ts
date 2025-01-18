// src/config/config.ts
import dotenv from 'dotenv';
dotenv.config();

export const platforms = {
  METEORA_PROGRAM_ID: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
  ORCA_PROGRAM_ID: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  DEXLAB_PROGRAM_ID: 'DSwpgjMvXhtGn6BsbqmacdBZyfLj6jSWf3HJpdJtmg6N',
  RAYDIUM_PROGRAM_ID: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  JUPITER_PROGRAM_ID: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  // TODO: REMAIN TO IMPL
  PUMP_FUN_PROGRAM_ID: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  FLUX_BEAM_PROGRAM_ID: 'FLUXubRmkEi2q6K3Y9kBPg9248ggaZVsoSFhtJHSrm1X',
};

export interface Config {
  TELEGRAM_BOT_TOKEN: string;
  SOLANA_RPC_URL: string;
  PLATFORMS: string[];
  ADMIN_USER_NAME: string;
}

export const config: Config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL!,
  PLATFORMS: Object.values(platforms),
  ADMIN_USER_NAME: process.env.ADMIN_USER_NAME!,
};

// Validation function
export function validateConfig(config: Config): void {
  const missingKeys = Object.entries(config)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingKeys.join(', ')}`,
    );
  }
}
