import { env } from '../config/env.js';

// Cache para preço e velas
const cache = {
  price: null,
  priceTimestamp: null,
  klines: new Map(),
  ttl: 30000 // 30 segundos para preço
};

let lastKnownPrice = 65000; // valor inicial

// ========== COINGECKO (fonte primária) ==========
async function getPriceFromCoinGecko() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
  const data = await response.json();
  return data.bitcoin?.usd;
}

// ========== GERAR VELAS SINTÉTICAS REALISTAS ==========
function generateRealisticKlines(interval, limit = 200, currentPrice) {
  const now = Date.now();
  const intervalMs = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  }[interval] || 60 * 60 * 1000;

  const klines = [];
  let price = currentPrice || lastKnownPrice;

  for (let i = limit; i > 0; i--) {
    // Variação percentual entre -0.5% e +0.5% para cada candle
    const change = (Math.random() - 0.5) * 0.01;
    const close = price * (1 + change);
    const high = Math.max(price, close) * (1 + Math.random() * 0.005);
    const low = Math.min(price, close) * (1 - Math.random() * 0.005);
    const volume = 50 + Math.random() * 150;

    const timestamp = now - (limit - i + 1) * intervalMs;
    klines.unshift([
      timestamp,           // open time
      price.toFixed(2),    // open
      high.toFixed(2),     // high
      low.toFixed(2),      // low
      close.toFixed(2),    // close
      volume.toFixed(2),   // volume
      timestamp + intervalMs, // close time
      '0', '0', '0', '0', '0'
    ]);
    price = close;
  }
  lastKnownPrice = price;
  return klines;
}

// ========== EXPORTAÇÕES PRINCIPAIS (API pública) ==========
export async function ticker24h(symbol) {
  if (cache.price && (Date.now() - cache.priceTimestamp) < cache.ttl) {
    return { symbol, lastPrice: cache.price.toString(), fallback: 'cache' };
  }
  try {
    const price = await getPriceFromCoinGecko();
    cache.price = price;
    cache.priceTimestamp = Date.now();
    lastKnownPrice = price;
    console.log(`✅ Preço via CoinGecko: $${price}`);
    return {
      symbol,
      lastPrice: price.toString(),
      priceChangePercent: '0',
      volume: '0',
      fallback: 'coingecko'
    };
  } catch (error) {
    console.error('Erro ao buscar preço na CoinGecko:', error.message);
    if (lastKnownPrice) {
      return { symbol, lastPrice: lastKnownPrice.toString(), fallback: 'last_known' };
    }
    throw new Error('Não foi possível obter preço');
  }
}

export async function klines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}_${interval}_${limit}`;
  if (cache.klines.has(cacheKey)) {
    const cached = cache.klines.get(cacheKey);
    if ((Date.now() - cached.timestamp) < 60000) {
      return cached.data;
    }
  }

  // Obtém o preço atual (para gerar velas realistas)
  let currentPrice = cache.price;
  if (!currentPrice) {
    try {
      const priceData = await ticker24h(symbol);
      currentPrice = parseFloat(priceData.lastPrice);
    } catch {
      currentPrice = lastKnownPrice || 65000;
    }
  }

  const data = generateRealisticKlines(interval, limit, currentPrice);
  cache.klines.set(cacheKey, { data, timestamp: Date.now() });
  console.log(`📊 Klines sintéticas geradas para ${interval}`);
  return data;
}

export async function time() {
  return Date.now();
}

export const binanceRest = { ticker24h, klines, time };