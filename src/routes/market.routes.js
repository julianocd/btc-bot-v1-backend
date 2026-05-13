import { Router } from 'express';
import { env } from '../config/env.js';
import { binanceRest } from '../services/binance-rest.service.js';
import { buildPlaceholderSignal } from '../services/signal-engine.service.js';
import { sendTelegramMessage } from '../services/telegram.service.js';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/snapshot', async (_req, res) => {
  try {
    const [serverTime, ticker] = await Promise.all([
      binanceRest.time(),
      binanceRest.ticker24h(env.binanceSymbol)
    ]);

    const signal = await buildPlaceholderSignal(ticker.lastPrice);
    res.json({ serverTime, ticker, signal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alerts', async (_req, res) => {
  try {
    const filePath = path.resolve(__dirname, '../../alert-state.json');
    const content = await readFile(filePath, 'utf8');
    const data = JSON.parse(content);

    res.json({
      ok: true,
      alert: data
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Erro ao carregar alerta',
      error: error.message
    });
  }
});

router.post('/test-telegram', async (_req, res) => {
  try {
    const message = `🔔 Teste de alerta BTC Bot

📊 Status: Funcionando
⏰ Timestamp: ${new Date().toISOString()}
💰 Símbolo: ${env.binanceSymbol}

Teste OK - Bot pronto para produção.`;

    const result = await sendTelegramMessage(message);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/alert-signal', async (_req, res) => {
  try {
    const [serverTime, ticker] = await Promise.all([
      binanceRest.time(),
      binanceRest.ticker24h(env.binanceSymbol)
    ]);

    const signal = await buildPlaceholderSignal(ticker.lastPrice);
    const minConfidence = Number(env.alertMinConfidence ?? 60);

    if (signal.confidence < minConfidence) {
      return res.json({
        ok: true,
        sent: false,
        reason: `Sinal abaixo da confiança mínima (${signal.confidence} < ${minConfidence})`,
        serverTime,
        ticker,
        signal
      });
    }

    const ALERT_STATE_FILE = './alert-state.json';

    try {
      const data = await readFile(ALERT_STATE_FILE, 'utf8');
      const lastState = JSON.parse(data);

      const changed =
        lastState.bias !== signal.bias ||
        Math.abs(lastState.confidence - signal.confidence) >= 5;

      if (!changed) {
        console.log('🚫 Sinal duplicado - Bias igual, conf similar');
        return res.json({
          ok: true,
          sent: false,
          reason: 'Sinal duplicado, pulou alerta',
          serverTime,
          ticker,
          signal
        });
      }

      await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
      console.log('✅ Estado atualizado:', signal.bias, signal.confidence);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('📝 Primeira execução, criando estado');
        await writeFile(ALERT_STATE_FILE, JSON.stringify(signal, null, 2));
      } else {
        console.error('❌ Erro estado:', error.message);
      }
    }

    const rsi1h = signal.indicators?.['1h']?.rsi14 ?? 50;
    const trend4h = signal.indicators?.['4h']?.trend ?? 'NEUTRAL';
    const trend1h = signal.indicators?.['1h']?.trend ?? 'NEUTRAL';
    const macd1h = signal.indicators?.['1h']?.macdState ?? 'NEUTRAL';
    const volume1h = signal.indicators?.['1h']?.volumeState ?? 'WEAK';

    const alignedBullish = trend4h === 'BULLISH' && trend1h === 'BULLISH';
    const alignedBearish = trend4h === 'BEARISH' && trend1h === 'BEARISH';

    let tradeAction;
    if (signal.confidence < 70) {
      tradeAction = 'NÃO OPERE';
    } else if (
      signal.bias === 'BULLISH' &&
      signal.strength === 'HIGH' &&
      alignedBullish &&
      macd1h === 'BULLISH' &&
      volume1h === 'STRONG' &&
      rsi1h <= 70
    ) {
      tradeAction = '🟢 COMPRE AGORA';
    } else if (
      signal.bias === 'BULLISH' &&
      signal.confidence >= 70 &&
      macd1h === 'BULLISH' &&
      volume1h === 'STRONG' &&
      rsi1h > 70
    ) {
      tradeAction = '🟡 ESPERE PULLBACK';
    } else if (
      signal.bias === 'BEARISH' &&
      signal.strength === 'HIGH' &&
      alignedBearish &&
      macd1h === 'BEARISH' &&
      volume1h === 'STRONG' &&
      rsi1h >= 30
    ) {
      tradeAction = '🔴 VENDA AGORA';
    } else if (
      trend4h !== trend1h ||
      signal.bias === 'WATCHLIST_BUY' ||
      signal.bias === 'WATCHLIST_SELL'
    ) {
      tradeAction = '⏳ ESPERE CONFIRMAÇÃO';
    } else {
      tradeAction = '⚠️  ESPERE TENDÊNCIA';
    }

    const message = `🚨 ALERTA DE SINAL BTC BOT

🔥 ${tradeAction}

📊 Símbolo: ${signal.symbol}
📈 Bias: ${signal.bias}
🎯 Confiança: ${signal.confidence}%
💪 Força: ${signal.strength}

💰 Entry: ${signal.entry}
🛑 Stop Loss: ${signal.stopLoss}
✅ Take Profit: ${signal.takeProfit}
⚖️ R/R: ${signal.riskReward}

🕒 4h: ${signal.indicators?.['4h']?.trend ?? 'N/A'} | 1h: ${signal.indicators?.['1h']?.trend ?? 'N/A'}
📝 ${signal.note}

⏰ Timestamp: ${new Date().toISOString()}`;

    const telegramResult = await sendTelegramMessage(message);

    return res.json({
      ok: true,
      sent: true,
      minConfidence,
      tradeAction,
      serverTime,
      ticker,
      signal,
      telegramResult
    });
  } catch (error) {
    console.error('❌ ERRO alert-signal:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;