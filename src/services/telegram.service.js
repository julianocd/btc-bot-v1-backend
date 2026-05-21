export async function sendTelegramMessage(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('❌ TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado');
    throw new Error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurado');
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: message,
    // parse_mode removido para evitar problemas com caracteres especiais
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!data.ok) {
      console.error(`❌ Telegram API error: ${data.description}`);
      throw new Error(data.description);
    }
    console.log('✅ Mensagem enviada ao Telegram com sucesso');
    return data;
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem Telegram:', error.message);
    throw error;
  }
}