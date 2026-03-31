const { db, admin } = require('../config/firebase');
const telegramService = require('./telegram.service');

const criarEntregas = async (dados) => {
   const { cliente, endereco, pedido, entregadorId, tipo, valorCobrar } = dados;

    const entregadorDoc = await db.collection('entregadores').doc(entregadorId).get();
    if (!entregadorDoc.exists) throw new Error('Entregador não encontrado');


    const entregador = entregadorDoc.data();
    const jornadas = await db.collection('jornadas').where("userId", "==", entregador.userId).where("status", "==", "ativa").get();
   if (jornadas.empty) throw new Error('Nenhuma jornada ativa');

   

        const jornadaId = jornadas.docs[0].id;
        const novaEntrega = {
          cliente, 
          endereco, 
          pedido, 
          status: 'Em Trânsito',
          entregadorId, 
          userId: entregador.userId, 
          jornadaId,
          tipo: tipo || 'Entrega', 
          valorCobrar: valorCobrar || 0, 
          createdAt: admin.firestore.FieldValue.serverTimestamp(),

    
        }

        const docRef = await db.collection('entregas').add(novaEntrega);
        const { TELEGRAM_CHAT_ID } = process.env;


let text = `*Nova ${novaEntrega.tipo} para ${cliente}!*\n\n*Endereço:* ${endereco}\n*observação:* ${pedido}`;
if (novaEntrega.valorCobrar > 0) {
    text += `\n\n*Atenção:* Cobrar R$ ${novaEntrega.valorCobrar.toFixed(2).replace('.', ',')}`;
}


const replyMarkup = {
    inline_keyboard: [
        [
            { text: "✅ Concluída", callback_data: `update_${docRef.id}_concluida` },
            { text: "❌ Falhou", callback_data: `update_${docRef.id}_falhou` }
        ],
        [
            { text: "📝 Adicionar Observação/ foto 📸", callback_data: `obs_${docRef.id}` }
        ]
    ]
};

await telegramService.enviarMensagemTelegram(TELEGRAM_CHAT_ID, text, replyMarkup);
return { id: docRef.id, ...novaEntrega };
        

}



const atualizarStatus = async (id, status) => {
    const entregaRef = db.collection('entregas').doc(id);
    const entregaDoc = await entregaRef.get();
    if (!entregaDoc.exists) return null;

    await entregaRef.update({ 
        status, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    });


    const entregaData = entregaDoc.data();
    const entregadorDoc = await db.collection('entregadores').doc(entregaData.entregadorId).get();
    const nomeEntregador = entregadorDoc.exists ? entregadorDoc.data().nome : 'Desconhecido';


    if (entregaData.jornadaId) {
        await db.collection('jornadas').doc(entregaData.jornadaId).collection('eventos').add({
            tipo: 'STATUS',
            texto: `Gestor alterou status da entrega "${entregaData.pedido}" para ${status}.`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            entregaId: id,
            novoStatus: status
        });
    }
    return { id, status };
}


module.exports= {criarEntregas, atualizarStatus}