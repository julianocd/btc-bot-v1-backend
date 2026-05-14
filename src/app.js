import { readFile, writeFile } from 'fs/promises';
import { binanceRest } from './services/binance-rest.service.js';
import { buildPlaceholderSignal } from './services/signal-engine.service.js';
import { sendTelegramMessage } from './services/telegram.service.js';
import { env } from './config/env.js';

async function runSignalJob() {
  try {
    console.log(`[CRON] Rodando job de sinal: ${new Date().toISOString()}`);

    const ticker = await binanceRest.ticker24h(env.binanceSymbol);
    const signal = await buildPlaceholderSignal(ticker.lastPrice);
    const minConfidence = Number(env.alertMinConfidence ?? 60);

    if (signal.confidence < minConfidence) {
      console.log(`[CRON] Confiança baixa (${signal.confidence}), pulando alerta`);
      return;
    }

    const ALERT_STATE_FILE = './alert-state.json';

    try {
      const data = await readFile(ALERT_STATE_FILE, 'utf8');
      const lastState = JSON.parse(data);
      const changed =
        lastState.bias !== signal.bias ||
        Math.abs(lastState.confidence - signal.confidence) >= 5;

      if (!changed) {
        console.log('[CRON] Sinal igual ao anterior, atualizando arquivo sem Telegram');
        await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
        return;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('[CRON] Erro ao ler estado:', e.message);
    }

    await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
    console.log(`[CRON] Estado atualizado: ${signal.bias} | conf: ${signal.confidence}`);

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
    console.log('[CRON] Telegram enviado');
  } catch (error) {
    console.error('[CRON] Erro no job:', error.message);
  }
}

// Intervalo em milissegundos — 15 minutos
const INTERVAL_MS = 15 * 60 * 1000;

// Roda imediatamente ao iniciar o servidor
runSignalJob();

// Depois repete a cada 15 minutos
setInterval(runSignalJob, INTERVAL_MS);