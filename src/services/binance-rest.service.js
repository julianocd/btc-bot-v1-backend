import { env } from '../config/env.js';
import { signQuery } from './binance-signature.service.js';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const CACHE_TTL_MS = 10 * 60 * 1000;

const memoryCache = {
  ticker: new Map(),
  klines: new Map(),
  time: null
};

function isRestrictedLocationError(error) {
  const message = String(error?.message || '');
  return message.includes('restricted location') || message.includes('Service unavailable');
}

function isRateLimitError(error) {
  const message = String(error?.message || '');
  return message.includes('"error_code":429') || message.includes('Rate Limit') || message.includes('429');
}

function getCached(map, key) {
  const item = map.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return item.value;
}

function setCached(map, key, value) {
  map.set(key, {
    value,
    timestamp: Date.now()
  });
  return value;
}

function getCoinGeckoIdFromSymbol(symbol) {
  const normalized = String(symbol || '').toUpperCase();

  if (normalized === 'BTCUSDT') return 'bitcoin';
  if (normalized === 'ETHUSDT') return 'ethereum';
  if (normalized === 'SOLUSDT') return 'solana';

  return 'bitcoin';
}

function mapIntervalToCoinGeckoDays(interval) {
  switch (interval) {
    case '1m':
    case '5m':
    case '15m':
    case '30m':
      return '1';
    case '1h':
      return '7';
    case '4h':
      return '30';
    case '1d':
      return '90';
    default:
      return '7';
  }
}

function resampleOhlcToKlines(ohlc, interval, limit = 100) {
  const raw = Array.isArray(ohlc) ? ohlc : [];
  const sampled = [];
  let step = 1;

  if (interval === '4h') step = 8;
  else if (interval === '1h') step = 2;
  else if (interval === '30m') step = 1;
  else if (interval === '15m') step = 1;
  else if (interval === '5m') step = 1;
  else if (interval === '1m') step = 1;

  for (let i = 0; i < raw.length; i += step) {
    const item = raw[i];
    if (!Array.isArray(item) || item.length < 5) continue;

    const [timestamp, open, high, low, close] = item;

    sampled.push([
      timestamp,
      String(open),
      String(high),
      String(low),
      String(close),
      '0',
      timestamp,
      '0',
      0,
      '0',
      '0',
      '0'
    ]);
  }

  return sampled.slice(-limit);
}

async function call(path, { method = 'GET', signed = false, params = {} } = {}) {
  const search = new URLSearchParams(params);

  if (signed) {
    search.set('timestamp', Date.now().toString());
  }

  const queryString = search.toString();
  const signature = signed ? signQuery(queryString) : null;

  const url =
    `${env.binanceBaseUrl}${path}` +
    `${queryString ? `?${queryString}` : ''}` +
    `${signature ? `${queryString ? '&' : '?'}signature=${signature}` : ''}`;

  const headers = {};
  if (signed || env.binanceApiKey) {
    headers['X-MBX-APIKEY'] = env.binanceApiKey;
  }

  const res = await fetch(url, { method, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

async function coinGeckoSimplePrice(symbol) {
  const cacheKey = `ticker:${symbol}`;
  const cached = getCached(memoryCache.ticker, cacheKey);
  if (cached) return cached;

  const coinId = getCoinGeckoIdFromSymbol(symbol);
  const url = `${COINGECKO_BASE_URL}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  const coin = data[coinId];
  const price = coin?.usd;

  if (price == null) {
    throw new Error('CoinGecko não retornou preço.');
  }

  const payload = {
    symbol,
    lastPrice: String(price),
    priceChangePercent: String(coin?.usd_24h_change ?? 0),
    quoteVolume: String(coin?.usd_24h_vol ?? 0),
    volume: String(coin?.usd_24h_vol ?? 0),
    openPrice: String(price),
    highPrice: String(price),
    lowPrice: String(price),
    lastQty: '0',
    weightedAvgPrice: String(price),
    openTime: Date.now() - 24 * 60 * 60 * 1000,
    closeTime: Date.now(),
    fallback: 'coingecko'
  };

  return setCached(memoryCache.ticker, cacheKey, payload);
}

async function coinGeckoOhlc(symbol, interval, limit = 100) {
  const cacheKey = `klines:${symbol}:${interval}:${limit}`;
  const cached = getCached(memoryCache.klines, cacheKey);
  if (cached) return cached;

  const coinId = getCoinGeckoIdFromSymbol(symbol);
  const days = mapIntervalToCoinGeckoDays(interval);
  const url = `${COINGECKO_BASE_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  const payload = resampleOhlcToKlines(data, interval, limit);
  return setCached(memoryCache.klines, cacheKey, payload);
}

function getLastKnownTicker(symbol) {
  return getCached(memoryCache.ticker, `ticker:${symbol}`);
}

function getLastKnownKlines(symbol, interval, limit = 100) {
  return getCached(memoryCache.klines, `klines:${symbol}:${interval}:${limit}`);
}

export const binanceRest = {
  ping: async () => {
    try {
      return await call('/api/v3/ping');
    } catch (error) {
      if (isRestrictedLocationError(error)) {
        return { ok: true, fallback: 'coingecko' };
      }
      throw error;
    }
  },

  time: async () => {
    try {
      return await call('/api/v3/time');
    } catch (error) {
      if (isRestrictedLocationError(error)) {
        memoryCache.time = { serverTime: Date.now(), fallback: 'coingecko' };
        return memoryCache.time;
      }
      throw error;
    }
  },

  ticker24h: async (symbol) => {
    try {
      return await call('/api/v3/ticker/24hr', { params: { symbol } });
    } catch (error) {
      if (isRestrictedLocationError(error)) {
        try {
          return await coinGeckoSimplePrice(symbol);
        } catch (fallbackError) {
          if (isRateLimitError(fallbackError)) {
            const cached = getLastKnownTicker(symbol);
            if (cached) return cached;
          }
          throw fallbackError;
        }
      }
      throw error;
    }
  },

  klines: async (symbol, interval, limit = 100) => {
    try {
      return await call('/api/v3/klines', {
        params: { symbol, interval, limit }
      });
    } catch (error) {
      if (isRestrictedLocationError(error)) {
        try {
          return await coinGeckoOhlc(symbol, interval, limit);
        } catch (fallbackError) {
          if (isRateLimitError(fallbackError)) {
            const cached = getLastKnownKlines(symbol, interval, limit);
            if (cached) return cached;
          }
          throw fallbackError;
        }
      }
      throw error;
    }
  },

  orderTest: async (payload) => {
    return await call('/api/v3/order/test', {
      method: 'POST',
      signed: true,
      params: payload
    });
  }
};