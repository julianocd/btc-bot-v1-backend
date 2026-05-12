import { env } from '../config/env.js';

export async function sendTelegramMessage(text) {
  if (!env.telegramBotToken || !env.telegramChatId) {
    throw new Error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado');
  }

  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: env.telegramChatId,
      text
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.description || 'Erro ao enviar mensagem para o Telegram');
  }

  return data;
}