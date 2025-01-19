import { Connection, PublicKey } from '@solana/web3.js';
import { TradeService } from '../services/tradeService';
import { config } from '../config/config';
import { writeFileSync } from 'fs';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TradeService Tests', () => {
  let tradeService: TradeService;
  let connection: Connection;

  const platforms = {
    RAYDIUM: {
      tnx: '3oALozQrjbgZsTvqqbTrKLCJ6hbieghu82HNP3ZwpvxVjPdSmjTmRnyR6ZxiBsdXU2M1poVSphp73pLtT3fAfjG1',
      address: 'FukudCCa2hKbQxFAU3ZuwY3fAiNaLpkTWTBepGdY9hhz',
    },
    METEORA: {
      tnx: 'RU6ppjdrNEp4qyFwaMPrZbjhX5vXqBRx32QHFX2YTGZHYdV3HTxykBtXy77FkFgLw1wVgMkksC9LpNtRC4b2ojk',
      address: 'EPqzusVXU4B12m3kRtXYd1r4Cs1KKJiUqSyD5Uz8BQwM',
    },
    ORCA: {
      tnx: '5PUGVQyAvhVzA7L9qUVN5DEjXtET7h3MWrNDsUu2izXhcJbJJLHq8jRVTtxYaWpxaPTSjEc6v4s9tpaQnNL25K1k',
      address: '62QX8HJrt2ESZgPZaogHg34YfuFbWBKoot1C9qdFzsoM',
    },
    DEXLAB: {
      tnx: 'p8vkHeshnugTJRxgMKP9jEmrDxeQhXcp9hQKUy2BFhCJUhTy85SEF1xohqZqyPQdpvpSA314e3WWhjHw7SpoSYy',
      address: 'DuGv6ZscCJ5a7Y7r1zdXaWVKXxEpsELo2CzUcrrpyJDd',
    },
    PUMPFUN: {
      tnx: 'JgaH2xUSd4ZMzdAVsWFkKnDGv5QZ9LzAsB76cvm3xPGsf2m2pX9fhkKYvKom37KsM4awJpCn25XPnPMBgK1ioUH',
      address: '8Guks2VzUi8zWqA92RamP8ps5tHFJg7vBV65MPmrt7yy',
    },
    // FLUXBEAM: {
    //   tnx: '4nmpzfGpfWTrsoAQ7SjLmykrmx1e3sKW9nZFZ8TjvXmAPaLDCJ82bhRd9GhGrQweXgsMrydhw1UGXv9pJYP5YYaW',
    //   address: 'DuGv6ZscCJ5a7Y7r1zdXaWVKXxEpsELo2CzUcrrpyJDd',
    // },
  };

  beforeEach(() => {
    tradeService = new TradeService(config);
    connection = new Connection(config.SOLANA_RPC_URL);
  });

  const fetchAndTestTradeInfo = async (platformKey: keyof typeof platforms) => {
    const { tnx, address } = platforms[platformKey];
    const response = await connection.getParsedTransaction(tnx, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    expect(response).not.toBeNull();

    if (response) {
      const tokenInfo = await tradeService.parseTradeInfo(
        response,
        new PublicKey(address),
      );
      console.log(tokenInfo);

      expect(tokenInfo).not.toBeNull();
    }
  };

  it('should fetch trade info for all platforms', async () => {
    for (const platformKey of Object.keys(platforms) as Array<
      keyof typeof platforms
    >) {
      await fetchAndTestTradeInfo(platformKey);
      await sleep(5000);
    }
  });

  // TODO: PUMP FUN & FLUXBEAM PARSING
  it('should fetch trade info for pump.fun platform', async () => {
    await fetchAndTestTradeInfo('PUMPFUN');
  });
});
