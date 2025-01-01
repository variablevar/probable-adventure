import { Telegraf, Context, Markup } from 'telegraf';
import { Config } from '../config/config';
import { SolanaService } from './solanaService';
import { TokenInfo, TradeInfo, TradeService } from './tradeService';
import { message } from 'telegraf/filters';
import { PrismaClient } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';

const prisma = new PrismaClient();

interface BotContext extends Context {
  session?: {
    subscribed: boolean;
  };
}

export class TelegrafBotService {
  private bot: Telegraf<BotContext>;
  private subscribers: Set<string>;

  constructor(
    private config: Config,
    private solanaService: SolanaService,
    private tradeService:TradeService
  ) {
    this.bot = new Telegraf<BotContext>(config.TELEGRAM_BOT_TOKEN);
    this.subscribers = new Set();
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
  }

  private setupMiddleware() {
    // Session middleware for user state
    this.bot.use(async (ctx, next) => {
      if (!ctx.session) {
        ctx.session = { subscribed: false };
      }
      await next();
    });
  }

  private setupCommands() {
    // Start command
    this.bot.command('start', async (ctx) => {
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📝 Create Wallet', 'create_wallet')],
        [Markup.button.callback('💰 Check Balance', 'check_balance')],
        [Markup.button.callback('✅ Subscribe', 'subscribe')],
        [Markup.button.callback('❌ Unsubscribe', 'unsubscribe')],
        [Markup.button.callback('ℹ️ Status', 'status')],
        [Markup.button.callback('ℹ️ Add Target Wallet', 'add_target_wallets')],

      ]);

      await ctx.reply(
        `Welcome to Solana Copy Trading Bot! 🚀\n\nSelect an action:`,
        keyboard
      );
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      const helpText = `
Available Commands:
/start - Show main menu
/wallet - Create or view your wallet
/balance - Check your wallet balance
/subscribe - Start copy trading
/unsubscribe - Stop copy trading
/status - Check bot status
/help - Show this help message

Need more help? Contact support at @yoursupport
      `;
      await ctx.reply(helpText);
    });

    // Direct commands
    this.bot.command('add_target_wallets', this.handleAddTargetWalletCommand.bind(this));
    this.bot.command('wallet', this.handleWalletCommand.bind(this));
    this.bot.command('balance', this.handleBalanceCommand.bind(this));
    this.bot.command('subscribe', this.handleSubscribeCommand.bind(this));
    this.bot.command('unsubscribe', this.handleUnsubscribeCommand.bind(this));
    this.bot.command('status', this.handleStatusCommand.bind(this));
  }

  private setupCallbacks() {
    // Callback queries for inline buttons
    this.bot.action('add_target_wallets', async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleAddTargetWalletCommand(ctx);
    });

    this.bot.action('create_wallet', async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleWalletCommand(ctx);
    });

    this.bot.action('check_balance', async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleBalanceCommand(ctx);
    });

    this.bot.action('subscribe', async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleSubscribeCommand(ctx);
    });

    this.bot.action('unsubscribe', async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleUnsubscribeCommand(ctx);
    });

    this.bot.action('status', async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleStatusCommand(ctx);
    });
  }

  private async handleAddTargetWalletCommand(ctx: BotContext){
    const msg = await ctx.reply(
      'Please send a list of wallet addresses (comma-separated or line-separated, max 25 wallets).'
    );

    // Wait for the user's input
    this.bot.on('text', async (ctx) => {
      const walletInput = ctx.message.text.trim();
      const wallets = this.parseWalletInput(walletInput);

      // Check if we have more than 25 wallets
      if (wallets.length > 25) {
        await ctx.reply('You can add a maximum of 25 wallets.');
        return;
      }

      // Add wallets to the database
      const uniqueWallets = wallets
      // const uniqueWallets = await this.addTargetWallets(wallets);

      if (uniqueWallets.length === 0) {
        await ctx.reply('No unique wallets were added.');
      } else {
        await ctx.reply(
          `Successfully added the following unique wallet(s):\n${uniqueWallets.join('\n')}`
        );
      }

      await this.setupWalletListeners(uniqueWallets);
    });
  }

  private async handleWalletCommand(ctx: BotContext) {
    try {
      const {firstName  ,
      lastName   ,
      username   ,
      type       } = ctx.chat as any;
      const chatId = ctx.chat?.id.toString();
      if (!chatId) return;

      const existingWallet = await this.solanaService.getUserWallet(chatId);
      
      if (existingWallet) {
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('💰 Check Balance', 'check_balance')],
          [Markup.button.callback('🔄 Back to Menu', 'start')]
        ]);

        await ctx.reply(
          `Your wallet public key:\n\`${existingWallet.publicKey.toString()}\``,
          { 
            parse_mode: 'Markdown',
            ...keyboard
          }
        );
      } else {
        const newPublicKey = await this.solanaService.createUserWallet(chatId,firstName  ,
          lastName   ,
          username   ,
          type);
        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('💰 Check Balance', 'check_balance')],
          [Markup.button.callback('🔄 Back to Menu', 'start')]
        ]);

        await ctx.reply(
          `✅ New wallet created!\n\nPublic key:\n\`${newPublicKey}\`\n\nMake sure to fund this wallet to start copy trading.`,
          {
            parse_mode: 'Markdown',
            ...keyboard
          }
        );
      }
    } catch (error) {
      console.log(error);
      
      await ctx.reply('❌ Error managing wallet. Please try again later.');
    }
  }

  private async handleBalanceCommand(ctx: BotContext) {
    try {
      const chatId = ctx.chat?.id.toString();
      if (!chatId) return;

      const balance = await this.solanaService.getWalletBalance(chatId);
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh Balance', 'check_balance')],
        [Markup.button.callback('🔄 Back to Menu', 'start')]
      ]);

      if (balance === null) {
        await ctx.reply(
          '❌ No wallet found. Create one first!',
          Markup.inlineKeyboard([[Markup.button.callback('📝 Create Wallet', 'create_wallet')]])
        );
      } else {
        await ctx.reply(
          `💰 Current balance: ${balance.toFixed(4)} SOL`,
          keyboard
        );
      }
    } catch (error) {
      await ctx.reply('❌ Error checking balance. Please try again later.');
    }
  }

  private async handleSubscribeCommand(ctx: BotContext) {
    try {
      const chatId = ctx.chat?.id.toString();
      if (!chatId) return;

      const wallet = await this.solanaService.getUserWallet(chatId);
      if (!wallet) {
        await ctx.reply(
          '❌ Please create a wallet first!',
          Markup.inlineKeyboard([[Markup.button.callback('📝 Create Wallet', 'create_wallet')]])
        );
        return;
      }

      const balance = await this.solanaService.getWalletBalance(chatId);
      if (!balance || balance < 0.01) {
        await ctx.reply(
          '❌ Insufficient balance. Please fund your wallet with at least 0.01 SOL'
        );
        // return;
      }

      this.subscribers.add(chatId);
      if (ctx.session) {
        ctx.session.subscribed = true;
      }
      
      await ctx.reply(
        '✅ Successfully subscribed to copy trading!',
        Markup.inlineKeyboard([[Markup.button.callback('🔄 Back to Menu', 'start')]])
      );
    } catch (error) {
      await ctx.reply('❌ Error subscribing. Please try again later.');
    }
  }

  private async handleUnsubscribeCommand(ctx: BotContext) {
    try {
      const chatId = ctx.chat?.id.toString();
      if (!chatId) return;

      this.subscribers.delete(chatId);
      if (ctx.session) {
        ctx.session.subscribed = false;
      }

      await ctx.reply(
        '✅ Successfully unsubscribed from copy trading.',
        Markup.inlineKeyboard([[Markup.button.callback('🔄 Back to Menu', 'start')]])
      );
    } catch (error) {
      await ctx.reply('❌ Error unsubscribing. Please try again later.');
    }
  }

  private async handleStatusCommand(ctx: BotContext) {
    try {
      const chatId = ctx.chat?.id.toString();
      if (!chatId) return;

      const wallet = await this.solanaService.getUserWallet(chatId);
      const balance = wallet ? await this.solanaService.getWalletBalance(chatId) : null;
      const isSubscribed = this.subscribers.has(chatId);

      const statusMessage = `
🤖 Bot Status:
└ Active: ✅

👛 Wallet Status:
└ Created: ${wallet ? '✅' : '❌'}
└ Balance: ${balance !== null ? `${balance.toFixed(4)} SOL` : 'N/A'}

📈 Copy Trading:
└ Subscribed: ${isSubscribed ? '✅' : '❌'}
└ Total Subscribers: ${this.subscribers.size}

🎯 Target Wallet:
└ ${``}
      `;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💰 Check Balance', 'check_balance')],
        [isSubscribed 
          ? Markup.button.callback('❌ Unsubscribe', 'unsubscribe')
          : Markup.button.callback('✅ Subscribe', 'subscribe')
        ],
        [Markup.button.callback('🔄 Back to Menu', 'start')]
      ]);

      await ctx.reply(statusMessage, keyboard);
    } catch (error) {
      await ctx.reply('❌ Error fetching status. Please try again later.');
    }
  }

  public async notifySubscribers(tradeInfo: TradeInfo) {
    const message = this.formatTradeMessage(tradeInfo);
    
    for (const chatId of this.subscribers) {
      try {
        await this.bot.telegram.sendMessage(chatId, message, { 
          parse_mode: 'Markdown',
          link_preview_options:{is_disabled:true}
        });
      } catch (error) {
        console.error(`Error notifying subscriber ${chatId}:`, error);
      }
    }
  }
  private formatTradeMessage(tradeInfo: TradeInfo): string {
    // Helper function to get the symbol from token info or string
    const getTokenSymbol = (token: TokenInfo | string): string => {
      if (typeof token === 'string') {
        return token;
      } else if (token && token.symbol) {
        return token.symbol;
      }
      return 'Unknown Token';
    };
  
    // Get formatted token symbols
    const tokenASymbol = tradeInfo.tokenA && getTokenSymbol(tradeInfo.tokenA);
    const tokenBSymbol = tradeInfo.tokenB && getTokenSymbol(tradeInfo.tokenB);
  
    // Prepare trade type
    const tradeType = tradeInfo.type ? tradeInfo.type.toUpperCase() : 'UNKNOWN';
  
    // Format timestamp to a readable string
    const formattedTimestamp = tradeInfo.timestamp
      ? new Date(tradeInfo.timestamp).toLocaleString()
      : 'Unknown Time';
  
    return `
  🔄 *New Trade Detected*
  Type: \`${tradeType}\`
  Pair: \`${tokenASymbol}/${tokenBSymbol}\`
  Amount: \`${tradeInfo.amount} ${tokenASymbol}\`
  Price: \`${tradeInfo.price} ${tokenBSymbol}\`
  Time: \`${formattedTimestamp}\`
      `;
  }

   // Parse input to get a list of wallet addresses
   private parseWalletInput(input: string): string[] {
    return input.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
  }

  // Add the target wallets to the database
  private async addTargetWallets(wallets: string[]): Promise<string[]> {
    const uniqueWallets: string[] = [];

    for (const wallet of wallets) {
      try {
        const existingWallet = await prisma.targetWallet.findUnique({
          where: { address: wallet },
        });

        if (!existingWallet) {
          await prisma.targetWallet.create({
            data: { address: wallet },
          });
          uniqueWallets.push(wallet);
        }
      } catch (error) {
        console.error('Error adding wallet:', error);
      }
    }

    return uniqueWallets;
  }

  // Setup listeners for the newly added target wallets
  private async setupWalletListeners(wallets: string[]) {
    // Here you can implement logic to start listeners for these wallets
    // Assuming solanaService has functionality to listen for transactions on a wallet
    // for (const wallet of wallets) {
    //   console.log(`Setting up listener for wallet: ${wallet}`);
    //   // Call your solanaService to start the listener for this wallet
    // }
    await this.solanaService.monitorTransactions(wallets.map(w=> new PublicKey(w)),async (transaction) => {
      const tradeInfo = await this.tradeService.parseTradeInfo(transaction);
      
      if (tradeInfo) {
        // Notify subscribers about the trade
        await this.notifySubscribers(tradeInfo);

        // Trade execution will be handled per subscriber
        // in the TelegrafBotService
      }
    });
  }

  public async start() {
    try {
      this.bot.launch();
      console.log('Bot started successfully');

      // Enable graceful stop
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    } catch (error) {
      console.error('Error starting bot:', error);
      throw error;
    }
  }

  public async stop() {
    await this.bot.stop();
  }
}