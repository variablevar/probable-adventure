import {
  Connection,
  PublicKey,
  Transaction,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
  Keypair,
  VersionedTransactionResponse,
  ParsedTransactionWithMeta,
  TokenBalance,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  AccountLayout,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  getMint,
} from '@solana/spl-token';
import { Config } from '../config/config';
import BN from 'bn.js';
import { Metaplex } from '@metaplex-foundation/js';
import { ENV, TokenListProvider } from '@solana/spl-token-registry';
import { SwapPlatfrom } from '../utils/platforms';
import { TokenInfo, TradeInfo } from '../interfaces';

interface RaydiumPool {
  id: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  baseDecimals: number;
  quoteDecimals: number;
  baseVault: string;
  quoteVault: string;
  openOrders: string;
  authority: string;
}

export class TradeService {
  // Raydium Program IDs
  private readonly RAYDIUM_LIQUIDITY_PROGRAM_ID = new PublicKey(
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  );
  private readonly SERUM_PROGRAM_ID = new PublicKey(
    '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
  );

  // Common token addresses
  private readonly TOKENS = {
    SOL: new PublicKey('So11111111111111111111111111111111111111112'),
    USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
    RAY: new PublicKey('4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'),
    // Add more tokens as needed
  };

  private readonly connection: Connection;

  constructor(private config: Config) {
    this.connection = new Connection(config.SOLANA_RPC_URL);
  }

  public async parseTradeInfo(
    transaction: VersionedTransactionResponse | ParsedTransactionWithMeta,
    targetedWallet: PublicKey,
  ): Promise<Partial<TradeInfo> | null> {
    try {
      if (!transaction.meta || !transaction.meta.logMessages) {
        return null;
      }

      const logs = transaction.meta.logMessages;

      if (!this.isAnySwap(logs)) {
        return null;
      }

      // Parse the swap details from logs
      const swapInfo = await this.decodeSwapInstruction(
        transaction,
        targetedWallet,
      );

      if (!swapInfo) {
        return null;
      }

      return swapInfo;
    } catch (error) {
      console.error('Error parsing trade info:', error);
      return null;
    }
  }

  private isAnySwap(logs: string[]): boolean {
    return (
      logs.some(
        (log) =>
          // for others swap
          log.includes('Program log: Instruction: Swap') ||
          // for raydium
          log.includes('Program log: ray_log'),
      ) || this.isPumpFunSwap(logs)
    );
  }

  private isPumpFunSwap(logs: string[]): boolean {
    return logs.some(
      (log) =>
        log.includes('Program log: Instruction: Buy') ||
        log.includes('Program log: Instruction: Transfer'),
    );
  }

  private async decodeSwapInstruction(
    txResponse: VersionedTransactionResponse | ParsedTransactionWithMeta,
    targetedWallet: PublicKey,
  ): Promise<Partial<TradeInfo>> {
    if (!txResponse) {
      console.log('Transaction not found');
    }

    const { transaction, meta, blockTime } = txResponse;

    if (!transaction || !meta) {
      console.log('Incomplete transaction data');
    }

    // Initialize swap details object
    const swapDetails: Partial<TradeInfo> = {
      timestamp: blockTime ? blockTime * 1000 : Date.now(),
    };

    const preTokenBalances = meta?.preTokenBalances || [];
    const postTokenBalances = meta?.postTokenBalances || [];

    const filterAccounts = this.compareBalances(
      preTokenBalances,
      postTokenBalances,
    );
    const [tnxA, tnxB] = filterAccounts.filter(
      (account) => account.owner == targetedWallet.toBase58(),
    );

    if (tnxA.type === 'IN') {
      swapDetails.amountIn = tnxA.amountDifference / 10 ** tnxA.decimals;
      swapDetails.amountOut = tnxB.amountDifference / 10 ** tnxB.decimals;
      swapDetails.tokenA = await this.getTokenDetails(
        new PublicKey(tnxA.mint),
        'IN',
        swapDetails.amountIn,
      );
      swapDetails.tokenB = await this.getTokenDetails(
        new PublicKey(tnxB.mint),
        'OUT',
        swapDetails.amountOut,
      );
    } else {
      swapDetails.amountIn = tnxB.amountDifference / 10 ** tnxB.decimals;
      swapDetails.amountOut = tnxA.amountDifference / 10 ** tnxA.decimals;
      swapDetails.tokenA = await this.getTokenDetails(
        new PublicKey(tnxA.mint),
        'OUT',
        swapDetails.amountOut,
      );
      swapDetails.tokenB = await this.getTokenDetails(
        new PublicKey(tnxB.mint),
        'IN',
        swapDetails.amountIn,
      );
    }

    swapDetails.txHash = txResponse.transaction.signatures[0];
    return swapDetails;
  }

  private compareBalances(
    preTokenBalances: TokenBalance[],
    postTokenBalances: TokenBalance[],
  ) {
    const balanceChanges = [];

    // Loop through the preTokenBalances array
    for (let i = 0; i < preTokenBalances.length; i++) {
      const pre = preTokenBalances[i];

      // Find the corresponding post balance based on accountIndex and mint
      const post = postTokenBalances.find(
        (p) => p.accountIndex === pre.accountIndex && p.mint === pre.mint,
      );

      if (post) {
        // Calculate the difference in token amounts (in the smallest unit)
        const preAmount = parseFloat(pre.uiTokenAmount.amount);
        const postAmount = parseFloat(post.uiTokenAmount.amount);
        const amountDifference = postAmount - preAmount;

        // Determine the type of transaction (IN or OUT)
        const type = amountDifference > 0 ? 'IN' : 'OUT';

        // eleminate 0 diff
        if (amountDifference != 0) {
          balanceChanges.push({
            mint: pre.mint,
            owner: pre.owner,
            preAmount,
            postAmount,
            amountDifference,
            type,
            programId: pre.programId,
            decimals: pre.uiTokenAmount.decimals,
            uiAmountString: pre.uiTokenAmount.uiAmountString,
          });
        }
      }
    }

    return balanceChanges;
  }

  public async getTokenDetails(
    mintAddress: PublicKey,
    type: 'IN' | 'OUT',
    amount: number,
  ): Promise<TokenInfo> {
    try {
      // Initialize connection
      const mintPublicKey = new PublicKey(mintAddress);
      // Fetch mint info
      const mintInfo = await getMint(
        this.connection,
        mintPublicKey,
        'confirmed',
        TOKEN_PROGRAM_ID,
      );
      const metaplex = Metaplex.make(this.connection);
      let name;
      let symbol;
      let uri;

      const metadataAccount = metaplex
        .nfts()
        .pdas()
        .metadata({ mint: mintAddress });

      const metadataAccountInfo =
        await this.connection.getAccountInfo(metadataAccount);

      if (metadataAccountInfo) {
        const token = await metaplex
          .nfts()
          .findByMint({ mintAddress: mintAddress });
        name = token.name;
        symbol = token.symbol;
        uri = token.json?.image;
      } else {
        const provider = await new TokenListProvider().resolve();
        const tokenList = provider.filterByChainId(ENV.MainnetBeta).getList();
        console.log(tokenList);
        const tokenMap = tokenList.reduce((map, item) => {
          map.set(item.address, item);
          return map;
        }, new Map());
        const token = tokenMap.get(mintAddress.toBase58());
        name = token.name;
        symbol = token.symbol;
        uri = token.logoURI;
      }
      // Compile token information
      const tokenInfo = {
        mint: mintAddress,
        decimals: mintInfo.decimals,
        supply: Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals),
        mintAuthority: mintInfo.mintAuthority?.toBase58(),
        freezeAuthority: mintInfo.freezeAuthority?.toBase58(),
        isInitialized: mintInfo.isInitialized,
        name,
        type,
        amount,
        symbol,
        uri,
        programId: TOKEN_PROGRAM_ID.toBase58(),
      };
      return tokenInfo;
    } catch (error) {
      throw new Error(
        `Failed to fetch token info: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  public async executeTrade(
    userWallet: Keypair,
    poolId: string,
    tradeInfo: TradeInfo,
  ): Promise<boolean> {
    try {
      // 1. Get pool info
      const pool = await this.getPoolInfo(poolId);
      if (!pool) {
        throw new Error('Pool not found');
      }

      // 2. Check if user has required token accounts
      const tokenAccounts = await this.setupTokenAccounts(
        userWallet,
        pool.baseMint,
        pool.quoteMint,
      );

      // 3. Calculate amounts with slippage
      const { amountIn, minimumAmountOut } = this.calculateAmounts(
        tradeInfo.amount || 0,
        tradeInfo.slippage || 1, // Default 1% slippage
      );

      // 4. Create swap instruction
      const swapInstruction = await this.createSwapInstruction(
        pool,
        userWallet.publicKey,
        tokenAccounts.sourceToken,
        tokenAccounts.destinationToken,
        amountIn,
        minimumAmountOut,
      );

      // 5. Build and send transaction
      const transaction = new Transaction();
      transaction.add(swapInstruction);

      // 6. Sign and send transaction
      const txHash = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [userWallet],
      );

      console.log('Trade executed successfully:', txHash);
      return true;
    } catch (error) {
      console.error('Error executing trade:', error);
      return false;
    }
  }

  private async getPoolInfo(poolId: string): Promise<RaydiumPool | null> {
    try {
      // Implement pool info fetching from Raydium
      // This would typically involve fetching the pool account data
      // and deserializing it according to Raydium's schema
      return {
        id: poolId,
        baseMint: this.TOKENS.SOL.toString(),
        quoteMint: this.TOKENS.USDC.toString(),
        lpMint: '',
        baseDecimals: 9,
        quoteDecimals: 6,
        baseVault: '',
        quoteVault: '',
        openOrders: '',
        authority: '',
      };
    } catch (error) {
      console.error('Error fetching pool info:', error);
      return null;
    }
  }

  private async setupTokenAccounts(
    wallet: Keypair,
    baseMint: string,
    quoteMint: string,
  ) {
    const sourceTokenAta = await getAssociatedTokenAddress(
      new PublicKey(baseMint),
      wallet.publicKey,
    );

    const destinationTokenAta = await getAssociatedTokenAddress(
      new PublicKey(quoteMint),
      wallet.publicKey,
    );

    // Check if accounts exist and create if needed
    const sourceInfo = await this.connection.getAccountInfo(sourceTokenAta);
    const destInfo = await this.connection.getAccountInfo(destinationTokenAta);

    const instructions = [];

    if (!sourceInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          sourceTokenAta,
          wallet.publicKey,
          new PublicKey(baseMint),
        ),
      );
    }

    if (!destInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          destinationTokenAta,
          wallet.publicKey,
          new PublicKey(quoteMint),
        ),
      );
    }

    if (instructions.length > 0) {
      const tx = new Transaction().add(...instructions);
      await sendAndConfirmTransaction(this.connection, tx, [wallet]);
    }

    return {
      sourceToken: sourceTokenAta,
      destinationToken: destinationTokenAta,
    };
  }

  private calculateAmounts(amount: number, slippagePercent: number) {
    const amountIn = new BN(amount);
    const minimumAmountOut = amountIn.muln(100 - slippagePercent).divn(100);

    return {
      amountIn,
      minimumAmountOut,
    };
  }

  private async createSwapInstruction(
    pool: RaydiumPool,
    userPublicKey: PublicKey,
    sourceToken: PublicKey,
    destinationToken: PublicKey,
    amountIn: BN,
    minimumAmountOut: BN,
  ) {
    // Create the swap instruction based on Raydium's instruction layout
    // This is where you'd implement the actual swap instruction creation
    // based on Raydium's SDK or instruction layout

    const keys = [
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      {
        pubkey: new PublicKey(pool.baseVault),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: new PublicKey(pool.quoteVault),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: sourceToken, isSigner: false, isWritable: true },
      { pubkey: destinationToken, isSigner: false, isWritable: true },
      { pubkey: userPublicKey, isSigner: true, isWritable: false },
      {
        pubkey: new PublicKey(pool.authority),
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: new PublicKey(pool.openOrders),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: this.SERUM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // Simplified instruction data - you'll need to implement the actual layout
    const data = Buffer.from([
      /* instruction layout data */
    ]);

    return {
      programId: this.RAYDIUM_LIQUIDITY_PROGRAM_ID,
      keys,
      data,
    };
  }

  // Helper methods for additional functionality

  public async getTokenBalance(
    wallet: PublicKey,
    tokenMint: string,
  ): Promise<number> {
    try {
      const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(tokenMint),
        wallet,
      );

      const balance =
        await this.connection.getTokenAccountBalance(tokenAccount);
      return (
        Number(balance.value.amount) / Math.pow(10, balance.value.decimals)
      );
    } catch (error) {
      console.error('Error getting token balance:', error);
      return 0;
    }
  }

  public async getPoolPrice(poolId: string): Promise<number | null> {
    try {
      const pool = await this.getPoolInfo(poolId);
      if (!pool) return null;

      // Implement price calculation based on pool reserves
      // This would involve fetching the current amounts in the pool vaults
      // and calculating the price
      return 100; // Placeholder
    } catch (error) {
      console.error('Error getting pool price:', error);
      return null;
    }
  }

  public async estimateTradeOutput(
    poolId: string,
    inputAmount: number,
    inputToken: string,
    outputToken: string,
  ): Promise<{ amount: number; priceImpact: number } | null> {
    try {
      // Implement trade output estimation based on pool state
      // This would calculate the expected output amount and price impact
      return {
        amount: inputAmount * 100, // Placeholder
        priceImpact: 0.1, // Placeholder
      };
    } catch (error) {
      console.error('Error estimating trade output:', error);
      return null;
    }
  }
}
