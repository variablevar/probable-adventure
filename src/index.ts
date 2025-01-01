import { config, validateConfig } from './config/config';
import { SolanaService } from './services/solanaService';
import { TelegrafBotService } from './services/telegrafBot';
import { TradeService } from './services/tradeService';
import { WalletService } from './services/walletServie';

async function main() {
  try {
    // Validate configuration
    validateConfig(config);

    // Initialize services
    const walletService = new WalletService();
    const tradeService = new TradeService(config);
    const solanaService = new SolanaService(config);
    const telegramBot = new TelegrafBotService(config, solanaService,tradeService,walletService);

    console.log('Starting Solana Copy Trading Bot...');

    // Start the bot
    await telegramBot.start();

    // Start monitoring transactions
    // await solanaService.monitorTransactions();

    console.log('Bot is running and monitoring transactions...');
  } catch (error) {
    console.error('Error starting the bot:', error);
    process.exit(1);
  }
}

main();