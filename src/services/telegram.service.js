const fetch = require('node-fetch');



const enviarMensagemTelegram = async (chatId, text, replyMarkup = null) =>{
    const { TELEGRAM_BOT_TOKEN } = process.env;
    if (!TELEGRAM_BOT_TOKEN) return;

      const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      try {
        await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: text, 
            parse_mode: 'Markdown',
            reply_markup: replyMarkup 
          })
        });
      } catch (error) {
        console.error("[TELEGRAM] Erro ao enviar mensagem:", error);
      }

}

const editarMensagemTelegram = async (chatId, messageId, text) =>{
    const { TELEGRAM_BOT_TOKEN} = process.env;
    if(!TELEGRAM_BOT_TOKEN) return;

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
        try {
            await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text: text,
                    parse_mode: 'Markdown'
                    // Não enviamos 'reply_markup' para que os botões desapareçam
                })
            });
            console.log(`[TELEGRAM] Mensagem ${messageId} editada com sucesso.`);
        } catch (error) {
            console.error("[TELEGRAM] Erro ao editar mensagem:", error);
        }

}


module.exports = {enviarMensagemTelegram, editarMensagemTelegram}