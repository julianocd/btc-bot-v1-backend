import { env } from '../config/env.js';

// Cache simples
const cache = {
  klines: new Map(),
  ticker: null,
  timestamp: null
};

// Preços simulados realistas (seguem tendência do BTC)
let simulatedPrice = 65000; // Preço inicial próximo do real
let priceDirection = 1; // 1 = subindo, -1 = descendo
let lastUpdate = Date.now();

// Gera preço realista com pequenas variações
function gerarPrecoRealista() {
  const now = Date.now();
  const timeDiff = (now - lastUpdate) / 1000; // segundos desde última atualização
  
  // Se passou menos de 10 segundos, usa o mesmo preço
  if (timeDiff < 10 && cache.ticker) {
    return parseFloat(cache.ticker.lastPrice);
  }
  
  lastUpdate = now;
  
  // Muda direção aleatoriamente a cada 5-30 minutos
  if (Math.random() < 0.05) {
    priceDirection = Math.random() > 0.5 ? 1 : -1;
  }
  
  // Variação de 0.01% a 0.5% por atualização
  const variacao = (Math.random() * 0.005 + 0.0001) * priceDirection;
  simulatedPrice = simulatedPrice * (1 + variacao);
  
  // Mantém entre 30k e 120k (limites realistas)
  simulatedPrice = Math.min(120000, Math.max(30000, simulatedPrice));
  
  return simulatedPrice;
}

// Gera velas realistas baseadas no preço atual
function gerarKlinesRealistas(interval, limit = 200) {
  const now = Date.now();
  const klines = [];
  
  // Define o intervalo em milissegundos
  const intervalMs = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000
  }[interval] || 60 * 60 * 1000;
  
  // Gera uma tendência de fundo
  const tendenciaFundo = (Math.random() - 0.5) * 0.0005; // -0.05% a +0.05% por candle
  
  for (let i = 0; i < limit; i++) {
    // Variação para este candle (-1% a +1%)
    const variacaoCandle = (Math.random() - 0.5) * 0.02 + tendenciaFundo;
    const open = simulatedPrice * (1 + (Math.random() - 0.5) * 0.005);
    const close = open * (1 + variacaoCandle);
    const high = Math.max(open, close) * (1 + Math.random() * 0.005);
    const low = Math.min(open, close) * (1 - Math.random() * 0.005);
    const volume = 50 + Math.random() * 150;
    
    const timestamp = now - (limit - i) * intervalMs;
    
    klines.push([
      timestamp,           // 0: Open time
      open.toFixed(2),     // 1: Open
      high.toFixed(2),     // 2: High
      low.toFixed(2),      // 3: Low
      close.toFixed(2),    // 4: Close
      volume.toFixed(2),   // 5: Volume
      timestamp + intervalMs, // 6: Close time
      '0',                 // 7: Quote asset volume
      0,                   // 8: Number of trades
      '0',                 // 9: Taker buy base asset volume
      '0',                 // 10: Taker buy quote asset volume
      '0'                  // 11: Ignore
    ]);
    
    // Atualiza o preço para o próximo candle
    simulatedPrice = close;
  }
  
  return klines;
}

// Obter preço atual (simulado realista)
export async function ticker24h(symbol) {
  const price = gerarPrecoRealista();
  
  const result = {
    symbol: symbol,
    lastPrice: price.toFixed(2),
    priceChangePercent: ((Math.random() - 0.5) * 5).toFixed(2),
    volume: (Math.random() * 1000 + 500).toFixed(2),
    quoteVolume: (Math.random() * 50000000 + 25000000).toFixed(2),
    openPrice: (price * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2),
    highPrice: (price * (1 + Math.random() * 0.01)).toFixed(2),
    lowPrice: (price * (1 - Math.random() * 0.01)).toFixed(2),
    fallback: 'simulated'
  };
  
  cache.ticker = result;
  cache.timestamp = Date.now();
  
  console.log(`[Simulado] Preço ${symbol}: $${price.toFixed(2)}`);
  return result;
}

// Obter velas (simuladas realistas)
export async function klines(symbol, interval, limit = 200) {
  const cacheKey = `${symbol}_${interval}_${limit}`;
  
  // Verifica cache (15 segundos para simulação)
  if (cache.klines.has(cacheKey)) {
    const cached = cache.klines.get(cacheKey);
    if ((Date.now() - cached.timestamp) < 15000) {
      return cached.data;
    }
  }
  
  // Gera dados realistas
  const data = gerarKlinesRealistas(interval, limit);
  
  // Salva no cache
  cache.klines.set(cacheKey, {
    data: data,
    timestamp: Date.now()
  });
  
  console.log(`[Simulado] Klines ${interval} geradas (${limit} candles)`);
  return data;
}

// Obter tempo do servidor
export async function time() {
  return Date.now();
}

// Exportar todas as funções
export const binanceRest = {
  ticker24h,
  klines,
  time
};