import { PublicKey } from '@solana/web3.js';

export interface TokenInfo {
  type: 'IN' | 'OUT';
  amount?: number | string;
  mint: PublicKey;
  decimals: number;
  supply: number;
  mintAuthority: string | undefined;
  freezeAuthority: string | undefined;
  isInitialized: boolean;
  name: string | null;
  symbol: string | null;
  uri: string | null;
  programId: string;
}
