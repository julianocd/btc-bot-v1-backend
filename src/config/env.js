import dotenv from 'dotenv';
dotenv.config();

export const env = {
  // Servidor
  port: process.env.PORT || 8787,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Binance
  binanceBaseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
  binanceSymbol: process.env.BINANCE_SYMBOL || 'BTCUSDT',
  binanceApiKey: process.env.BINANCE_API_KEY || '',
  binanceApiSecret: process.env.BINANCE_API_SECRET || '',

  // Telegram
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,

  // Configurações
  minRr: Number(process.env.MIN_RR) || 2,
  alertMinConfidence: Number(process.env.ALERT_MIN_CONFIDENCE) || 70,
  riskPerTradeUsd: Number(process.env.RISK_PER_TRADE_USD) || 1,
  maxDailyLossUsd: Number(process.env.MAX_DAILY_LOSS_USD) || 3,
};