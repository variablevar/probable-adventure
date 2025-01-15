---
# Solana Ghost Bot: Wallet Watcher & Copy Trader

This Telegram bot enables users to monitor specified Solana wallets for transactions and execute copy trades automatically. It's designed to be user-friendly and customizable, making it ideal for traders looking to streamline their workflow.
---

## Features

- **Wallet Monitoring**: Watch target wallets for transactions in real time.
- **Copy Trading**: Automatically replicate trades from monitored wallets to a designated wallet.
- **Notifications**: Get detailed trade alerts via Telegram messages, including trade type, amount, and token pairs.
- **Customizable Filters**: Monitor specific wallets or transactions involving a specific program ID.
- **Error Handling**: Handles rate limits and provides descriptive error messages.

---

## Requirements

### **Environment**

- **Node.js**: v18+
- **Telegram Bot API Key**: Obtain from [BotFather](https://core.telegram.org/bots#botfather).
- **Solana RPC Endpoint**: Use a reliable RPC provider (e.g., Alchemy, QuickNode).

### **Dependencies**

- `@solana/web3.js`: Interact with Solana blockchain.
- `node-telegram-bot-api`: Interface with Telegram Bot API.
- `dotenv`: Manage environment variables.
- `prisma`: For database management and migrations.
- `jest`: For testing the application.

---

## Installation

### **Step 1**: Clone the Repository

```bash
git clone https://github.com/variablevar/probable-adventure.git
cd probable-adventure
```

### **Step 2**: Install Dependencies

```bash
npm install
```

### **Step 3**: Configure Environment Variables

Create a `.env` file in the project root and populate it with your configuration:

```env
TELEGRAM_BOT_TOKEN=
SOLANA_RPC_URL=
RAYDIUM_PROGRAM_ID=
DATABASE_URL=
ADMIN_USER_NAME=
```

### **Step 4**: Run Database Migrations

Generate and deploy the database schema using Prisma:

```bash
npm run migrate:dev
npm run prisma:generate
```

### **Step 5**: Seed the Database

Seed the database with initial data:

```bash
npm run seed
```

### **Step 6**: Start the Bot

```bash
npm run dev
```

---

## Scripts

The following scripts are available in the `package.json` file:

| Script                    | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `npm run dev`             | Runs the application in development mode using `ts-node`.            |
| `npm run build`           | Builds the application for production using TypeScript.              |
| `npm run start`           | Starts the built application from the `dist` directory.              |
| `npm run migrate:dev`     | Applies Prisma migrations in development mode.                       |
| `npm run migrate:deploy`  | Deploys Prisma migrations in production.                             |
| `npm run prisma:generate` | Generates Prisma client based on the schema.                         |
| `npm run seed`            | Seeds the database with initial data using a TypeScript seed script. |
| `npm run test`            | Runs tests using Jest.                                               |

---

## Usage

### **Add the Bot to Telegram**

- Search for your bot's username in Telegram.
- Start a chat by clicking "Start".

### **Sample Trade Notification**

```
💼 *Trade Alert!*
👤 *From*: `TargetWalletPublicKey`
🔄 *Pair*: `USDC/SOL`
📈 *Amount In*: `💰 500 USDC`
📉 *Amount Out*: `💎 25 SOL`
⏰ *Time*: `2025-01-08 12:34:56`
🔗 [View Transaction on Solscan](https://solscan.io/tx/TransactionHash)
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Create a new branch (`feature/my-feature`).
2. Commit your changes.
3. Open a pull request.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---
