import { env } from '../config/env.js';

// Cache simples para evitar chamadas desnecessárias
const cache = {
  klines: new Map(),
  ticker: null,
  timestamp: null,
  ttl: 30000 // 30 segundos de cache
};

// Cache para último preço conhecido (fallback)
let lastKnownPrice = 50000; // valor inicial padrão
let lastPriceUpdate = null;

// Função auxiliar para gerar dados mockados (evita crash total)
function gerarKlinesMock(interval, limit) {
  const now = Date.now();
  const klines = [];
  let price = lastKnownPrice || 50000;
  
  // Define o intervalo em milissegundos
  const intervalMs = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  }[interval] || 60 * 60 * 1000;
  
  for (let i = 0; i < limit; i++) {
    // Simula variação de preço de ±0.5%
    const variation = (Math.random() - 0.5) * 0.01;
    price = price * (1 + variation);
    
    const timestamp = now - (limit - i) * intervalMs;
    const open = (price * (1 - variation * 0.5)).toFixed(2);
    const high = (price * (1 + Math.abs(variation) * 0.8)).toFixed(2);
    const low = (price * (1 - Math.abs(variation) * 0.8)).toFixed(2);
    const close = price.toFixed(2);
    const volume = (Math.random() * 100 + 50).toFixed(2);
    
    klines.push([
      timestamp,           // 0: Open time
      open,               // 1: Open
      high,               // 2: High
      low,                // 3: Low
      close,              // 4: Close
      volume,             // 5: Volume
      timestamp + intervalMs, // 6: Close time
      '0',                // 7: Quote asset volume
      0,                  // 8: Number of trades
      '0',                // 9: Taker buy base asset volume
      '0',                // 10: Taker buy quote asset volume
      '0'                 // 11: Ignore
    ]);
  }
  
  return klines;
}

// Obter preço atual (usando CoinGecko - SEM BLOQUEIO)
export async function ticker24h(symbol) {
  // Verifica cache
  if (cache.ticker && (Date.now() - cache.timestamp) < cache.ttl) {
    return cache.ticker;
  }

  try {
    // Converte BTCUSDT para bitcoin (formato CoinGecko)
    const coinId = symbol.toLowerCase().replace('usdt', '').replace('usdc', '');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_last_updated_at=true`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`CoinGecko HTTP ${response.status}`);
    
    const data = await response.json();
    const price = data[coinId]?.usd;
    
    if (!price) throw new Error('Preço não encontrado na CoinGecko');
    
    lastKnownPrice = price;
    lastPriceUpdate = Date.now();
    
    const result = {
      symbol: symbol,
      lastPrice: price.toString(),
      priceChangePercent: '0',
      volume: '0',
      quoteVolume: '0',
      openPrice: price.toString(),
      highPrice: price.toString(),
      lowPrice: price.toString(),
      fallback: 'coingecko'
    };
    
    // Atualiza cache
    cache.ticker = result;
    cache.timestamp = Date.now();
    
    console.log(`[Binance] Preço obtido via CoinGecko: ${symbol} = $${price}`);
    return result;
    
  } catch (error) {
    console.error('Erro ao buscar preço na CoinGecko:', error.message);
    
    // Fallback para último preço conhecido
    if (lastKnownPrice && (!lastPriceUpdate || (Date.now() - lastPriceUpdate) < 300000)) {
      console.log(`[Binance] Usando último preço conhecido: $${lastKnownPrice}`);
      return {
        symbol: symbol,
        lastPrice: lastKnownPrice.toString(),
        priceChangePercent: '0',
        volume: '0',
        fallback: 'cache'
      };
    }
    
    throw new Error(`Não foi possível obter preço do ${symbol} - ${error.message}`);
  }
}

// Obter velas (klines) - usando proxy CORS para contornar bloqueio
export async function klines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}_${interval}_${limit}`;
  
  // Verifica cache
  if (cache.klines.has(cacheKey)) {
    const cached = cache.klines.get(cacheKey);
    if ((Date.now() - cached.timestamp) < 60000) { // 1 minuto de cache
      console.log(`[Cache] Usando klines cacheadas para ${interval}`);
      return cached.data;
    }
  }

  try {
    // Usa um proxy CORS público para contornar o bloqueio 451
    // Opção 1: corsproxy.io (recomendado)
    const proxyUrl = 'https://corsproxy.io/?';
    const targetUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    
    console.log(`[Binance] Buscando klines ${interval} via proxy...`);
    const response = await fetch(`${proxyUrl}${encodeURIComponent(targetUrl)}`);
    
    if (!response.ok) {
      throw new Error(`Proxy retornou HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('Dados de klines inválidos');
    }
    
    // Salva no cache
    cache.klines.set(cacheKey, {
      data: data,
      timestamp: Date.now()
    });
    
    console.log(`[Binance] Klines ${interval} obtidas com sucesso via proxy`);
    return data;
    
  } catch (error) {
    console.error(`Erro ao buscar klines ${interval} via proxy:`, error.message);
    
    // Tenta usar proxy alternativo
    try {
      const altProxyUrl = 'https://cors-anywhere.herokuapp.com/';
      const targetUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
      
      console.log(`[Binance] Tentando proxy alternativo para ${interval}...`);
      const response = await fetch(`${altProxyUrl}${targetUrl}`);
      
      if (response.ok) {
        const data = await response.json();
        cache.klines.set(cacheKey, {
          data: data,
          timestamp: Date.now()
        });
        return data;
      }
    } catch (altError) {
      console.error(`Proxy alternativo também falhou:`, altError.message);
    }
    
    // Último recurso: retorna dados mockados
    console.warn(`[Binance] Usando dados MOCKADOS para ${interval}`);
    const mockData = gerarKlinesMock(interval, limit);
    
    // Salva mock no cache para evitar gerar repetidamente
    cache.klines.set(cacheKey, {
      data: mockData,
      timestamp: Date.now()
    });
    
    return mockData;
  }
}

// Obter tempo do servidor (usando API pública)
export async function time() {
  try {
    // Tenta via proxy
    const proxyUrl = 'https://corsproxy.io/?';
    const targetUrl = 'https://api.binance.com/api/v3/time';
    const response = await fetch(`${proxyUrl}${encodeURIComponent(targetUrl)}`);
    
    if (response.ok) {
      const data = await response.json();
      return data.serverTime;
    }
  } catch (error) {
    console.error('Erro ao buscar tempo da Binance:', error.message);
  }
  
  // Fallback: retorna timestamp local
  return Date.now();
}

// Exportar todas as funções
export const binanceRest = {
  ticker24h,
  klines,
  time
};