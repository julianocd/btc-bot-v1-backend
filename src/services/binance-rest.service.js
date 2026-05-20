import { env } from '../config/env.js';

// Cache simples para evitar chamadas desnecessárias
const cache = {
  klines: new Map(),
  ticker: null,
  timestamp: null,
  ttl: 30000 // 30 segundos de cache
};

// Cache para último preço conhecido (fallback)
let lastKnownPrice = null;
let lastPriceUpdate = null;

async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// Obter preço atual (apenas Binance, sem CoinGecko)
async function ticker24h(symbol) {
  // Verifica cache
  if (cache.ticker && (Date.now() - cache.timestamp) < cache.ttl) {
    return cache.ticker;
  }

  try {
    const baseUrl = env.binanceBaseUrl || 'https://api.binance.com';
    const url = `${baseUrl}/api/v3/ticker/24hr?symbol=${symbol}`;
    const data = await fetchWithRetry(url);
    
    // Atualiza cache
    cache.ticker = data;
    cache.timestamp = Date.now();
    lastKnownPrice = data.lastPrice;
    lastPriceUpdate = Date.now();
    
    return data;
  } catch (error) {
    console.error('Erro ao buscar ticker da Binance:', error.message);
    
    // Fallback para último preço conhecido
    if (lastKnownPrice && (Date.now() - lastPriceUpdate) < 300000) { // 5 minutos
      return { lastPrice: lastKnownPrice, fallback: true };
    }
    
    throw new Error('Não foi possível obter preço da Binance e sem cache válido');
  }
}

// Obter velas (klines) - APENAS Binance
async function klines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}_${interval}_${limit}`;
  
  // Verifica cache
  if (cache.klines.has(cacheKey)) {
    const cached = cache.klines.get(cacheKey);
    if ((Date.now() - cached.timestamp) < 60000) { // 1 minuto de cache
      return cached.data;
    }
  }

  try {
    const baseUrl = env.binanceBaseUrl || 'https://api.binance.com';
    const url = `${baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const data = await fetchWithRetry(url);
    
    // Salva no cache
    cache.klines.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    return data;
  } catch (error) {
    console.error(`Erro ao buscar klines ${interval} da Binance:`, error.message);
    
    // Tenta retornar cache mesmo que expirado
    if (cache.klines.has(cacheKey)) {
      console.log(`Usando cache expirado para ${interval}`);
      return cache.klines.get(cacheKey).data;
    }
    
    throw error;
  }
}

// Obter tempo do servidor
async function time() {
  try {
    const baseUrl = env.binanceBaseUrl || 'https://api.binance.com';
    const url = `${baseUrl}/api/v3/time`;
    const data = await fetchWithRetry(url);
    return data.serverTime;
  } catch (error) {
    console.error('Erro ao buscar tempo da Binance:', error.message);
    return Date.now();
  }
}

// Exportar TODAS as funções
export const binanceRest = {
  ticker24h,
  klines,
  time
};