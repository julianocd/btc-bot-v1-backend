import { env } from '../config/env.js';
import { signQuery } from './binance-signature.service.js';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

function isRestrictedLocationError(error) {
  const message = String(error?.message || '');
  return message.includes('restricted location') || message.includes('Service unavailable');
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

function resampleOhlcToKlines(ohlc, limit = 100) {
  const sliced = Array.isArray(ohlc) ? ohlc.slice(-limit) : [];

  return sliced.map((item) => {
    const [timestamp, open, high, low, close] = item;

    return [
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
    ];
  });
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

  return {
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
    closeTime: Date.now()
  };
}

async function coinGeckoOhlc(symbol, interval, limit = 100) {
  const coinId = getCoinGeckoIdFromSymbol(symbol);
  const days = mapIntervalToCoinGeckoDays(interval);
  const url = `${COINGECKO_BASE_URL}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(data));
  }

  return resampleOhlcToKlines(data, limit);
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
        return { serverTime: Date.now(), fallback: 'coingecko' };
      }
      throw error;
    }
  },

  ticker24h: async (symbol) => {
    try {
      return await call('/api/v3/ticker/24hr', { params: { symbol } });
    } catch (error) {
      if (isRestrictedLocationError(error)) {
        return await coinGeckoSimplePrice(symbol);
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
        return await coinGeckoOhlc(symbol, interval, limit);
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