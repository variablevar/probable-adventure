import { createHash } from 'crypto';
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  AccountLayout,
  getMint,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import fixture from './fixtures/jupiter-route.json';
import { JupiterRoute, JupiterVenue } from '../venues/jupiter';
import { QuoteRequest, atomicAmount } from '../venues/venue';

// RPC is injected; no websocket client is needed in these offline tests.
jest.mock(
  require.resolve('rpc-websockets', {
    paths: [require.resolve('@solana/web3.js')],
  }),
  () => ({ CommonClient: class {} }),
);
jest.mock('@solana/spl-token', () => ({
  ...jest.requireActual('@solana/spl-token'),
  getMint: jest.fn(),
  getAccount: jest.fn(),
}));
const signer = Keypair.fromSeed(new Uint8Array(32).fill(7));
const signature = bs58.encode(new Uint8Array(64).fill(9));
const request: QuoteRequest = {
  owner: signer.publicKey.toBase58(),
  inputMint: fixture.inputMint,
  outputMint: fixture.outputMint,
  amountAtomic: fixture.inAmount,
  inputDecimals: 9,
  slippageBps: 100,
};
let route: JupiterRoute;
let rpc: any;
let now: number;
let venue: JupiterVenue;
let source: PublicKey;
let destination: PublicKey;
const token = (mint: string, amount: bigint) => ({
  mint: new PublicKey(mint),
  owner: signer.publicKey,
  amount,
  isInitialized: true,
  isFrozen: false,
  delegate: null,
  closeAuthority: null,
});
function simulated(mint: string, amount: bigint) {
  const buffer = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(
    {
      mint: new PublicKey(mint),
      owner: signer.publicKey,
      amount,
      delegateOption: 0,
      delegate: PublicKey.default,
      state: 1,
      isNativeOption: 0,
      isNative: 0n,
      delegatedAmount: 0n,
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    buffer,
  );
  return {
    owner: TOKEN_PROGRAM_ID.toBase58(),
    data: [buffer.toString('base64'), 'base64'],
  };
}
beforeEach(async () => {
  jest.resetAllMocks();
  now = 100000;
  route = structuredClone(fixture);
  source = await getAssociatedTokenAddress(
    new PublicKey(request.inputMint),
    signer.publicKey,
  );
  destination = await getAssociatedTokenAddress(
    new PublicKey(request.outputMint),
    signer.publicKey,
  );
  const data = Buffer.alloc(35);
  createHash('sha256').update('global:route').digest().copy(data, 0, 0, 8);
  data.writeUInt32LE(1, 8); // synthetic one-step route; RPC execution is mocked
  data[12] = 38; // MeteoraDlmm
  data[13] = 100;
  data[15] = 1;
  data.writeBigUInt64LE(BigInt(request.amountAtomic), 16);
  data.writeBigUInt64LE(BigInt(route.outAmount), 24);
  data.writeUInt16LE(request.slippageBps, 32);
  route.swapInstruction.data = data.toString('base64');
  route.swapInstruction.accounts = [
    TOKEN_PROGRAM_ID,
    signer.publicKey,
    source,
    destination,
    new PublicKey(route.swapInstruction.programId),
    new PublicKey(request.outputMint),
  ].map((key, i) => ({
    pubkey: key.toBase58(),
    isSigner: i === 1,
    isWritable: i === 2 || i === 3,
  }));
  (getMint as jest.Mock).mockResolvedValue({
    isInitialized: true,
    decimals: 9,
  });
  (getAccount as jest.Mock).mockImplementation(
    async (_connection, address: PublicKey) =>
      address.equals(source)
        ? token(request.inputMint, 200000000n)
        : token(request.outputMint, 0n),
  );
  rpc = {
    getLatestBlockhash: jest.fn().mockResolvedValue({
      blockhash: PublicKey.default.toBase58(),
      lastValidBlockHeight: 100,
    }),
    getBlockHeight: jest.fn().mockResolvedValue(50),
    simulateTransaction: jest.fn().mockResolvedValue({
      value: {
        err: null,
        accounts: [
          simulated(request.inputMint, 100000000n),
          simulated(request.outputMint, 17057460n),
        ],
      },
    }),
    sendRawTransaction: jest
      .fn()
      .mockImplementation(async (bytes: Uint8Array) =>
        bs58.encode(VersionedTransaction.deserialize(bytes).signatures[0]),
      ),
    getSignatureStatuses: jest.fn().mockResolvedValue({ value: [null] }),
    getParsedTransaction: jest.fn(),
  };
  venue = new JupiterVenue(rpc as Connection, async () => route, {
    executionEnabled: true,
    now: () => now,
  });
});

test('quote mode is read-only and returned objects cannot alter stored routes', async () => {
  const readOnly = new JupiterVenue(rpc, async () => route);
  const quote = await readOnly.quote(request);
  expect(quote.status).toBe('quoted');
  await expect(readOnly.execute(quote.id, signer)).rejects.toThrow('Read-only');
  expect(getAccount).not.toHaveBeenCalled();
  expect(rpc.simulateTransaction).not.toHaveBeenCalled();
  expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
  const saved = await venue.quote(request);
  saved.request.amountAtomic = '1';
  expect((await venue.execute(saved.id, signer)).status).toBe('pending');
});

test.each(['0', '-1', '1.5', '1e9', '01', '18446744073709551616'])(
  'rejects unsafe amount %s',
  (amount) => {
    expect(() => atomicAmount(amount)).toThrow();
  },
);
test('preserves amounts above Number.MAX_SAFE_INTEGER', () => {
  expect(atomicAmount('9007199254740993')).toBe(9007199254740993n);
});
test.each([
  { inputMint: 'bad mint' },
  { outputMint: request.inputMint },
  { inputDecimals: 6 },
  { slippageBps: 101 },
  { slippageBps: -1 },
  { slippageBps: 0.5 },
])('rejects invalid request %j', async (override) => {
  await expect(venue.quote({ ...request, ...override })).rejects.toThrow();
});
test.each([
  { inputMint: request.outputMint },
  { inAmount: '1' },
  { swapMode: 'ExactOut' },
  { slippageBps: 99 },
  { otherAmountThreshold: '1' },
  { routePlan: [] },
])('rejects mismatched route %j', async (override) => {
  Object.assign(route, override);
  await expect(venue.quote(request)).rejects.toThrow();
});
test('expired quote cannot reach simulation or signing', async () => {
  const quote = await venue.quote(request);
  now += 15000;
  await expect(venue.execute(quote.id, signer)).rejects.toThrow('expired');
  expect(rpc.simulateTransaction).not.toHaveBeenCalled();
});
test('rechecks expiry after simulation', async () => {
  const quote = await venue.quote(request);
  rpc.getBlockHeight.mockImplementation(async () => {
    now += 15000;
    return 50;
  });
  await expect(venue.execute(quote.id, signer)).rejects.toThrow('expired');
  expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
});
test('rejects incorrect owner before simulation', async () => {
  const quote = await venue.quote(request);
  await expect(venue.execute(quote.id, Keypair.generate())).rejects.toThrow(
    'Signer',
  );
});
test.each(['frozen', 'mint', 'owner', 'balance', 'missing'])(
  'rejects invalid token account: %s',
  async (failure) => {
    const quote = await venue.quote(request);
    const account = token(request.inputMint, 200000000n);
    if (failure === 'frozen') account.isFrozen = true;
    if (failure === 'mint') account.mint = new PublicKey(request.outputMint);
    if (failure === 'owner') account.owner = Keypair.generate().publicKey;
    if (failure === 'balance') account.amount = 1n;
    if (failure === 'missing')
      (getAccount as jest.Mock).mockRejectedValue(new Error('missing'));
    else (getAccount as jest.Mock).mockResolvedValueOnce(account);
    await expect(venue.execute(quote.id, signer)).rejects.toThrow();
    expect(rpc.simulateTransaction).not.toHaveBeenCalled();
  },
);
test('rejects encoded slippage tampering even if JSON quote looks valid', async () => {
  const data = Buffer.from(route.swapInstruction.data, 'base64');
  data.writeUInt16LE(9999, 32);
  route.swapInstruction.data = data.toString('base64');
  const quote = await venue.quote(request);
  await expect(venue.execute(quote.id, signer)).rejects.toThrow('Encoded');
});
test('failed simulation never signs or submits', async () => {
  rpc.simulateTransaction.mockResolvedValue({
    value: { err: { InstructionError: [0, 'failed'] } },
  });
  const quote = await venue.quote(request);
  const sign = jest.spyOn(VersionedTransaction.prototype, 'sign');
  await expect(venue.execute(quote.id, signer)).rejects.toThrow(
    'simulation failed',
  );
  expect(sign).not.toHaveBeenCalled();
  expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
  sign.mockRestore();
});
test('simulation balance mismatch never submits', async () => {
  rpc.simulateTransaction.mockResolvedValue({
    value: {
      err: null,
      accounts: [
        simulated(request.inputMint, 100000000n),
        simulated(request.outputMint, 1n),
      ],
    },
  });
  const quote = await venue.quote(request);
  await expect(venue.execute(quote.id, signer)).rejects.toThrow(
    'Simulated amounts',
  );
  expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
});
test('send timeout retains signature and consumes quote', async () => {
  rpc.sendRawTransaction.mockRejectedValue(
    new Error('timeout after acceptance'),
  );
  const quote = await venue.quote(request);
  const result = await venue.execute(quote.id, signer);
  expect(result.status).toBe('pending');
  expect(bs58.decode(result.signature)).toHaveLength(64);
  await expect(venue.execute(quote.id, signer)).rejects.toThrow('consumed');
});
function confirmedTransaction(output = '17057460') {
  const balance = (mint: string, amount: string) => ({
    owner: request.owner,
    mint,
    uiTokenAmount: { amount },
  });
  return {
    transaction: {
      signatures: [signature],
      message: {
        instructions: [
          { programId: new PublicKey(fixture.swapInstruction.programId) },
        ],
        accountKeys: [{ pubkey: signer.publicKey, signer: true }],
      },
    },
    meta: {
      err: null,
      preTokenBalances: [
        balance(request.inputMint, '200000000'),
        balance(request.outputMint, '0'),
      ],
      postTokenBalances: [
        balance(request.inputMint, '100000000'),
        balance(request.outputMint, output),
      ],
    },
  };
}
test.each([null, { err: null, confirmationStatus: 'processed' }])(
  'unconfirmed signature stays pending',
  async (status) => {
    rpc.getSignatureStatuses.mockResolvedValue({ value: [status] });
    expect(
      (await venue.reconcile(signature, request, fixture.otherAmountThreshold))
        .status,
    ).toBe('pending');
  },
);
test('confirmed status without transaction metadata stays pending', async () => {
  rpc.getSignatureStatuses.mockResolvedValue({
    value: [{ err: null, confirmationStatus: 'confirmed' }],
  });
  rpc.getParsedTransaction.mockResolvedValue(null);
  expect(
    (await venue.reconcile(signature, request, fixture.otherAmountThreshold))
      .status,
  ).toBe('pending');
});
test('on-chain errors report failure', async () => {
  rpc.getSignatureStatuses.mockResolvedValue({
    value: [{ err: { InstructionError: [] }, confirmationStatus: 'confirmed' }],
  });
  expect(
    (await venue.reconcile(signature, request, fixture.otherAmountThreshold))
      .status,
  ).toBe('failed');
});
test('confirmed transaction must reconcile actual balances', async () => {
  rpc.getSignatureStatuses.mockResolvedValue({
    value: [{ err: null, confirmationStatus: 'confirmed' }],
  });
  rpc.getParsedTransaction.mockResolvedValue(confirmedTransaction());
  expect(
    await venue.reconcile(signature, request, fixture.otherAmountThreshold),
  ).toEqual({
    status: 'confirmed',
    signature,
    inputAmountAtomic: request.amountAtomic,
    outputAmountAtomic: fixture.outAmount,
  });
  rpc.getParsedTransaction.mockResolvedValue(confirmedTransaction('1'));
  expect(
    (await venue.reconcile(signature, request, fixture.otherAmountThreshold))
      .status,
  ).toBe('failed');
});

test('slow route fetch expires before storage', async () => {
  const slow = new JupiterVenue(
    rpc,
    async () => {
      now += 15000;
      return route;
    },
    { now: () => now },
  );
  await expect(slow.quote(request)).rejects.toThrow('expired during fetch');
});
test('unknown program and extra transfers are rejected before signing', async () => {
  route.swapInstruction.programId = PublicKey.default.toBase58();
  let quote = await venue.quote(request);
  await expect(venue.execute(quote.id, signer)).rejects.toThrow(
    'Invalid Jupiter',
  );
  route.swapInstruction.programId = fixture.swapInstruction.programId;
  route.otherInstructions = [route.swapInstruction];
  quote = await venue.quote(request);
  await expect(venue.execute(quote.id, signer)).rejects.toThrow(
    'unsupported setup',
  );
  expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
});
test('expired blockhash is rejected before signing', async () => {
  rpc.getBlockHeight.mockResolvedValue(101);
  const quote = await venue.quote(request);
  await expect(venue.execute(quote.id, signer)).rejects.toThrow(
    'blockhash expired',
  );
  expect(rpc.sendRawTransaction).not.toHaveBeenCalled();
});
test('confirmed unrelated transaction cannot be reported as a swap', async () => {
  rpc.getSignatureStatuses.mockResolvedValue({
    value: [{ err: null, confirmationStatus: 'confirmed' }],
  });
  const tx = confirmedTransaction();
  tx.transaction.message.instructions = [];
  rpc.getParsedTransaction.mockResolvedValue(tx);
  expect(
    (await venue.reconcile(signature, request, fixture.otherAmountThreshold))
      .status,
  ).toBe('failed');
});
test('RPC failure during reconciliation remains pending', async () => {
  rpc.getSignatureStatuses.mockRejectedValue(new Error('RPC unavailable'));
  expect(
    (await venue.reconcile(signature, request, fixture.otherAmountThreshold))
      .status,
  ).toBe('pending');
});

test('appended safe-looking arguments cannot hide unsafe on-chain slippage', async () => {
  const original = Buffer.from(route.swapInstruction.data, 'base64');
  const fakeArguments = Buffer.from(original.subarray(-19));
  original.writeUInt16LE(9999, 32);
  route.swapInstruction.data = Buffer.concat([
    original,
    fakeArguments,
  ]).toString('base64');
  const quote = await venue.quote(request);
  await expect(venue.execute(quote.id, signer)).rejects.toThrow(
    'instruction length',
  );
  expect(rpc.simulateTransaction).not.toHaveBeenCalled();
});
