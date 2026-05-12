import { readFile, writeFile } from 'fs/promises';
import { logger } from '../utils/logger.js';

const ALERT_STATE_FILE = './alert-state.json';

export async function shouldSendAlert(currentSignal) {
  try {
    const data = await readFile(ALERT_STATE_FILE, 'utf8');
    const lastState = JSON.parse(data);

    const changed =
      lastState.bias !== currentSignal.bias ||
      Math.abs(lastState.confidence - currentSignal.confidence) >= 5;

    if (!changed) {
      logger.info(
        {
          current: currentSignal.bias,
          last: lastState.bias,
          currentConf: currentSignal.confidence,
          lastConf: lastState.confidence
        },
        'Signal não mudou o suficiente, pulando alerta'
      );
      return false;
    }

    await writeFile(ALERT_STATE_FILE, JSON.stringify(currentSignal, null, 2));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeFile(ALERT_STATE_FILE, JSON.stringify(currentSignal, null, 2));
      return true;
    }

    logger.error({ error: error.message }, 'Erro no alert manager');
    return false;
  }
}