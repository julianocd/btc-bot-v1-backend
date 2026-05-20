import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: process.env.PORT || 8787,
  nodeEnv: process.env.NODE_ENV || 'development',
  binanceSymbol: process.env.BINANCE_SYMBOL || 'BTCUSDT',
  binanceBaseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
  binanceApiKey: process.env.BINANCE_API_KEY || '',
  binanceApiSecret: process.env.BINANCE_API_SECRET || '',
  minRr: process.env.MIN_RR || 2,
  alertMinConfidence: process.env.ALERT_MIN_CONFIDENCE || 70
};