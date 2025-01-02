import { config, validateConfig } from './config/config';
import { SolanaService } from './services/solanaService';
import { TelegrafBotService } from './services/telegrafBot';
import { TradeService } from './services/tradeService';
import { WalletService } from './services/walletServie';
import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

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

    app.post('/', (req, res) => {
      res.send('OK');
    });
    
    app.listen(port, () => {
      console.log(`Server listening on port ${port}`);
    });
    
  } catch (error) {
    console.error('Error starting the bot:', error);
    process.exit(1);
  }
}

main();