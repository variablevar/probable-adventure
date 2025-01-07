import { Telegraf, Context, Markup } from 'telegraf';
import { Config } from '../config/config';
import { SolanaService } from './solanaService';
import { TokenInfo, TradeInfo, TradeService } from './tradeService';
import { message } from 'telegraf/filters';
import { PrismaClient } from '@prisma/client';
import { PublicKey } from '@solana/web3.js';
import { WalletService } from './walletServie';

const prisma = new PrismaClient();

interface BotContext extends Context {
  session?: {
    subscribed: boolean;
  };
}

export class TelegrafBotService {
  private bot: Telegraf<BotContext>;
  private subscribers: Set<string>;
  private awaitingAddresses: Map<string, Function> = new Map();

  constructor(
    private config: Config,
    private solanaService: SolanaService,
    private tradeService:TradeService,
    private targetWalletService:WalletService
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
        [Markup.button.callback('ℹ️ Manage Wallet', 'manage_target_wallets')],

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
    this.bot.command('manage_target_wallets', this.handleManageTargetWalletCommand.bind(this));
    this.bot.command('wallet', this.handleWalletCommand.bind(this));
    this.bot.command('balance', this.handleBalanceCommand.bind(this));
    this.bot.command('subscribe', this.handleSubscribeCommand.bind(this));
    this.bot.command('unsubscribe', this.handleUnsubscribeCommand.bind(this));
    this.bot.command('status', this.handleStatusCommand.bind(this));
  }

  private async setupCallbacks() {
    const wallets = await this.targetWalletService.viewTargetWalletsAll();
    this.setupWalletListeners(wallets);
    // Listen for messages based on user flow stored in the awaitingAddresses map
    this.bot.on('message', async (messageCtx) => {
      const chatId = messageCtx.from?.id.toString();
      if (chatId && this.awaitingAddresses.has(chatId)) {
        const callback = this.awaitingAddresses.get(chatId);
        if (callback) {
          await callback(messageCtx);
        }else{
          await messageCtx.reply(`Something went wrong , callback not found`);
        }
      }
    });

    // Callback queries for inline buttons
    this.bot.action('manage_target_wallets', async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleManageTargetWalletCommand(ctx);
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

  private async handleManageTargetWalletCommand(ctx: BotContext){

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('💰 Check Balance', 'check_balance')],
      [Markup.button.callback('✅ Subscribe', 'subscribe')],
      [Markup.button.callback('❌ Unsubscribe', 'unsubscribe')],
      [Markup.button.callback('ℹ️ Status', 'status')],
      [Markup.button.callback('ℹ️ Add Target Wallet', 'add_target_wallet')],
      [Markup.button.callback('🔎 View Target Wallets', 'view_target_wallets')],
      [Markup.button.callback('✏️ Update Target Wallet', 'update_target_wallet')],
      [Markup.button.callback('❌ Delete Target Wallet', 'delete_target_wallet')],
    ]);
    
    await ctx.reply(
      `Welcome to Solana Copy Trading Bot! 🚀\n\nSelect an action:`,
      keyboard
    );

        // Add Target Wallet
    this.bot.action('add_target_wallet', async (ctx) => {
      const chatId = ctx.from?.id.toString();
      if (chatId) {
        this.awaitingAddresses.set(chatId, this.handleAddTargetWallet.bind(this));
        await ctx.reply('Please provide the Target Wallet address:');
      }
    });

    // View Target Wallets
    this.bot.action('view_target_wallets', async (ctx) => {
      const chatId = ctx.from?.id.toString();
      if (chatId) {
        const response = await this.targetWalletService.viewTargetWallets(chatId);
        await ctx.reply(response);
      }
    });

    // Update Target Wallet
    this.bot.action('update_target_wallet', async (ctx) => {
      const chatId = ctx.from?.id.toString();
      if (chatId) {
        this.awaitingAddresses.set(chatId, this.handleUpdateTargetWallet.bind(this));
        await ctx.reply('Please provide the Target Wallet address you want to update:');
      }
    });

    // Delete Target Wallet
    this.bot.action('delete_target_wallet', async (ctx) => {
      const chatId = ctx.from?.id.toString();
      if (chatId) {
        this.awaitingAddresses.set(chatId, this.handleDeleteTargetWallet.bind(this));
        await ctx.reply('Please provide the Target Wallet address you want to delete:');
      }
    });
  }

  // Method to handle adding a target wallet
  private async handleAddTargetWallet(messageCtx: any) {
    const chatId = messageCtx.chat?.id.toString();
    const address = this.parseWalletInput(messageCtx.message.text);
    if (chatId && address) {
      const response = await this.targetWalletService.addTargetWallet(address, chatId);
      await messageCtx.reply(response);
      this.awaitingAddresses.delete(chatId); // Clear the state
    }
  }

  // Method to handle updating a target wallet
  private async handleUpdateTargetWallet(messageCtx: any) {
    const chatId = messageCtx.chat?.id.toString();
    const oldAddress = messageCtx.message.text;
    if (chatId && oldAddress) {
      await messageCtx.reply('Please provide the new address:');
      this.awaitingAddresses.set(chatId, async (updateCtx: any) => {
        const newAddress = updateCtx.message.text;
        const response = await this.targetWalletService.updateTargetWallet(oldAddress, newAddress);
        await updateCtx.reply(response);
        this.awaitingAddresses.delete(chatId); // Clear the state
      });
    }
  }

  // Method to handle deleting a target wallet
  private async handleDeleteTargetWallet(messageCtx: any) {
    const chatId = messageCtx.chat?.id.toString();
    const address = messageCtx.message.text;
    if (chatId && address) {
      const response = await this.targetWalletService.deleteTargetWallet(address);
      await messageCtx.reply(response);
      this.awaitingAddresses.delete(chatId); // Clear the state
    }
  }

   // Parse input to get a list of wallet addresses
   private parseWalletInput(input: string): string[] {
    return input.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
  }

  private async handleWalletCommand(ctx: BotContext) {
    try {
      const {firstName,lastName ,username ,type} = ctx.chat as any;
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
        const newPublicKey = await this.solanaService.createUserWallet(chatId,firstName,lastName ,username ,type);
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
    console.log(message);
    
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
    // Helper function to get the token symbol
    const getTokenSymbol = (token: TokenInfo | string): string => {
      if (typeof token === 'string') return token;
      return token?.symbol || 'Unknown Token';
    };
  
    // Determine token symbols
    const tokenASymbol = tradeInfo.tokenA ? getTokenSymbol(tradeInfo.tokenA) : 'N/A';
    const tokenBSymbol = tradeInfo.tokenB ? getTokenSymbol(tradeInfo.tokenB) : 'N/A';
  
    // Determine trade type and emoji
    const tradeType = tradeInfo.type?.toUpperCase() || 'UNKNOWN';
    const tradeEmoji = tradeType === 'buy' ? '🟢' : tradeType === 'sell' ? '🔴' : '❓';
  
    // Format the timestamp
    const formattedTimestamp = tradeInfo.timestamp
      ? new Date(tradeInfo.timestamp).toLocaleString()
      : 'Unknown Time';
  
    // Format amount and price
    const formattedAmount = tradeInfo.amount?.toFixed(2) || 'N/A';
    const formattedPrice = tradeInfo.price?.toFixed(2) || 'N/A';
  
    // Include transaction hash if available
    const txHash = tradeInfo.txHash ? `*Transaction Hash:* \`${tradeInfo.txHash}\`\n` : '';
  
    // Construct the message
    return `
  ${tradeEmoji} *${tradeType} Trade Alert!*
  Type: \`${tradeType}\`
  *Pair:* \`${tokenASymbol}/${tokenBSymbol}\`
  *Amount:* \`${formattedAmount} ${tokenASymbol}\`
  *Price:* \`${formattedPrice} ${tokenBSymbol}\`
  *Time:* \`${formattedTimestamp}\`
  ${txHash}
    `;
  }
  

  // Setup listeners for the newly added target wallets
  private async setupWalletListeners(wallets: string[]) {
    await this.solanaService.monitorTransactions(wallets.map(w=> new PublicKey(w)),async (transaction,targetedWallet) => {
      const tradeInfo = await this.tradeService.parseTradeInfo(transaction,new PublicKey(targetedWallet));
      
      if (tradeInfo) {
        // Notify subscribers about the trade
        await this.notifySubscribers({...tradeInfo,targetedWallet});

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