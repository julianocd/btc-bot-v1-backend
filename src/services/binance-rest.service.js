import { env } from '../config/env.js';
import { signQuery } from './binance-signature.service.js';

async function call(path, { method = 'GET', signed = false, params = {} } = {}) {
  const search = new URLSearchParams(params);

  if (signed) {
    search.set('timestamp', Date.now().toString());
  }

  const queryString = search.toString();
  const signature = signed ? signQuery(queryString) : null;
  const url = `${env.binanceBaseUrl}${path}${queryString ? `?${queryString}` : ''}${signature ? `${queryString ? '&' : '?'}signature=${signature}` : ''}`;

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

export const binanceRest = {
  ping: () => call('/api/v3/ping'),
  time: () => call('/api/v3/time'),
  ticker24h: (symbol) => call('/api/v3/ticker/24hr', { params: { symbol } }),
  klines: (symbol, interval, limit = 100) =>
    call('/api/v3/klines', { params: { symbol, interval, limit } }),
  orderTest: (payload) =>
    call('/api/v3/order/test', { method: 'POST', signed: true, params: payload })
};