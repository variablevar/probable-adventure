import {
    Connection,
    PublicKey,
    ParsedTransactionWithMeta,
    Keypair,
    VersionedTransactionResponse,
  } from '@solana/web3.js';
  import { Config } from '../config/config';
import { WalletService } from './walletServie';
  
  export class SolanaService {
    private connection: Connection;
    private walletService: WalletService;
  
    constructor(private config: Config) {
      this.connection = new Connection(config.SOLANA_RPC_URL);
      this.walletService = new WalletService();
    }
  
    public async createUserWallet(telegramId: string,firstName :string ,
        lastName :string  ,
        username :string  ,
        type:string): Promise<string> {
      return this.walletService.createUserWallet(telegramId,firstName  ,
        lastName   ,
        username   ,
        type);
    }
  
    public async getUserWallet(telegramId: string): Promise<Keypair | null> {
      return this.walletService.getUserWallet(telegramId);
    }
  
    public async monitorTransactions(
        targetWallets: PublicKey[], // Array of target wallets
        callback: (transaction: VersionedTransactionResponse,targetedWallet:string) => Promise<void>
      ) {
        try {
          console.log('Starting transaction monitoring for multiple wallets...');
      
          // Iterate over each target wallet and start monitoring
          for (const wallet of targetWallets) {
            console.log(`Monitoring wallet: ${wallet.toBase58()}`);
            
            this.connection.onLogs(
              wallet,
              async (logs) => {
                console.log(`Received logs for wallet ${wallet.toBase58()}:`);
      
                // Check if the transaction is Raydium related
                if (this.isRaydiumTransaction(logs)) {
                  const signature = logs.signature;
                  console.log(`Transaction signature: ${signature} for wallet ${wallet.toBase58()}`);
                
                  try {
                    // Fetch the raw transaction using the signature and commitment level
                    const rawTransaction = await this.connection.getTransaction(signature, {commitment:'confirmed',maxSupportedTransactionVersion:0});
                  
                    
                    if (rawTransaction) {
                      console.log(`Raw transaction found for wallet ${wallet.toBase58()}:`);
                  
                      // Optionally, parse the raw transaction here if needed
                      await callback(rawTransaction,wallet.toBase58());
                    } else {
                      console.log(`No raw transaction found for signature: ${signature}`);
                    }
                  } catch (err) {
                    console.error(`Error fetching raw transaction for wallet ${wallet.toBase58()}:`, err);
                  }
                }
              },
              'confirmed'
            );
          }
        } catch (error) {
          console.error('Error monitoring transactions:', error);
          throw error;
        }
      }
      
      
  
    private isRaydiumTransaction(logs: any): boolean {
      return logs.logs.some((log: string) =>
        log.includes(this.config.RAYDIUM_PROGRAM_ID)
      );
    }
  
    public async getWalletBalance(telegramId: string): Promise<number | null> {
      try {
        const wallet = await this.walletService.getUserWallet(telegramId);
        if (!wallet) {
          return null;
        }
        const balance = await this.connection.getBalance(wallet.publicKey);
        return balance / 10 ** 9; // Convert lamports to SOL
      } catch (error) {
        console.error('Error getting wallet balance:', error);
        throw error;
      }
    }
  
    public async executeTrade(telegramId: string, tradeInstructions: any): Promise<boolean> {
      try {
        const wallet = await this.walletService.getUserWallet(telegramId);
        if (!wallet) {
          throw new Error('Wallet not found for user');
        }
        
        // Implement trade execution logic here using the user's wallet
        // This is where you'd create and send the actual transaction
        
        return true;
      } catch (error) {
        console.error('Error executing trade:', error);
        return false;
      }
    }
  }