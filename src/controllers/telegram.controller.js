const telegramService = require('../services/telegram.service');
const entregasService = require('../services/entregas.service');

const telegramController = async (req, res) => {
    try {
        if (req.body.callback_query) {
            const callbackQuery = req.body.callback_query;
            const callbackData = callbackQuery.data;
            const message = callbackQuery.message;
            const chatId = message.chat.id;
            const messageId = message.message_id;
            const originalText = message.text;

            if (callbackData.startsWith('update_')) {
                const parts = callbackData.split('_');
                const entregaId = parts[1];
                const novoStatus = parts[2] === 'concluida' ? 'Concluída' : 'Falhou';

                await entregasService.atualizarStatus(entregaId, novoStatus);

                const emoji = novoStatus === 'Concluída' ? '✅' : '❌';
                const newText = `${originalText}\n\n*Status atualizado para: ${novoStatus} ${emoji}*`;
                await telegramService.editarMensagemTelegram(chatId, messageId, newText);

            } else if (callbackData.startsWith('obs_')) {
                const entregaId = callbackData.split('_')[1];

                await entregasService.atualizarStatus(entregaId, 'Concluída');

                const newText = `${originalText}\n\n*✅ Entrega Concluída com Observação.*\nPor favor, descreva o ocorrido abaixo e envie.`;
                await telegramService.editarMensagemTelegram(chatId, messageId, newText);
            }
        }

        res.sendStatus(200);

    } catch (error) {
        console.error("Erro no webhook do Telegram:", error);
        res.sendStatus(500);
    }
}

module.exports = { telegramController };