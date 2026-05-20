import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';
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

app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  }
}));

app.get('/health', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../alert-state.json');
    const content = fs.readFileSync(filePath, 'utf8');
    const alertState = JSON.parse(content);

    return res.json({
      ok: true,
      service: 'btc-bot-v1-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development',
      hasAlertState: true,
      alertUpdatedAt: alertState?.updatedAt || alertState?.generatedAt || null
    });
  } catch (error) {
    return res.json({
      ok: true,
      service: 'btc-bot-v1-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development',
      hasAlertState: false,
      alertUpdatedAt: null
    });
  }
});

app.use('/market', marketRoutes);

app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/market') || req.path === '/health') {
    return res.status(404).json({
      ok: false,
      error: 'Route not found'
    });
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});