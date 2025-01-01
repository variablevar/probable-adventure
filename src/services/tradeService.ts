import { 
    Connection, 
    PublicKey, 
    Transaction, 
    SystemProgram, 
    SYSVAR_RENT_PUBKEY, 
    ParsedTransactionWithMeta,
    sendAndConfirmTransaction,
    Keypair,
    VersionedTransactionResponse
  } from '@solana/web3.js';
  import { 
    TOKEN_PROGRAM_ID, 
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddress,
    ASSOCIATED_TOKEN_PROGRAM_ID
  } from '@solana/spl-token';
  import { Config } from '../config/config';
  import BN from 'bn.js';
  export interface TokenInfo {
    mintAddress?: string;
    symbol?: string;
    name?: string;
    decimals?: number;
    tokenAccount?: string;
  }
  export interface TradeInfo {
    type?: 'buy' | 'sell';
    tokenA?: TokenInfo | string;
    tokenB?: TokenInfo | string;
    amount?: number;
    price?: number;
    timestamp?: number;
    amountIn?: number;
    amountOut?: number;
    slippage?: number;
    txHash?: string;
  }
  
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
    private readonly RAYDIUM_LIQUIDITY_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
    private readonly SERUM_PROGRAM_ID = new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
    
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
      transaction: VersionedTransactionResponse
    ): Promise<TradeInfo | null> {
      try {
        if (!transaction.meta || !transaction.meta.logMessages) {
          return null;
        }
  
        const logs = transaction.meta.logMessages;
        
        // Check if it's a Raydium swap
        if (!this.isRaydiumSwap(logs)) {
          return null;
        }
  
        // Parse the swap details from logs
        const swapInfo = await this.decodeSwapInstruction(transaction);
        if (!swapInfo) {
          return null;
        }
  
        return {
          type: swapInfo.type,
          tokenA: swapInfo.tokenA,
          tokenB: swapInfo.tokenB,
          amount: swapInfo.amount,
          price: swapInfo.price,
          timestamp: Date.now(),
          amountIn: swapInfo.amountIn,
          amountOut: swapInfo.amountOut,
          txHash: transaction.transaction.signatures[0]
        };
      } catch (error) {
        console.error('Error parsing trade info:', error);
        return null;
      }
    }
  
    private isRaydiumSwap(logs: string[]): boolean {
      return logs.some(log => 
        log.includes('Program log: Instruction: Swap') && 
        log.includes(this.RAYDIUM_LIQUIDITY_PROGRAM_ID.toString())
      );
    }

      private async getTokenInfo(tokenAccountAddress: string): Promise<TokenInfo> {
        
        // Step 1: Fetch Token Account Info
        const tokenAccount = new PublicKey(tokenAccountAddress);
        const accountInfo = await this.connection.getAccountInfo(tokenAccount);
      
        if (!accountInfo) {
          throw new Error('Token account not found');
        }
      
        // Step 2: Extract Mint Address (first 32 bytes of the token account data)
        const mintAddress = new PublicKey(accountInfo.data.slice(0, 32));
        console.log('Token Mint Address:', mintAddress.toBase58());
      
        // Step 3: Fetch Mint Info
        const mintInfo = await this.connection.getAccountInfo(mintAddress);
      
        if (!mintInfo) {
          throw new Error('Mint account info not found');
        }
      
        // Step 4: Decode the token data (mint info)
        const data = mintInfo.data;
        const symbol = String.fromCharCode(...data.slice(0, 32));  // Simplified symbol extraction
        const name = String.fromCharCode(...data.slice(32, 64));    // Simplified name extraction
        const decimals = data[64];  // Assuming decimals are in byte 64
      
        // Step 5: Return Token Info Object
        const tokenInfo: TokenInfo = {
          mintAddress: mintAddress.toBase58(),
          symbol: symbol.trim(),
          name: name.trim(),
          decimals: decimals,
          tokenAccount: tokenAccountAddress,
        };
      
        return tokenInfo;
      }

      private async decodeSwapInstruction(txResponse:VersionedTransactionResponse): Promise<TradeInfo>{
        if (!txResponse) {
          console.log("Transaction not found");
        }
    
        const { transaction, meta, blockTime } = txResponse;
    
        if (!transaction || !meta) {
          console.log("Incomplete transaction data");
        }
    
        // Initialize swap details object
        const swapDetails: Partial<TradeInfo> = {
          
          timestamp: blockTime ? blockTime * 1000 : Date.now(),
        };
    
        const logs = meta?.logMessages || [];
    
        // Step 1: Parse logs to detect swap instructions
        for (const log of logs) {
          if (log.includes("Instruction: SwapV2")) {
            // Example log format might contain these key amounts; you need to extract them first
            const amountInMatch = log.match(/amountIn: (\d+(\.\d+)?)/);
            const amountOutMatch = log.match(/amountOut: (\d+(\.\d+)?)/);
          
            const amountIn = amountInMatch ? parseFloat(amountInMatch[1]) : 0;
            const amountOut = amountOutMatch ? parseFloat(amountOutMatch[1]) : 0;
          
            // Determine if it's a buy or sell based on the amount values
            if (amountIn > amountOut) {
              swapDetails.type = "sell"; // Amount in is greater, so it's a sell
            } else if (amountOut > amountIn) {
              swapDetails.type = "buy"; // Amount out is greater, so it's a buy
            }
          }
          
    
          if (log.includes("ray_log:")) {
            const encodedData = log.split("ray_log: ")[1];
            const buffer = Buffer.from(encodedData, "base64");
    
            // Decode Raydium-specific swap data (example schema)
            const feeGrowth = buffer.readBigInt64LE(0); // Example position
            console.log("Decoded fee growth:", feeGrowth);
          }
    
          if (log.includes("Instruction: TransferChecked")) {
            // Parse token transfer details for amountIn/amountOut
            // You may need to look at account keys from `transaction.message.accountKeys`
          }
        }

        // Step 2: Extract account keys for token A and token B
        const accountKeys = transaction.message.staticAccountKeys.map((key) => key.toBase58());

        // Raydium's convention: Token A and Token B are typically the first and second token accounts
        // Adjust indices based on program-specific conventions or logs
        swapDetails.tokenA = accountKeys[meta?.preTokenBalances?.[0]?.accountIndex ?? 0];
        swapDetails.tokenB = accountKeys[meta?.preTokenBalances?.[1]?.accountIndex ?? 1] ;

        if (swapDetails.tokenA) {
          swapDetails.tokenA = await this.getTokenInfo(swapDetails.tokenA)
        }
        if (swapDetails.tokenB) {
          swapDetails.tokenB = await this.getTokenInfo(swapDetails.tokenB)
        }

        // Step 3: Populate additional fields
        const amountIn = meta?.preTokenBalances?.[0]?.uiTokenAmount?.uiAmount || 0;
        const amountOut = meta?.postTokenBalances?.[1]?.uiTokenAmount?.uiAmount || 0;

        swapDetails.amountIn = amountIn;
        swapDetails.amountOut = amountOut;
        swapDetails.amount = amountIn; // Defaulting to input amount for now
        swapDetails.price = amountOut > 0 ? amountIn / amountOut : 0; // Avoid divide-by-zero errors

        return swapDetails;
      }
      
  
    public async executeTrade(
      userWallet: Keypair,
      poolId: string,
      tradeInfo: TradeInfo
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
          pool.quoteMint
        );
  
        // 3. Calculate amounts with slippage
        const { amountIn, minimumAmountOut } = this.calculateAmounts(
          tradeInfo.amount || 0,
          tradeInfo.slippage || 1 // Default 1% slippage
        );
  
        // 4. Create swap instruction
        const swapInstruction = await this.createSwapInstruction(
          pool,
          userWallet.publicKey,
          tokenAccounts.sourceToken,
          tokenAccounts.destinationToken,
          amountIn,
          minimumAmountOut
        );
  
        // 5. Build and send transaction
        const transaction = new Transaction();
        transaction.add(swapInstruction);
  
        // 6. Sign and send transaction
        const txHash = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          [userWallet]
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
          authority: ''
        };
      } catch (error) {
        console.error('Error fetching pool info:', error);
        return null;
      }
    }
  
    private async setupTokenAccounts(
      wallet: Keypair,
      baseMint: string,
      quoteMint: string
    ) {
      const sourceTokenAta = await getAssociatedTokenAddress(
        new PublicKey(baseMint),
        wallet.publicKey
      );
  
      const destinationTokenAta = await getAssociatedTokenAddress(
        new PublicKey(quoteMint),
        wallet.publicKey
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
            new PublicKey(baseMint)
          )
        );
      }
  
      if (!destInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            wallet.publicKey,
            destinationTokenAta,
            wallet.publicKey,
            new PublicKey(quoteMint)
          )
        );
      }
  
      if (instructions.length > 0) {
        const tx = new Transaction().add(...instructions);
        await sendAndConfirmTransaction(this.connection, tx, [wallet]);
      }
  
      return {
        sourceToken: sourceTokenAta,
        destinationToken: destinationTokenAta
      };
    }
  
    private calculateAmounts(amount: number, slippagePercent: number) {
      const amountIn = new BN(amount);
      const minimumAmountOut = amountIn.muln(100 - slippagePercent).divn(100);
  
      return {
        amountIn,
        minimumAmountOut
      };
    }
  
    private async createSwapInstruction(
      pool: RaydiumPool,
      userPublicKey: PublicKey,
      sourceToken: PublicKey,
      destinationToken: PublicKey,
      amountIn: BN,
      minimumAmountOut: BN
    ) {
      // Create the swap instruction based on Raydium's instruction layout
      // This is where you'd implement the actual swap instruction creation
      // based on Raydium's SDK or instruction layout
  
      const keys = [
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new PublicKey(pool.baseVault), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(pool.quoteVault), isSigner: false, isWritable: true },
        { pubkey: sourceToken, isSigner: false, isWritable: true },
        { pubkey: destinationToken, isSigner: false, isWritable: true },
        { pubkey: userPublicKey, isSigner: true, isWritable: false },
        { pubkey: new PublicKey(pool.authority), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(pool.openOrders), isSigner: false, isWritable: true },
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
        data
      };
    }
  
    // Helper methods for additional functionality
  
    public async getTokenBalance(
      wallet: PublicKey,
      tokenMint: string
    ): Promise<number> {
      try {
        const tokenAccount = await getAssociatedTokenAddress(
          new PublicKey(tokenMint),
          wallet
        );
  
        const balance = await this.connection.getTokenAccountBalance(tokenAccount);
        return Number(balance.value.amount) / Math.pow(10, balance.value.decimals);
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
      outputToken: string
    ): Promise<{ amount: number; priceImpact: number } | null> {
      try {
        // Implement trade output estimation based on pool state
        // This would calculate the expected output amount and price impact
        return {
          amount: inputAmount * 100, // Placeholder
          priceImpact: 0.1 // Placeholder
        };
      } catch (error) {
        console.error('Error estimating trade output:', error);
        return null;
      }
    }
  }