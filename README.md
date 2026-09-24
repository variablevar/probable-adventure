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

## How it's look like now

![image](https://github.com/user-attachments/assets/082abc7f-8ce9-41d9-9a36-821ef66bd08c)

## Requirements

### **Environment**

- **Node.js**: v18+
- **Telegram Bot API Key**: Obtain from [BotFather](https://core.telegram.org/bots#botfather).
- **Solana RPC Endpoint**: Use a reliable RPC provider (e.g., Alchemy, QuickNode).

### **Dependencies**

- `@solana/web3.js`: Interact with Solana blockchain.
- `telegraf`: Interface with Telegram Bot API.
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
DATABASE_URL=
ADMIN_USER_NAME=
```

### **Step 4**: Run Database Migrations

Generate and deploy the database schema using Prisma:

```bash
npm run migrate:dev
npm run prisma:generate
```

### **Step 6**: Start the Bot

```bash
npm run dev
```

---

## Scripts

The following scripts are available in the `package.json` file:

| Script                    | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Runs the application in development mode using `ts-node`. |
| `npm run build`           | Builds the application for production using TypeScript.   |
| `npm run start`           | Starts the built application from the `dist` directory.   |
| `npm run migrate:dev`     | Applies Prisma migrations in development mode.            |
| `npm run migrate:deploy`  | Deploys Prisma migrations in production.                  |
| `npm run prisma:generate` | Generates Prisma client based on the schema.              |
| `npm run test`            | Runs tests using Jest.                                    |

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

We welcome contributions! Please follow these steps:

1. **Fork the repository**.
2. **Create a new branch**: Use a descriptive name like `feature/my-feature`.
3. **Commit your changes**: Write clear and concise commit messages.
4. **Open a pull request**: Provide details about the changes and their purpose.

## Thank you for helping improve the project!

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Jupiter venue adapter

`src/venues/jupiter.ts` isolates Jupiter Swap V2 `/build` from the bot. Set
`JUPITER_API_KEY` alongside `SOLANA_RPC_URL` to enable read-only previews:

```text
/quote INPUT_MINT OUTPUT_MINT AMOUNT_ATOMIC INPUT_DECIMALS SLIPPAGE_BPS
```

For example, 0.1 wrapped SOL is `100000000` base units with `INPUT_DECIMALS=9`.
Slippage uses basis points (`100` = 1%). The adapter checks decimals against the
on-chain mint, uses integer strings/BigInt for amounts, caps slippage at 100 bps
by default, and expires quotes after 15 seconds (including API latency).
The Telegram command uses only the stored public address, requires a private
chat, and **never signs or submits**. Its output is always labelled as a quote.
Pass `JUPITER_API_KEY` into the container when using Docker Compose.

Execution is available only to application code through the `VenueAdapter`
interface. Construct `JupiterVenue` with `{ executionEnabled: true }` to opt in;
the Telegram integration always uses the default read-only mode. Call
`execute(quote.id, signer)` on the same adapter instance. Each quote can be
consumed once, and caller mutations cannot change the stored quote.

Before signing, execution rechecks mint ownership/decimals, quote age and
slippage; verifies existing associated token accounts, ownership, balances,
frozen state and authorities; binds the encoded Jupiter V1 ExactIn instruction
arguments and account positions to the quote; resolves lookup tables from RPC;
and simulates the unsigned transaction. Simulation must succeed with the exact
input debit and at least the minimum output credit. Only the validated swap
instruction and a locally constructed compute budget instruction are included.

Initial execution scope is classic SPL tokens, existing ATAs, and pre-wrapped
SOL. Token-2022, automatic wrapping/unwrapping, account creation, token-ledger
routes, additional transfers/tips and instruction variants other than `route`
and `shared_accounts_route` are rejected. The instruction decoder pins the
Jupiter V1 Swap enum variants 0–38; newer variants require explicit support. API-provided compute fees are not
used. Unsupported routes may still be previewed, but cannot be executed.

A returned route is `quoted`, and an accepted/ambiguous submission is `pending`.
Only a confirmed/finalized signature **plus confirmed transaction metadata and
matching wallet balance changes** yields `confirmed`. On-chain failures or
balance mismatches yield `failed`. RPC unavailability remains `pending`.
The adapter retains the locally derived signature even if submission times out;
never automatically retry that trade with a new quote. An execution caller must
persist the returned signature, request and minimum output, then poll
`reconcile(signature, request, minimumOutputAtomic)` (also after restart) until
resolved. This change does not enable automatic copy trading or a Telegram
execution button, and does not add a persistent execution worker.

Run the deterministic offline safety tests with:

```bash
npm test -- --runInBand --coverage=false src/tests/jupiterVenue.test.ts
npm run build
```

`src/tests/fixtures/jupiter-route.json` contains representative quote/route fields;
the tests supply synthetic instruction bytes and mocked on-chain accounts. It is
not a transaction fixture for broadcasting. Existing `getTokenDetails` tests
remain live-RPC integration tests.

Protocol references: [Jupiter V2 build](https://developers.jup.ag/docs/swap/build)
and [Jupiter instruction IDL](https://github.com/jup-ag/jupiter-cpi/blob/main/idl.json).
