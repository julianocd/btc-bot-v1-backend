import { env } from '../config/env.js';
import { binanceRest } from './binance-rest.service.js';

function toCloses(klines) {
  return klines.map((k) => Number(k[4]));
}

function toVolumes(klines) {
  return klines.map((k) => Number(k[5]));
}

function toHighs(klines) {
  return klines.map((k) => Number(k[2]));
}

function toLows(klines) {
  return klines.map((k) => Number(k[3]));
}

function average(values) {
  if (!values || values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ema(values, period) {
  if (!values || values.length < period) return null;

  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  for (let i = period; i < values.length; i += 1) {
    current = ((values[i] - current) * multiplier) + current;
  }

  return current;
}

function emaSeries(values, period) {
  if (!values || values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const result = [];
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  result.push(current);

  for (let i = period; i < values.length; i += 1) {
    current = ((values[i] - current) * multiplier) + current;
    result.push(current);
  }

  return result;
}

function macd(values, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (!values || values.length < slowPeriod) {
    return {
      macdLine: null,
      signalLine: null,
      histogram: null,
      state: 'NEUTRAL'
    };
  }

  const fast = emaSeries(values, fastPeriod);
  const slow = emaSeries(values, slowPeriod);

  if (!fast.length || !slow.length) {
    return {
      macdLine: null,
      signalLine: null,
      histogram: null,
      state: 'NEUTRAL'
    };
  }

  const offset = slowPeriod - fastPeriod;
  const alignedFast = fast.slice(offset);
  const macdSeries = slow.map((slowValue, index) => alignedFast[index] - slowValue);

  if (!macdSeries.length) {
    return {
      macdLine: null,
      signalLine: null,
      histogram: null,
      state: 'NEUTRAL'
    };
  }

  let signalLine = null;

  if (macdSeries.length >= signalPeriod) {
    const signalSeries = emaSeries(macdSeries, signalPeriod);
    signalLine = signalSeries.at(-1) ?? null;
  } else {
    signalLine = average(macdSeries);
  }

  const macdLine = macdSeries.at(-1);

  if (macdLine == null || signalLine == null) {
    return {
      macdLine: null,
      signalLine: null,
      histogram: null,
      state: 'NEUTRAL'
    };
  }

  const histogram = macdLine - signalLine;

  let state = 'NEUTRAL';
  if (macdLine > signalLine && histogram > 0) {
    state = 'BULLISH';
  } else if (macdLine < signalLine && histogram < 0) {
    state = 'BEARISH';
  }

  return {
    macdLine,
    signalLine,
    histogram,
    state
  };
}

function rsi(values, period = 14) {
  if (!values || values.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function volumeAnalysis(volumes) {
  if (!volumes || volumes.length < 20) {
    return {
      lastVolume: null,
      avg5: null,
      avg20: null,
      state: 'NEUTRAL'
    };
  }

  const lastVolume = volumes.at(-1);
  const avg5 = average(volumes.slice(-5));
  const avg20 = average(volumes.slice(-20));

  let state = 'NEUTRAL';
  if (avg5 != null && avg20 != null) {
    if (avg5 > avg20 * 1.05) {
      state = 'STRONG';
    } else if (avg5 < avg20 * 0.95) {
      state = 'WEAK';
    }
  }

  return { lastVolume, avg5, avg20, state };
}

function calculateConfidence(analysis, timeframeWeight = 1) {
  let score = 0;

  if (analysis.last && analysis.ema20 && analysis.ema50) {
    if (analysis.last > analysis.ema20 && analysis.ema20 > analysis.ema50) {
      score += 30 * timeframeWeight;
    } else if (analysis.last < analysis.ema20 && analysis.ema20 < analysis.ema50) {
      score += 30 * timeframeWeight;
    }
  }

  if (analysis.rsi14 != null) {
    if (analysis.rsi14 >= 55 && analysis.rsi14 <= 68) {
      score += 20 * timeframeWeight;
    } else if (analysis.rsi14 >= 45 && analysis.rsi14 <= 75) {
      score += 10 * timeframeWeight;
    }
  }

  if (analysis.macdState === 'BULLISH' || analysis.macdState === 'BEARISH') {
    score += 30 * timeframeWeight;
  }

  if (analysis.volumeState === 'STRONG') {
    score += 20 * timeframeWeight;
  } else if (analysis.volumeState === 'NEUTRAL') {
    score += 10 * timeframeWeight;
  }

  return Math.round(score);
}

function strengthLabel(score) {
  if (score >= 80) return 'HIGH';
  if (score >= 60) return 'MEDIUM';
  if (score >= 40) return 'LOW';
  return 'WEAK';
}

function analyze(closes, volumes) {
  const last = closes.at(-1);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const macdResult = macd(closes);
  const volumeResult = volumeAnalysis(volumes);

  let trend = 'NEUTRAL';

  if (
    last &&
    ema20 &&
    ema50 &&
    rsi14 != null &&
    macdResult.macdLine != null &&
    last > ema20 &&
    ema20 > ema50 &&
    rsi14 >= 52 &&
    rsi14 <= 72 &&
    macdResult.state === 'BULLISH' &&
    macdResult.macdLine > 0
  ) {
    trend = 'BULLISH';
  } else if (
    last &&
    ema20 &&
    ema50 &&
    rsi14 != null &&
    macdResult.macdLine != null &&
    last < ema20 &&
    ema20 < ema50 &&
    rsi14 <= 48 &&
    rsi14 >= 28 &&
    macdResult.state === 'BEARISH' &&
    macdResult.macdLine < 0
  ) {
    trend = 'BEARISH';
  }

  const base = {
    trend,
    last: last || null,
    ema20: ema20 || null,
    ema50: ema50 || null,
    rsi14: rsi14 || null,
    macdLine: macdResult.macdLine,
    signalLine: macdResult.signalLine,
    histogram: macdResult.histogram,
    macdState: macdResult.state,
    lastVolume: volumeResult.lastVolume,
    avgVolume5: volumeResult.avg5,
    avgVolume20: volumeResult.avg20,
    volumeState: volumeResult.state
  };

  const confidence = calculateConfidence(base);
  const strength = strengthLabel(confidence);

  return {
    ...base,
    confidence,
    strength
  };
}

function levels(price, bias, highs = [], lows = [], closes = []) {
  const entry = price ? +price.toFixed(2) : null;
  const riskReward = Number(env.minRr || 2);

  if (!price) {
    return {
      entry: null,
      stopLoss: null,
      takeProfit: null,
      riskReward
    };
  }

  const recentHigh = highs.length ? Math.max(...highs.slice(-20)) : price;
  const recentLow = lows.length ? Math.min(...lows.slice(-20)) : price;
  const recentClose = closes.length ? closes.at(-1) : price;

  const pivot = (recentHigh + recentLow + recentClose) / 3;
  const r1 = (pivot * 2) - recentLow;
  const s1 = (pivot * 2) - recentHigh;

  const maxStopPct = 0.015;
  const maxTpPct = 0.03;

  if (bias === 'BULLISH' || bias === 'WATCHLIST_BUY' || bias === 'SCALP_BUY') {
    const rawStop = Math.min(s1, recentLow, price * (1 - 0.006));
    const stopLoss = +Math.max(rawStop, price * (1 - maxStopPct)).toFixed(2);
    const rawTp = Math.max(r1, price + ((price - stopLoss) * riskReward));
    const takeProfit = +Math.min(rawTp, price * (1 + maxTpPct)).toFixed(2);
    return { entry, stopLoss, takeProfit, riskReward };
  }

  if (bias === 'BEARISH' || bias === 'WATCHLIST_SELL' || bias === 'SCALP_SELL') {
    const rawStop = Math.max(r1, recentHigh, price * (1 + 0.006));
    const stopLoss = +Math.min(rawStop, price * (1 + maxStopPct)).toFixed(2);
    const rawTp = Math.min(s1, price - ((stopLoss - price) * riskReward));
    const takeProfit = +Math.max(rawTp, price * (1 - maxTpPct)).toFixed(2);
    return { entry, stopLoss, takeProfit, riskReward };
  }

  return {
    entry,
    stopLoss: +(price * (1 - 0.008)).toFixed(2),
    takeProfit: +(price * (1 + 0.016)).toFixed(2),
    riskReward
  };
}

function getShortTermBias(analysis15m, analysis5m) {
  if (analysis15m.trend === 'BULLISH' && analysis5m.trend === 'BULLISH') {
    return 'SCALP_BUY';
  }

  if (analysis15m.trend === 'BEARISH' && analysis5m.trend === 'BEARISH') {
    return 'SCALP_SELL';
  }

  if (
    analysis15m.trend === 'BULLISH' &&
    analysis5m.macdState === 'BULLISH' &&
    analysis5m.rsi14 != null &&
    analysis5m.rsi14 >= 50 &&
    analysis5m.rsi14 <= 72
  ) {
    return 'WATCH_SCALP_BUY';
  }

  if (
    analysis15m.trend === 'BEARISH' &&
    analysis5m.macdState === 'BEARISH' &&
    analysis5m.rsi14 != null &&
    analysis5m.rsi14 <= 50 &&
    analysis5m.rsi14 >= 28
  ) {
    return 'WATCH_SCALP_SELL';
  }

  return 'NEUTRAL';
}

function getShortTradeAction(shortBias, shortConfidence, analysis15m, analysis5m) {
  if (
    shortBias === 'SCALP_BUY' &&
    shortConfidence >= 70 &&
    analysis5m.volumeState === 'STRONG' &&
    analysis5m.macdState === 'BULLISH'
  ) {
    return {
      tradeAction: '🟢 COMPRA RÁPIDA',
      recommendationType: 'SCALP_BUY_NOW',
      recommendationLabel: 'Compra curta agora'
    };
  }

  if (
    shortBias === 'SCALP_SELL' &&
    shortConfidence >= 70 &&
    analysis5m.volumeState === 'STRONG' &&
    analysis5m.macdState === 'BEARISH'
  ) {
    return {
      tradeAction: '🔴 VENDA RÁPIDA',
      recommendationType: 'SCALP_SELL_NOW',
      recommendationLabel: 'Venda curta agora'
    };
  }

  if (shortBias === 'WATCH_SCALP_BUY' || shortBias === 'WATCH_SCALP_SELL') {
    return {
      tradeAction: '🟡 AGUARDE GATILHO',
      recommendationType: 'SCALP_WAIT_TRIGGER',
      recommendationLabel: 'Aguarde gatilho curto'
    };
  }

  return {
    tradeAction: '⚪ SEM SETUP CURTO',
    recommendationType: 'SCALP_NO_SETUP',
    recommendationLabel: 'Sem setup curto'
  };
}

export async function buildPlaceholderSignal(lastPrice) {
  const [klines4h, klines1h, klines15m, klines5m] = await Promise.all([
    binanceRest.klines(env.binanceSymbol, '4h', 200),
    binanceRest.klines(env.binanceSymbol, '1h', 200),
    binanceRest.klines(env.binanceSymbol, '15m', 200),
    binanceRest.klines(env.binanceSymbol, '5m', 200)
  ]);

  const closes4h = toCloses(klines4h);
  const closes1h = toCloses(klines1h);
  const closes15m = toCloses(klines15m);
  const closes5m = toCloses(klines5m);

  const highs4h = toHighs(klines4h);
  const lows4h = toLows(klines4h);
  const highs1h = toHighs(klines1h);
  const lows1h = toLows(klines1h);
  const highs15m = toHighs(klines15m);
  const lows15m = toLows(klines15m);
  const highs5m = toHighs(klines5m);
  const lows5m = toLows(klines5m);

  const volumes4h = toVolumes(klines4h);
  const volumes1h = toVolumes(klines1h);
  const volumes15m = toVolumes(klines15m);
  const volumes5m = toVolumes(klines5m);

  const analysis4h = analyze(closes4h, volumes4h);
  const analysis1h = analyze(closes1h, volumes1h);
  const analysis15m = analyze(closes15m, volumes15m);
  const analysis5m = analyze(closes5m, volumes5m);

  let bias = 'NEUTRAL';

  if (analysis4h.trend === 'BULLISH' && analysis1h.trend === 'BULLISH') {
    bias = 'BULLISH';
  } else if (analysis4h.trend === 'BEARISH' && analysis1h.trend === 'BEARISH') {
    bias = 'BEARISH';
  } else if (
    analysis4h.trend === 'NEUTRAL' &&
    analysis1h.trend === 'BULLISH' &&
    analysis4h.macdState !== 'BEARISH'
  ) {
    bias = 'WATCHLIST_BUY';
  } else if (
    analysis4h.trend === 'NEUTRAL' &&
    analysis1h.trend === 'BEARISH' &&
    analysis4h.macdState !== 'BULLISH'
  ) {
    bias = 'WATCHLIST_SELL';
  }

  const shortTermBias = getShortTermBias(analysis15m, analysis5m);

  const price = Number(lastPrice || analysis5m.last || analysis1h.last || analysis4h.last || 0);

  const tradeLevels = levels(price, bias, highs1h, lows1h, closes1h);
  const shortTradeLevels = levels(price, shortTermBias, highs5m, lows5m, closes5m);

  const combinedConfidence = Math.round((analysis4h.confidence * 0.5) + (analysis1h.confidence * 0.5));
  const combinedStrength = strengthLabel(combinedConfidence);

  const shortTermConfidence = Math.round((analysis15m.confidence * 0.45) + (analysis5m.confidence * 0.55));
  const shortTermStrength = strengthLabel(shortTermConfidence);
  const shortTrade = getShortTradeAction(shortTermBias, shortTermConfidence, analysis15m, analysis5m);

  return {
    symbol: env.binanceSymbol,
    bias,
    timeframeContext: ['4h', '1h'],
    entry: tradeLevels.entry,
    stopLoss: tradeLevels.stopLoss,
    takeProfit: tradeLevels.takeProfit,
    riskReward: tradeLevels.riskReward,
    confidence: combinedConfidence,
    strength: combinedStrength,

    shortTermBias,
    shortTermTimeframeContext: ['15m', '5m'],
    shortTermConfidence,
    shortTermStrength,
    shortTermEntry: shortTradeLevels.entry,
    shortTermStopLoss: shortTradeLevels.stopLoss,
    shortTermTakeProfit: shortTradeLevels.takeProfit,
    shortTermRiskReward: shortTradeLevels.riskReward,
    shortTradeAction: shortTrade.tradeAction,
    shortRecommendationType: shortTrade.recommendationType,
    shortRecommendationLabel: shortTrade.recommendationLabel,

    indicators: {
      '4h': {
        candles: closes4h.length,
        trend: analysis4h.trend,
        rsi14: analysis4h.rsi14 != null ? +analysis4h.rsi14.toFixed(2) : null,
        macdState: analysis4h.macdState,
        macdLine: analysis4h.macdLine != null ? +analysis4h.macdLine.toFixed(4) : null,
        signalLine: analysis4h.signalLine != null ? +analysis4h.signalLine.toFixed(4) : null,
        histogram: analysis4h.histogram != null ? +analysis4h.histogram.toFixed(4) : null,
        volumeState: analysis4h.volumeState,
        confidence: analysis4h.confidence,
        strength: analysis4h.strength
      },
      '1h': {
        candles: closes1h.length,
        trend: analysis1h.trend,
        rsi14: analysis1h.rsi14 != null ? +analysis1h.rsi14.toFixed(2) : null,
        macdState: analysis1h.macdState,
        macdLine: analysis1h.macdLine != null ? +analysis1h.macdLine.toFixed(4) : null,
        signalLine: analysis1h.signalLine != null ? +analysis1h.signalLine.toFixed(4) : null,
        histogram: analysis1h.histogram != null ? +analysis1h.histogram.toFixed(4) : null,
        volumeState: analysis1h.volumeState,
        confidence: analysis1h.confidence,
        strength: analysis1h.strength
      }
    },

    shortTermIndicators: {
      '15m': {
        candles: closes15m.length,
        trend: analysis15m.trend,
        rsi14: analysis15m.rsi14 != null ? +analysis15m.rsi14.toFixed(2) : null,
        macdState: analysis15m.macdState,
        macdLine: analysis15m.macdLine != null ? +analysis15m.macdLine.toFixed(4) : null,
        signalLine: analysis15m.signalLine != null ? +analysis15m.signalLine.toFixed(4) : null,
        histogram: analysis15m.histogram != null ? +analysis15m.histogram.toFixed(4) : null,
        volumeState: analysis15m.volumeState,
        confidence: analysis15m.confidence,
        strength: analysis15m.strength
      },
      '5m': {
        candles: closes5m.length,
        trend: analysis5m.trend,
        rsi14: analysis5m.rsi14 != null ? +analysis5m.rsi14.toFixed(2) : null,
        macdState: analysis5m.macdState,
        macdLine: analysis5m.macdLine != null ? +analysis5m.macdLine.toFixed(4) : null,
        signalLine: analysis5m.signalLine != null ? +analysis5m.signalLine.toFixed(4) : null,
        histogram: analysis5m.histogram != null ? +analysis5m.histogram.toFixed(4) : null,
        volumeState: analysis5m.volumeState,
        confidence: analysis5m.confidence,
        strength: analysis5m.strength
      }
    },

    note: `4h=${analysis4h.trend} | 1h=${analysis1h.trend} | MACD 4h=${analysis4h.macdState} | MACD 1h=${analysis1h.macdState} | VOL 4h=${analysis4h.volumeState} | VOL 1h=${analysis1h.volumeState} | RSI 4h=${analysis4h.rsi14 != null ? analysis4h.rsi14.toFixed(1) : 'n/a'} | RSI 1h=${analysis1h.rsi14 != null ? analysis1h.rsi14.toFixed(1) : 'n/a'} | CONF=${combinedConfidence}`,

    shortNote: `15m=${analysis15m.trend} | 5m=${analysis5m.trend} | MACD 15m=${analysis15m.macdState} | MACD 5m=${analysis5m.macdState} | VOL 15m=${analysis15m.volumeState} | VOL 5m=${analysis5m.volumeState} | RSI 15m=${analysis15m.rsi14 != null ? analysis15m.rsi14.toFixed(1) : 'n/a'} | RSI 5m=${analysis5m.rsi14 != null ? analysis5m.rsi14.toFixed(1) : 'n/a'} | CONF=${shortTermConfidence}`
  };
}