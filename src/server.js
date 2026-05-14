import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { readFile, writeFile } from 'fs/promises';
import { binanceRest } from './services/binance-rest.service.js';
import { buildPlaceholderSignal } from './services/signal-engine.service.js';
import { sendTelegramMessage } from './services/telegram.service.js';

const ALERT_STATE_FILE = './alert-state.json';

async function runSignalJob() {
  try {
    logger.info('[CRON] Rodando job de sinal: ' + new Date().toISOString());

    const ticker = await binanceRest.ticker24h(env.binanceSymbol);
    const signal = await buildPlaceholderSignal(ticker.lastPrice);
    const minConfidence = Number(env.alertMinConfidence ?? 60);

    if (signal.confidence < minConfidence) {
      logger.info(`[CRON] Confiança baixa (${signal.confidence}), pulando alerta`);
      await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
      return;
    }

    try {
      const data = await readFile(ALERT_STATE_FILE, 'utf8');
      const lastState = JSON.parse(data);
      const changed =
        lastState.bias !== signal.bias ||
        Math.abs(lastState.confidence - signal.confidence) >= 5;

      if (!changed) {
        logger.info('[CRON] Sinal igual ao anterior, atualizando arquivo sem Telegram');
        await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
        return;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') logger.error('[CRON] Erro ao ler estado: ' + e.message);
    }

    await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
    logger.info(`[CRON] Estado atualizado: ${signal.bias} | conf: ${signal.confidence}`);

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
    logger.error('[CRON] Erro no job: ' + error.message);
  }
}

// Roda imediatamente ao iniciar
runSignalJob();

// Repete a cada 5 minutos
setInterval(runSignalJob, 5 * 60 * 1000);

app.listen(env.port, () => {
  logger.info(`Server running on http://localhost:${env.port}`);
});