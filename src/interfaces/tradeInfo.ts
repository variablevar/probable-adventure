import { TokenInfo } from './tokenInfo';

export interface TradeInfo {
  targetedWallet: string;
  type?: 'buy' | 'sell';
  tokenA?: TokenInfo | string;
  tokenB?: TokenInfo | string;
  amount?: number;
  price?: number;
  timestamp?: number;
  amountIn?: number;
  amountOut?: number;
  slippage?: number;
  txHash?: string;
}
