import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import cron from 'node-cron';

const baseUrl = `http://localhost:${env.port}`;

cron.schedule('*/5 * * * *', async () => {
  try {
    const response = await fetch(`${baseUrl}/market/alert-signal`, {
      method: 'POST'
    });

    const data = await response.json();
    logger.info({ data }, 'Scheduled market alert executed');
  } catch (error) {
    logger.error({ error: error.message }, 'Scheduled market alert failed');
  }
});

app.listen(env.port, () => {
  logger.info(`Server running on http://localhost:${env.port}`);
});