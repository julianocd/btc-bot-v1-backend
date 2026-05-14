import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import marketRoutes from './routes/market.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const publicDir = path.resolve(__dirname, '../public');
const indexFile = path.resolve(publicDir, 'index.html');

app.use(cors());
app.use(express.json());

app.use(express.static(publicDir));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString()
  });
});

app.use('/market', marketRoutes);

app.get('/', (_req, res) => {
  res.sendFile(indexFile);
});

export default app;