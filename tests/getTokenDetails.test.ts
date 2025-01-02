import { Connection, PublicKey } from '@solana/web3.js';
import { TradeService } from '../src/services/tradeService';
import { config } from '../src/config/config';

describe('TradeService Tests', () => {
  let tokenService: TradeService;
  let connection: Connection;
  
  beforeEach(() => {
    tokenService = new TradeService(config);
    connection = new Connection(config.SOLANA_RPC_URL);
  });
  
  it('Sample test', () => {
    expect(true).toBe(true);  // Simple test to ensure the setup is working
  });

  it('should fetch token info successfully', async () => {
    const tnxAddress = '3niWw8YHerMhhK25gV3DifMvfZmcjUz2H6sfFjh8r1ViUA3mnugVHmf9zf9R47YvqSspnBzEaxwtNoK9DNXmS4JV';

    const response = await connection.getTransaction(tnxAddress, {commitment: 'confirmed', maxSupportedTransactionVersion: 0});
    
    // Ensure response exists before processing
    expect(response).not.toBeNull();

    if (response) {
      const tokenInfo = await tokenService.parseTradeInfo(response);
      expect(tokenInfo).not.toBeNull();
    }
  });
});
