import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: process.env.PORT || 8787,
  nodeEnv: process.env.NODE_ENV || 'development',
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:8080',
  userEmail: process.env.APP_USER_EMAIL || 'admin@example.com',
  userPasswordHash: process.env.APP_USER_PASSWORD_HASH || '',
  jwtSecret: process.env.JWT_SECRET || 'change-this-super-secret',
  cookieName: process.env.COOKIE_NAME || 'btcbot_session',
  binanceBaseUrl: process.env.BINANCE_BASE_URL || 'https://testnet.binance.vision',
  binanceApiKey: process.env.BINANCE_API_KEY || '',
  binanceApiSecret: process.env.BINANCE_API_SECRET || '',
  binanceSymbol: process.env.BINANCE_SYMBOL || 'BTCUSDT',
  riskPerTradeUsd: Number(process.env.RISK_PER_TRADE_USD || 1),
  maxDailyLossUsd: Number(process.env.MAX_DAILY_LOSS_USD || 3),
  minRr: Number(process.env.MIN_RR || 2),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
  alertMinConfidence: Number(process.env.ALERT_MIN_CONFIDENCE || 70)
};