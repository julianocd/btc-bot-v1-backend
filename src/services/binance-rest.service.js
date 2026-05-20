import { env } from '../config/env.js';

const cache = {
  klines: new Map(),
  ticker: null,
  timestamp: null,
  ttl: 30000
};

let lastKnownPrice = null;

// CORRIGIDO: Endpoint correto para ticker
async function ticker24h(symbol) {
  if (cache.ticker && (Date.now() - cache.timestamp) < cache.ttl) {
    return cache.ticker;
  }

  try {
    const baseUrl = env.binanceBaseUrl || 'https://api.binance.com';
    // Endpoint correto para preço atual
    const url = `${baseUrl}/api/v3/ticker/price?symbol=${symbol}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    // Formatar para o formato esperado pelo seu sistema
    const result = {
      symbol: data.symbol,
      lastPrice: data.price,
      priceChangePercent: '0',
      volume: '0'
    };
    
    cache.ticker = result;
    cache.timestamp = Date.now();
    lastKnownPrice = data.price;
    
    console.log(`✅ Preço real BTC: $${data.price}`);
    return result;
  } catch (error) {
    console.error('Erro ao buscar preço:', error.message);
    if (lastKnownPrice) {
      return { lastPrice: lastKnownPrice, fallback: true };
    }
    throw error;
  }
}

// CORRIGIDO: Klines endpoint correto
async function klines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}_${interval}_${limit}`;
  
  if (cache.klines.has(cacheKey)) {
    const cached = cache.klines.get(cacheKey);
    if ((Date.now() - cached.timestamp) < 60000) {
      return cached.data;
    }
  }

  try {
    const baseUrl = env.binanceBaseUrl || 'https://api.binance.com';
    const url = `${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    
    cache.klines.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    console.log(`✅ Klines ${interval} obtidas com sucesso`);
    return data;
  } catch (error) {
    console.error(`Erro ao buscar klines ${interval}:`, error.message);
    if (cache.klines.has(cacheKey)) {
      return cache.klines.get(cacheKey).data;
    }
    throw error;
  }
}

async function time() {
  try {
    const baseUrl = env.binanceBaseUrl || 'https://api.binance.com';
    const url = `${baseUrl}/api/v3/time`;
    const response = await fetch(url);
    const data = await response.json();
    return data.serverTime;
  } catch (error) {
    console.error('Erro ao buscar tempo:', error.message);
    return Date.now();
  }
}

export const binanceRest = {
  ticker24h,
  klines,
  time
};