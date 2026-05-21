import { env } from '../config/env.js';

// Cache simples
const cache = {
  klines: new Map(),
  ticker: null,
  timestamp: null,
  ttl: 30000 // 30 segundos
};

let lastKnownPrice = null;
let lastPriceUpdate = null;

// Lista de proxies CORS públicos (quanto mais, melhor)
const PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
  'https://cors-anywhere.herokuapp.com/'
];

// Função auxiliar para tentar chamadas com múltiplos proxies
async function fetchWithProxy(targetUrl, options = {}) {
  for (const proxy of PROXIES) {
    try {
      const proxyUrl = proxy + encodeURIComponent(targetUrl);
      const response = await fetch(proxyUrl, options);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn(`Proxy ${proxy.split('//')[1]} falhou:`, e.message);
    }
  }
  throw new Error(`Todos os proxies falharam para ${targetUrl}`);
}

// Obter preço atual (via proxy)
export async function ticker24h(symbol) {
  if (cache.ticker && (Date.now() - cache.timestamp) < cache.ttl) {
    return cache.ticker;
  }

  try {
    const targetUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
    const data = await fetchWithProxy(targetUrl);
    
    const result = {
      symbol: data.symbol,
      lastPrice: data.price,
      priceChangePercent: '0',
      volume: '0'
    };
    
    cache.ticker = result;
    cache.timestamp = Date.now();
    lastKnownPrice = data.price;
    lastPriceUpdate = Date.now();
    
    console.log(`✅ Preço via proxy: $${data.price}`);
    return result;
  } catch (error) {
    console.error('Erro ao buscar preço via proxy:', error.message);
    
    if (lastKnownPrice && (Date.now() - lastPriceUpdate) < 300000) {
      console.log(`Usando último preço conhecido: $${lastKnownPrice}`);
      return { lastPrice: lastKnownPrice, fallback: true };
    }
    
    throw new Error('Não foi possível obter preço - todos os proxies falharam');
  }
}

// Obter velas (klines) via proxy
export async function klines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}_${interval}_${limit}`;
  
  if (cache.klines.has(cacheKey)) {
    const cached = cache.klines.get(cacheKey);
    if ((Date.now() - cached.timestamp) < 60000) {
      return cached.data;
    }
  }

  try {
    const targetUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const data = await fetchWithProxy(targetUrl);
    
    cache.klines.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    console.log(`✅ Klines ${interval} via proxy`);
    return data;
  } catch (error) {
    console.error(`Erro ao buscar klines ${interval} via proxy:`, error.message);
    
    if (cache.klines.has(cacheKey)) {
      return cache.klines.get(cacheKey).data;
    }
    
    throw error;
  }
}

// Obter tempo do servidor (via proxy)
export async function time() {
  try {
    const targetUrl = 'https://api.binance.com/api/v3/time';
    const data = await fetchWithProxy(targetUrl);
    return data.serverTime;
  } catch (error) {
    console.error('Erro ao buscar tempo via proxy:', error.message);
    return Date.now();
  }
}

export const binanceRest = {
  ticker24h,
  klines,
  time
};