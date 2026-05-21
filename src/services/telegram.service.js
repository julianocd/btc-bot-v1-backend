import { env } from '../config/env.js';

export async function sendTelegramMessage(message) {
  console.log('🔍 Token carregado?', !!env.telegramBotToken);
  console.log('🔍 ChatId carregado?', !!env.telegramChatId);
  
  const token = env.telegramBotToken;
  const chatId = env.telegramChatId;
  
  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado');
    throw new Error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado');
  }
  
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    
    const data = await response.json();
    if (!data.ok) throw new Error(data.description);
    return data;
  } catch (error) {
    console.error('Erro ao enviar mensagem Telegram:', error.message);
    throw error;
  }
}