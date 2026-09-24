import type { Keypair } from '@solana/web3.js';

export interface QuoteRequest {
  owner: string;
  inputMint: string;
  outputMint: string;
  /** Integer base units, never a floating point UI amount. */
  amountAtomic: string;
  inputDecimals: number;
  slippageBps: number;
}

export interface VenueQuote {
  status: 'quoted';
  venue: 'jupiter';
  id: string;
  request: QuoteRequest;
  outputAmountAtomic: string;
  minimumOutputAtomic: string;
  expiresAt: number;
}

export type SwapResult =
  | { status: 'pending'; signature: string }
  | { status: 'failed'; signature: string; reason: string }
  | {
      status: 'confirmed';
      signature: string;
      inputAmountAtomic: string;
      outputAmountAtomic: string;
    };

export interface VenueAdapter {
  quote(request: QuoteRequest): Promise<VenueQuote>;
  execute(quoteId: string, signer: Keypair): Promise<SwapResult>;
  reconcile(
    signature: string,
    request: QuoteRequest,
    minimumOutputAtomic: string,
  ): Promise<SwapResult>;
}

export function atomicAmount(value: string): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error('Amount must be a positive integer string in base units');
  }
  const amount = BigInt(value);
  if (amount > 18446744073709551615n) throw new Error('Amount exceeds u64');
  return amount;
}
