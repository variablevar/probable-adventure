import { Connection, PublicKey } from '@solana/web3.js';
import { TradeService } from '../services/tradeService';
import { config } from '../config/config';

describe('TradeService Tests', () => {
  let tokenService: TradeService;
  let connection: Connection;

  beforeEach(() => {
    tokenService = new TradeService(config);
    connection = new Connection(config.SOLANA_RPC_URL);
  });

  it('Sample test', () => {
    expect(true).toBe(true); // Simple test to ensure the setup is working
  });

  it('should fetch token info successfully', async () => {
    const tnxAddress =
      '3oALozQrjbgZsTvqqbTrKLCJ6hbieghu82HNP3ZwpvxVjPdSmjTmRnyR6ZxiBsdXU2M1poVSphp73pLtT3fAfjG1';
    const targetedWallet = new PublicKey(
      'FukudCCa2hKbQxFAU3ZuwY3fAiNaLpkTWTBepGdY9hhz',
    );
    const response = await connection.getTransaction(tnxAddress, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    // Ensure response exists before processing
    expect(response).not.toBeNull();

    if (response) {
      const tokenInfo = await tokenService.parseTradeInfo(
        response,
        targetedWallet,
      );
      console.log(tokenInfo);

      expect(tokenInfo).not.toBeNull();
    }
  });
});
