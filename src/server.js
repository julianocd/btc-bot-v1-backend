import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import marketRoutes from './routes/market.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Servir arquivos estáticos
const publicPath = path.resolve(__dirname, '../public');
console.log('Servindo arquivos estáticos de:', publicPath);

app.use(express.static(publicPath, {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    const alertPath = path.resolve(__dirname, '../alert-state.json');
    if (fs.existsSync(alertPath)) {
      const content = fs.readFileSync(alertPath, 'utf8');
      const alertState = JSON.parse(content);
      return res.json({
        ok: true,
        service: 'btc-bot-v1-backend',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        hasAlertState: true,
        alertUpdatedAt: alertState?.updatedAt || alertState?.generatedAt || null
      });
    }
  } catch (error) {
    // Ignora erro
  }
  
  return res.json({
    ok: true,
    service: 'btc-bot-v1-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    hasAlertState: false
  });
});

// Rotas da API
app.use('/market', marketRoutes);

// Rota principal
app.get('/', (req, res) => {
  res.sendFile(path.resolve(publicPath, 'index.html'));
});

// ============================================
// CRON JOB: Atualiza sinais automaticamente a cada 5 minutos
// ============================================
cron.schedule('*/5 * * * *', async () => {
  console.log(`[CRON] 🔄 Atualizando sinais automaticamente... ${new Date().toLocaleString()}`);
  try {
    const response = await fetch(`http://localhost:${PORT}/market/alert-signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    
    if (data.sent) {
      console.log('[CRON] ✅ Alerta enviado para Telegram!');
    } else if (data.signal) {
      console.log(`[CRON] 📊 Preço: $${data.signal.entry} | SL: $${data.signal.stopLoss} | TP: $${data.signal.takeProfit} | Confiança: ${data.signal.confidence}%`);
    } else if (data.reason) {
      console.log(`[CRON] ℹ️ ${data.reason}`);
    }
  } catch (error) {
    console.error('[CRON] ❌ Erro ao atualizar sinal:', error.message);
  }
});

console.log('[CRON] ⏰ Job agendado: atualização automática a cada 5 minutos');

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Dashboard: http://localhost:${PORT}`);
  console.log(`📍 Snapshot: http://localhost:${PORT}/market/snapshot`);
  console.log(`📍 Alertas: http://localhost:${PORT}/market/alerts`);
});