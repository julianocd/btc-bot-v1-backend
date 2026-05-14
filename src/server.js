import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { readFile, writeFile } from 'fs/promises';
import { binanceRest } from './services/binance-rest.service.js';
import { buildPlaceholderSignal } from './services/signal-engine.service.js';
import { sendTelegramMessage } from './services/telegram.service.js';

const ALERT_STATE_FILE = './alert-state.json';
const INTERVAL_MS = 5 * 60 * 1000;

async function runSignalJob() {
  try {
    logger.info(`[CRON] Rodando job de sinal: ${new Date().toISOString()}`);

    const ticker = await binanceRest.ticker24h(env.binanceSymbol);
    const signal = await buildPlaceholderSignal(ticker.lastPrice);
    const minConfidence = Number(env.alertMinConfidence ?? 60);

    try {
      const lastContent = await readFile(ALERT_STATE_FILE, 'utf8');
      const lastState = JSON.parse(lastContent);

      const changed =
        lastState.bias !== signal.bias ||
        Math.abs((lastState.confidence ?? 0) - (signal.confidence ?? 0)) >= 5 ||
        Number(lastState.entry ?? 0) !== Number(signal.entry ?? 0) ||
        Number(lastState.stopLoss ?? 0) !== Number(signal.stopLoss ?? 0) ||
        Number(lastState.takeProfit ?? 0) !== Number(signal.takeProfit ?? 0);

      if (!changed) {
        logger.info('[CRON] Sinal igual ao anterior, mantendo estado atualizado sem Telegram');
        await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
        return;
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error({ error: error.message }, '[CRON] Erro ao ler estado anterior');
      }
    }

    await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
    logger.info(`[CRON] Estado atualizado: ${signal.bias} | conf: ${signal.confidence}`);

    if (signal.confidence < minConfidence) {
      logger.info(`[CRON] Confiança baixa (${signal.confidence}), arquivo atualizado sem enviar Telegram`);
      return;
    }

    const message = `🤖 SINAL AUTOMÁTICO BTC BOT

📊 Símbolo: ${signal.symbol}
📈 Bias: ${signal.bias}
🎯 Confiança: ${signal.confidence}%
💪 Força: ${signal.strength}

💰 Entry: ${signal.entry}
🛑 Stop: ${signal.stopLoss}
✅ TP: ${signal.takeProfit}
⚖️ R/R: ${signal.riskReward}

🕒 ${new Date().toISOString()}`;

    await sendTelegramMessage(message);
    logger.info('[CRON] Telegram enviado');
  } catch (error) {
    logger.error({ error: error.message }, '[CRON] Erro no job');
  }
}

app.listen(env.port, () => {
  logger.info(`Server running on http://localhost:${env.port}`);

  runSignalJob().catch((error) => {
    logger.error({ error: error.message }, '[CRON] Erro na execução inicial');
  });

  setInterval(() => {
    runSignalJob().catch((error) => {
      logger.error({ error: error.message }, '[CRON] Erro na execução agendada');
    });
  }, INTERVAL_MS);
});