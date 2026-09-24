import { createHash, randomUUID } from 'crypto';
import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getMint,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  AccountLayout,
} from '@solana/spl-token';
import bs58 from 'bs58';
import {
  atomicAmount,
  QuoteRequest,
  SwapResult,
  VenueAdapter,
  VenueQuote,
} from './venue';

const JUPITER = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
interface ApiInstruction {
  programId: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}
export interface JupiterRoute {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: unknown[];
  swapInstruction: ApiInstruction;
  setupInstructions: ApiInstruction[];
  cleanupInstruction?: ApiInstruction | null;
  otherInstructions: ApiInstruction[];
  tipInstruction?: ApiInstruction | null;
  addressesByLookupTableAddress?: Record<string, string[]> | null;
}
export type RouteFetcher = (request: QuoteRequest) => Promise<JupiterRoute>;

export function jupiterHttp(apiKey: string): RouteFetcher {
  return async (request) => {
    if (!apiKey) throw new Error('JUPITER_API_KEY is required');
    const query = new URLSearchParams({
      inputMint: request.inputMint,
      outputMint: request.outputMint,
      amount: request.amountAtomic,
      taker: request.owner,
      slippageBps: String(request.slippageBps),
      swapMode: 'ExactIn',
      wrapAndUnwrapSol: 'false',
    });
    const response = await fetch(`https://api.jup.ag/swap/v2/build?${query}`, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(`Jupiter build failed (${response.status})`);
    return (await response.json()) as JupiterRoute;
  };
}

/** ExactIn, classic SPL tokens and existing ATAs only; SOL must be pre-wrapped. */
export class JupiterVenue implements VenueAdapter {
  private quotes = new Map<
    string,
    { quote: VenueQuote; route: JupiterRoute }
  >();
  constructor(
    private connection: Connection,
    private fetchRoute: RouteFetcher,
    private options: {
      executionEnabled?: boolean;
      maxQuoteAgeMs?: number;
      maxSlippageBps?: number;
      now?: () => number;
    } = {},
  ) {
    if (
      !Number.isInteger(this.maxAge) ||
      this.maxAge <= 0 ||
      this.maxAge > 60000
    )
      throw new Error('Invalid quote age policy');
    if (
      !Number.isInteger(this.maxSlippage) ||
      this.maxSlippage < 0 ||
      this.maxSlippage > 1000
    )
      throw new Error('Invalid slippage policy');
  }
  private get now() {
    return (this.options.now || Date.now)();
  }
  private get maxAge() {
    return this.options.maxQuoteAgeMs ?? 15000;
  }
  private get maxSlippage() {
    return this.options.maxSlippageBps ?? 100;
  }

  private validateRequest(request: QuoteRequest) {
    for (const key of [request.owner, request.inputMint, request.outputMint]) {
      if (new PublicKey(key).toBase58() !== key)
        throw new Error('Invalid public key');
    }
    if (request.inputMint === request.outputMint)
      throw new Error('Mints must differ');
    atomicAmount(request.amountAtomic);
    if (
      !Number.isInteger(request.inputDecimals) ||
      request.inputDecimals < 0 ||
      request.inputDecimals > 18
    )
      throw new Error('Invalid input decimals');
    if (
      !Number.isInteger(request.slippageBps) ||
      request.slippageBps < 0 ||
      request.slippageBps > this.maxSlippage
    )
      throw new Error('Slippage exceeds policy');
  }
  private async validateMints(request: QuoteRequest) {
    const [input, output] = await Promise.all([
      getMint(
        this.connection,
        new PublicKey(request.inputMint),
        'confirmed',
        TOKEN_PROGRAM_ID,
      ),
      getMint(
        this.connection,
        new PublicKey(request.outputMint),
        'confirmed',
        TOKEN_PROGRAM_ID,
      ),
    ]);
    if (
      !input.isInitialized ||
      !output.isInitialized ||
      input.decimals !== request.inputDecimals
    )
      throw new Error('Mint initialization or amount decimals mismatch');
  }
  private validateRoute(route: JupiterRoute, request: QuoteRequest) {
    if (
      route.inputMint !== request.inputMint ||
      route.outputMint !== request.outputMint ||
      route.inAmount !== request.amountAtomic ||
      route.swapMode !== 'ExactIn' ||
      route.slippageBps !== request.slippageBps
    )
      throw new Error('Route does not match request');
    const out = atomicAmount(route.outAmount);
    const minimum = atomicAmount(route.otherAmountThreshold);
    if (
      minimum > out ||
      minimum !== (out * BigInt(10000 - request.slippageBps)) / 10000n
    )
      throw new Error('Unsafe output threshold');
    if (!Array.isArray(route.routePlan) || route.routePlan.length === 0)
      throw new Error('Empty route');
  }
  async quote(request: QuoteRequest): Promise<VenueQuote> {
    request = { ...request };
    this.validateRequest(request);
    await this.validateMints(request);
    const started = this.now;
    const route = structuredClone(await this.fetchRoute(request));
    this.validateRoute(route, request);
    if (this.now - started >= this.maxAge)
      throw new Error('Quote expired during fetch');
    for (const [id, entry] of this.quotes)
      if (entry.quote.expiresAt <= this.now) this.quotes.delete(id);
    if (this.quotes.size >= 1000) throw new Error('Quote capacity reached');
    const quote: VenueQuote = {
      status: 'quoted',
      venue: 'jupiter',
      id: randomUUID(),
      request,
      outputAmountAtomic: route.outAmount,
      minimumOutputAtomic: route.otherAmountThreshold,
      expiresAt: started + this.maxAge,
    };
    this.quotes.set(quote.id, { quote: structuredClone(quote), route });
    return quote;
  }
  private fresh(quote: VenueQuote) {
    if (this.now >= quote.expiresAt || this.now < quote.expiresAt - this.maxAge)
      throw new Error('Quote expired; request a new quote');
  }

  async execute(quoteId: string, signer: Keypair): Promise<SwapResult> {
    if (!this.options.executionEnabled)
      throw new Error('Read-only quote mode; execution is disabled');
    const entry = this.quotes.get(quoteId);
    if (!entry) throw new Error('Unknown or consumed quote');
    // Consume before the first await: a quote may never submit twice.
    this.quotes.delete(quoteId);
    const { quote, route } = entry;
    const request = quote.request;
    this.fresh(quote);
    if (signer.publicKey.toBase58() !== request.owner)
      throw new Error('Signer does not own quote');
    this.validateRequest(request);
    this.validateRoute(route, request);
    await this.validateMints(request);
    const source = await getAssociatedTokenAddress(
      new PublicKey(request.inputMint),
      signer.publicKey,
    );
    const destination = await getAssociatedTokenAddress(
      new PublicKey(request.outputMint),
      signer.publicKey,
    );
    const [input, output] = await Promise.all([
      getAccount(this.connection, source, 'confirmed', TOKEN_PROGRAM_ID),
      getAccount(this.connection, destination, 'confirmed', TOKEN_PROGRAM_ID),
    ]);
    for (const [account, mint] of [
      [input, request.inputMint],
      [output, request.outputMint],
    ] as const) {
      if (
        !account.owner.equals(signer.publicKey) ||
        account.mint.toBase58() !== mint ||
        !account.isInitialized ||
        account.isFrozen ||
        account.delegate ||
        account.closeAuthority
      )
        throw new Error('Invalid token account');
    }
    if (input.amount < atomicAmount(request.amountAtomic))
      throw new Error('Insufficient token balance');
    // Never accept arbitrary setup, transfers, tips or cleanup supplied by the API.
    if (
      route.setupInstructions?.length ||
      route.otherInstructions?.length ||
      route.cleanupInstruction ||
      route.tipInstruction
    )
      throw new Error(
        'Route requires unsupported setup/cleanup; pre-create and fund token accounts',
      );
    const ix = route.swapInstruction;
    if (ix.programId !== JUPITER || !ix.data || !Array.isArray(ix.accounts))
      throw new Error('Invalid Jupiter instruction');
    // Bind the encoded on-chain ExactIn arguments to the validated quote.
    // Jupiter V1 route/shared_accounts_route both end in u64,u64,u16,u8.
    const data = Buffer.from(ix.data, 'base64');
    const variants = ['route', 'shared_accounts_route'];
    const variant = variants.find((name) =>
      data
        .subarray(0, 8)
        .equals(
          createHash('sha256').update(`global:${name}`).digest().subarray(0, 8),
        ),
    );
    if (!variant || data.length < 31)
      throw new Error('Unsupported Jupiter instruction variant');
    // Walk the pinned Jupiter V1 Borsh schema instead of trusting a tail offset:
    // otherwise appended bytes could disguise different on-chain arguments.
    // Swap enum 0..38: https://github.com/jup-ag/jupiter-cpi/blob/main/idl.json
    let offset = variant === 'shared_accounts_route' ? 9 : 8;
    const count = data.readUInt32LE(offset);
    offset += 4;
    if (count < 1 || count > 64)
      throw new Error('Invalid encoded route length');
    const oneByteVariants = new Set([
      8, 12, 15, 16, 17, 18, 21, 23, 24, 27, 28,
    ]);
    for (let step = 0; step < count; step++) {
      const swap = data[offset++];
      if (swap === undefined || swap > 38)
        throw new Error('Unsupported encoded swap variant');
      const size = oneByteVariants.has(swap)
        ? 1
        : swap === 29
          ? 16
          : swap === 33
            ? 4
            : 0;
      if (size === 1 && data[offset] > 1)
        throw new Error('Invalid encoded direction');
      offset += size;
      const percent = data[offset];
      if (!percent || percent > 100)
        throw new Error('Invalid encoded route percent');
      offset += 3; // percent, input index, output index
    }
    if (offset + 19 !== data.length)
      throw new Error('Invalid encoded instruction length');
    const args = data.subarray(-19);
    if (
      args.readBigUInt64LE(0) !== BigInt(request.amountAtomic) ||
      args.readBigUInt64LE(8) !== BigInt(quote.outputAmountAtomic) ||
      args.readUInt16LE(16) !== request.slippageBps ||
      args[18] !== 0
    )
      throw new Error('Encoded swap amounts/slippage mismatch');
    const shared = variant === 'shared_accounts_route';
    const expected = shared
      ? ([
          [2, request.owner],
          [3, source.toBase58()],
          [6, destination.toBase58()],
          [7, request.inputMint],
          [8, request.outputMint],
        ] as const)
      : ([
          [1, request.owner],
          [2, source.toBase58()],
          [3, destination.toBase58()],
          [5, request.outputMint],
        ] as const);
    if (expected.some(([index, key]) => ix.accounts[index]?.pubkey !== key))
      throw new Error('Encoded route accounts mismatch');
    if (
      !shared &&
      ![JUPITER, destination.toBase58()].includes(ix.accounts[4]?.pubkey)
    )
      throw new Error('Unexpected destination override');
    for (const account of ix.accounts) {
      if (account.isSigner && account.pubkey !== request.owner)
        throw new Error('Unexpected signer');
    }
    for (const address of [source, destination]) {
      if (
        !ix.accounts.some(
          (a) => a.pubkey === address.toBase58() && a.isWritable,
        )
      )
        throw new Error('Route token account mismatch');
    }
    const tables = await Promise.all(
      Object.keys(route.addressesByLookupTableAddress || {}).map(
        async (address) => {
          const result = await this.connection.getAddressLookupTable(
            new PublicKey(address),
          );
          if (!result.value || !result.value.isActive())
            throw new Error('Invalid lookup table');
          return result.value;
        },
      ),
    );
    const lifetime = await this.connection.getLatestBlockhash('confirmed');
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: signer.publicKey,
        recentBlockhash: lifetime.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 1400000 }),
          new TransactionInstruction({
            programId: new PublicKey(ix.programId),
            data: Buffer.from(ix.data, 'base64'),
            keys: ix.accounts.map((a) => ({
              ...a,
              pubkey: new PublicKey(a.pubkey),
            })),
          }),
        ],
      }).compileToV0Message(tables),
    );
    const simulation = await this.connection.simulateTransaction(transaction, {
      commitment: 'confirmed',
      sigVerify: false,
      replaceRecentBlockhash: false,
      accounts: {
        encoding: 'base64',
        addresses: [source.toBase58(), destination.toBase58()],
      },
    });
    if (simulation.value.err) throw new Error('Transaction simulation failed');
    const balances = simulation.value.accounts?.map((account, index) => {
      if (!account || account.owner !== TOKEN_PROGRAM_ID.toBase58())
        throw new Error('Missing simulated token account');
      const decoded = AccountLayout.decode(
        Buffer.from(account.data[0], 'base64'),
      );
      if (
        !decoded.owner.equals(signer.publicKey) ||
        decoded.mint.toBase58() !==
          [request.inputMint, request.outputMint][index] ||
        decoded.state !== 1 ||
        decoded.delegateOption ||
        decoded.closeAuthorityOption
      )
        throw new Error('Simulation changed token account controls');
      return decoded.amount;
    });
    if (
      !balances ||
      balances.length !== 2 ||
      input.amount - balances[0] !== BigInt(request.amountAtomic) ||
      balances[1] - output.amount < BigInt(quote.minimumOutputAtomic)
    )
      throw new Error('Simulated amounts do not match quote');
    if (
      (await this.connection.getBlockHeight('confirmed')) >
      lifetime.lastValidBlockHeight
    )
      throw new Error('Transaction blockhash expired');
    this.fresh(quote);
    transaction.sign([signer]);
    const signature = bs58.encode(transaction.signatures[0]);
    try {
      const returned = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false, maxRetries: 2 },
      );
      if (returned !== signature) return { status: 'pending', signature };
    } catch {
      // A timeout can occur after acceptance. Retain the locally known signature.
      return { status: 'pending', signature };
    }
    return this.reconcile(signature, request, quote.minimumOutputAtomic);
  }

  async reconcile(
    signature: string,
    request: QuoteRequest,
    minimumOutputAtomic: string,
  ): Promise<SwapResult> {
    this.validateRequest(request);
    atomicAmount(minimumOutputAtomic);
    if (bs58.decode(signature).length !== 64)
      throw new Error('Invalid signature');
    try {
      const status = (
        await this.connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        })
      ).value[0];
      if (!status) return { status: 'pending', signature };
      if (status.err)
        return {
          status: 'failed',
          signature,
          reason: 'On-chain transaction failed',
        };
      if (!['confirmed', 'finalized'].includes(status.confirmationStatus || ''))
        return { status: 'pending', signature };
      const tx = await this.connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!tx?.meta) return { status: 'pending', signature };
      if (tx.meta.err)
        return {
          status: 'failed',
          signature,
          reason: 'On-chain transaction failed',
        };
      if (
        !tx.transaction.message.instructions.some(
          (ix) => ix.programId.toBase58() === JUPITER,
        )
      ) {
        return {
          status: 'failed',
          signature,
          reason: 'Confirmed transaction is not a Jupiter swap',
        };
      }
      const keys = tx.transaction.message.accountKeys;
      if (
        tx.transaction.signatures[0] !== signature ||
        !keys.some((a) => a.signer && a.pubkey.toBase58() === request.owner)
      )
        throw new Error('Confirmed signer/signature mismatch');
      const changes = (mint: string) => {
        const total = (
          balances: import('@solana/web3.js').TokenBalance[] | null | undefined,
        ) =>
          (balances || [])
            .filter((b) => b.owner === request.owner && b.mint === mint)
            .reduce((sum, b) => sum + BigInt(b.uiTokenAmount.amount), 0n);
        return (
          total(tx.meta!.postTokenBalances) - total(tx.meta!.preTokenBalances)
        );
      };
      const spent = -changes(request.inputMint);
      const received = changes(request.outputMint);
      if (
        spent !== BigInt(request.amountAtomic) ||
        received < BigInt(minimumOutputAtomic)
      )
        return {
          status: 'failed',
          signature,
          reason:
            'Confirmed balances do not match expected swap; review signature',
        };
      return {
        status: 'confirmed',
        signature,
        inputAmountAtomic: spent.toString(),
        outputAmountAtomic: received.toString(),
      };
    } catch {
      return { status: 'pending', signature };
    }
  }
}
