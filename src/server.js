import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { readFile, writeFile } from 'fs/promises';
import { binanceRest } from './services/binance-rest.service.js';
import { buildPlaceholderSignal } from './services/signal-engine.service.js';
import { sendTelegramMessage } from './services/telegram.service.js';

const ALERT_STATE_FILE = './alert-state.json';
const INTERVAL_MS = 15 * 60 * 1000;

const jobState = {
  startedAt: new Date().toISOString(),
  lastRunAt: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  lastSignalBias: null,
  lastSignalConfidence: null,
  lastDataSource: null,
  runs: 0,
  successes: 0,
  failures: 0
};

async function runSignalJob() {
  jobState.lastRunAt = new Date().toISOString();
  jobState.runs += 1;

  try {
    logger.info(`[CRON] Rodando job de sinal: ${jobState.lastRunAt}`);

    const ticker = await binanceRest.ticker24h(env.binanceSymbol);
    const signal = await buildPlaceholderSignal(ticker.lastPrice);
    const minConfidence = Number(env.alertMinConfidence ?? 60);

    const enrichedSignal = {
      ...signal,
      updatedAt: new Date().toISOString(),
      dataSource: ticker?.fallback || 'binance'
    };

    jobState.lastSignalBias = enrichedSignal.bias;
    jobState.lastSignalConfidence = enrichedSignal.confidence;
    jobState.lastDataSource = enrichedSignal.dataSource;

    let lastState = null;

    try {
      const lastContent = await readFile(ALERT_STATE_FILE, 'utf8');
      lastState = JSON.parse(lastContent);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error({ error: error.message }, '[CRON] Erro ao ler estado anterior');
      }
    }

    const changed =
      !lastState ||
      lastState.bias !== enrichedSignal.bias ||
      Math.abs((lastState.confidence ?? 0) - (enrichedSignal.confidence ?? 0)) >= 5 ||
      Number(lastState.entry ?? 0) !== Number(enrichedSignal.entry ?? 0) ||
      Number(lastState.stopLoss ?? 0) !== Number(enrichedSignal.stopLoss ?? 0) ||
      Number(lastState.takeProfit ?? 0) !== Number(enrichedSignal.takeProfit ?? 0) ||
      lastState.dataSource !== enrichedSignal.dataSource;

    await writeFile(ALERT_STATE_FILE, JSON.stringify(enrichedSignal, null, 2));
    logger.info(
      `[CRON] Estado atualizado: ${enrichedSignal.bias} | conf: ${enrichedSignal.confidence} | source: ${enrichedSignal.dataSource}`
    );

    jobState.lastSuccessAt = new Date().toISOString();
    jobState.lastErrorAt = null;
    jobState.lastErrorMessage = null;
    jobState.successes += 1;

    if (!changed) {
      logger.info('[CRON] Sinal igual ao anterior, arquivo atualizado sem Telegram');
      return;
    }

    if (enrichedSignal.confidence < minConfidence) {
      logger.info(
        `[CRON] Confiança baixa (${enrichedSignal.confidence}), arquivo atualizado sem enviar Telegram`
      );
      return;
    }

    const message = `🤖 SINAL AUTOMÁTICO BTC BOT

📊 Símbolo: ${enrichedSignal.symbol}
📈 Bias: ${enrichedSignal.bias}
🎯 Confiança: ${enrichedSignal.confidence}%
💪 Força: ${enrichedSignal.strength}

💰 Entry: ${enrichedSignal.entry}
🛑 Stop: ${enrichedSignal.stopLoss}
✅ TP: ${enrichedSignal.takeProfit}
⚖️ R/R: ${enrichedSignal.riskReward}

🛰️ Fonte: ${enrichedSignal.dataSource}
🕒 Atualizado em: ${enrichedSignal.updatedAt}`;

    await sendTelegramMessage(message);
    logger.info('[CRON] Telegram enviado');
  } catch (error) {
    jobState.lastErrorAt = new Date().toISOString();
    jobState.lastErrorMessage = error.message;
    jobState.failures += 1;
    logger.error({ error: error.message }, '[CRON] Erro no job');
  }
}

app.get('/health', async (_req, res) => {
  try {
    let alertState = null;

    try {
      const content = await readFile(ALERT_STATE_FILE, 'utf8');
      alertState = JSON.parse(content);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error({ error: error.message }, '[HEALTH] Erro ao ler alert-state.json');
      }
    }

    res.json({
      ok: true,
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'btc-bot-backend',
      version: '1.0.0',
      job: {
        intervalMs: INTERVAL_MS,
        intervalMinutes: INTERVAL_MS / 60000,
        ...jobState
      },
      alertState: alertState
        ? {
            updatedAt: alertState.updatedAt ?? null,
            dataSource: alertState.dataSource ?? null,
            bias: alertState.bias ?? null,
            confidence: alertState.confidence ?? null
          }
        : null
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      status: 'unhealthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.listen(env.port, () => {
  logger.info(`Server running on http://localhost:${env.port}`);

  runSignalJob().catch((error) => {
    jobState.lastErrorAt = new Date().toISOString();
    jobState.lastErrorMessage = error.message;
    jobState.failures += 1;
    logger.error({ error: error.message }, '[CRON] Erro na execução inicial');
  });

  setInterval(() => {
    runSignalJob().catch((error) => {
      jobState.lastErrorAt = new Date().toISOString();
      jobState.lastErrorMessage = error.message;
      jobState.failures += 1;
      logger.error({ error: error.message }, '[CRON] Erro na execução agendada');
    });
  }, INTERVAL_MS);
});