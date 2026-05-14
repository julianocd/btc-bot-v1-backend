import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import marketRoutes from './routes/market.routes.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Serve o frontend estático (pasta public na raiz do projeto)
app.use(express.static(path.resolve(__dirname, '../../public')));

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Rotas de mercado
app.use('/market', marketRoutes);

// Fallback para o index.html
app.get('*', (_req, res) => {
  res.sendFile(path.resolve(__dirname, '../../public/index.html'));
});

export default app;