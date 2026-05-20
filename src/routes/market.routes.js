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

function getRecommendationFromBias(bias) {
  const normalized = String(bias || '').toUpperCase();

  if (
    normalized.includes('STRONG_BUY') ||
    normalized === 'BUY' ||
    normalized.includes('WATCHLIST_BUY')
  ) {
    return {
      recommendationType: 'BUY_NOW',
      recommendationLabel: 'Comprar agora'
    };
  }

  if (
    normalized.includes('STRONG_SELL') ||
    normalized === 'SELL' ||
    normalized.includes('WATCHLIST_SELL')
  ) {
    return {
      recommendationType: 'SELL_NOW',
      recommendationLabel: 'Vender agora'
    };
  }

  return {
    recommendationType: 'WAIT_CONFIRMATION',
    recommendationLabel: 'Espere confirmação'
  };
}

function getTradeAction(signal) {
  const rsi1h = signal.indicators?.['1h']?.rsi14 ?? 50;
  const trend4h = signal.indicators?.['4h']?.trend ?? 'NEUTRAL';
  const trend1h = signal.indicators?.['1h']?.trend ?? 'NEUTRAL';
  const macd1h = signal.indicators?.['1h']?.macdState ?? 'NEUTRAL';
  const volume1h = signal.indicators?.['1h']?.volumeState ?? 'WEAK';

  const alignedBullish = trend4h === 'BULLISH' && trend1h === 'BULLISH';
  const alignedBearish = trend4h === 'BEARISH' && trend1h === 'BEARISH';

  if ((signal.confidence ?? 0) < 70) {
    return {
      tradeAction: 'NÃO OPERE',
      recommendationType: 'WAIT_CONFIRMATION',
      recommendationLabel: 'Espere confirmação'
    };
  }

  if (
    signal.bias === 'BULLISH' &&
    signal.strength === 'HIGH' &&
    alignedBullish &&
    macd1h === 'BULLISH' &&
    volume1h === 'STRONG' &&
    rsi1h <= 70
  ) {
    return {
      tradeAction: '🟢 COMPRE AGORA',
      recommendationType: 'BUY_NOW',
      recommendationLabel: 'Comprar agora'
    };
  }

  if (
    signal.bias === 'BULLISH' &&
    (signal.confidence ?? 0) >= 70 &&
    macd1h === 'BULLISH' &&
    volume1h === 'STRONG' &&
    rsi1h > 70
  ) {
    return {
      tradeAction: '🟡 ESPERE PULLBACK',
      recommendationType: 'WAIT_CONFIRMATION',
      recommendationLabel: 'Espere confirmação'
    };
  }

  if (
    signal.bias === 'BEARISH' &&
    signal.strength === 'HIGH' &&
    alignedBearish &&
    macd1h === 'BEARISH' &&
    volume1h === 'STRONG' &&
    rsi1h >= 30
  ) {
    return {
      tradeAction: '🔴 VENDA AGORA',
      recommendationType: 'SELL_NOW',
      recommendationLabel: 'Vender agora'
    };
  }

  if (
    trend4h !== trend1h ||
    signal.bias === 'WATCHLIST_BUY' ||
    signal.bias === 'WATCHLIST_SELL'
  ) {
    return {
      tradeAction: '⏳ ESPERE CONFIRMAÇÃO',
      recommendationType: 'WAIT_CONFIRMATION',
      recommendationLabel: 'Espere confirmação'
    };
  }

  return {
    tradeAction: '⚠️ ESPERE TENDÊNCIA',
    recommendationType: 'WAIT_CONFIRMATION',
    recommendationLabel: 'Espere confirmação'
  };
}

router.get('/snapshot', async (_req, res) => {
  try {
    const [serverTime, ticker] = await Promise.all([
      binanceRest.time(),
      binanceRest.ticker24h(env.binanceSymbol)
    ]);

    const signal = await buildPlaceholderSignal(ticker.lastPrice);

    res.json({
      ok: true,
      meta: {
        serverTime,
        dataSource: ticker?.fallback || 'binance',
        generatedAt: new Date().toISOString()
      },
      ticker,
      signal
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

router.get('/alerts', async (_req, res) => {
  try {
    const filePath = path.resolve(__dirname, '../../alert-state.json');
    const content = await readFile(filePath, 'utf8');
    const data = JSON.parse(content);
    const recommendation = getTradeAction(data);

    let btcPriceUsd = null;

    try {
      const priceRes = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
      );
      const priceData = await priceRes.json();
      btcPriceUsd = priceData?.bitcoin?.usd ?? null;
    } catch (_priceError) {
      btcPriceUsd = null;
    }

    res.json({
      ok: true,
      updatedAt: data.updatedAt || data.generatedAt || null,
      dataSource: data.dataSource || 'unknown',
      btcPriceUsd,
      alert: {
        ...data,
        recommendationType: recommendation.recommendationType,
        recommendationLabel: recommendation.recommendationLabel,
        tradeAction: recommendation.tradeAction
      }
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

    res.json({
      ok: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
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

    const enrichedSignal = {
      ...signal,
      updatedAt: new Date().toISOString(),
      dataSource: ticker?.fallback || 'binance'
    };

    const ALERT_STATE_FILE = './alert-state.json';

    try {
      const data = await readFile(ALERT_STATE_FILE, 'utf8');
      const lastState = JSON.parse(data);

      const changed =
        lastState.bias !== enrichedSignal.bias ||
        Math.abs((lastState.confidence ?? 0) - (enrichedSignal.confidence ?? 0)) >= 5 ||
        Number(lastState.entry ?? 0) !== Number(enrichedSignal.entry ?? 0) ||
        Number(lastState.stopLoss ?? 0) !== Number(enrichedSignal.stopLoss ?? 0) ||
        Number(lastState.takeProfit ?? 0) !== Number(enrichedSignal.takeProfit ?? 0) ||
        lastState.dataSource !== enrichedSignal.dataSource;

      if (!changed) {
        await writeFile(ALERT_STATE_FILE, JSON.stringify(enrichedSignal, null, 2));

        return res.json({
          ok: true,
          sent: false,
          reason: 'Sinal duplicado, arquivo atualizado sem Telegram',
          updatedAt: enrichedSignal.updatedAt,
          dataSource: enrichedSignal.dataSource,
          serverTime,
          ticker,
          signal: enrichedSignal
        });
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('⌛ Erro ao ler estado:', error.message);
      }
    }

    await writeFile(ALERT_STATE_FILE, JSON.stringify(enrichedSignal, null, 2));

    if (enrichedSignal.confidence < minConfidence) {
      return res.json({
        ok: true,
        sent: false,
        reason: `Sinal abaixo da confiança mínima (${enrichedSignal.confidence} < ${minConfidence})`,
        updatedAt: enrichedSignal.updatedAt,
        dataSource: enrichedSignal.dataSource,
        serverTime,
        ticker,
        signal: enrichedSignal
      });
    }

    const recommendation = getTradeAction(enrichedSignal);

    const signalWithRecommendation = {
      ...enrichedSignal,
      recommendationType: recommendation.recommendationType,
      recommendationLabel: recommendation.recommendationLabel,
      tradeAction: recommendation.tradeAction
    };

    const message = `🚨 ALERTA DE SINAL BTC BOT

🔥 ${signalWithRecommendation.tradeAction}

📊 Símbolo: ${signalWithRecommendation.symbol}
📈 Bias: ${signalWithRecommendation.bias}
🎯 Confiança: ${signalWithRecommendation.confidence}%
💪 Força: ${signalWithRecommendation.strength}

💰 Entry: ${signalWithRecommendation.entry}
🛑 Stop Loss: ${signalWithRecommendation.stopLoss}
✅ Take Profit: ${signalWithRecommendation.takeProfit}
⚖️ R/R: ${signalWithRecommendation.riskReward}

🛰️ Fonte: ${signalWithRecommendation.dataSource}
🕒 Atualizado em: ${signalWithRecommendation.updatedAt}
📝 ${signalWithRecommendation.note}`;

    const telegramResult = await sendTelegramMessage(message);

    return res.json({
      ok: true,
      sent: true,
      updatedAt: signalWithRecommendation.updatedAt,
      dataSource: signalWithRecommendation.dataSource,
      minConfidence,
      serverTime,
      ticker,
      signal: signalWithRecommendation,
      telegramResult
    });
  } catch (error) {
    console.error('⌛ ERRO alert-signal:', error);
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

export default router;