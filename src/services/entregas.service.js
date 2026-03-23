const { db, admin } = require('../config/firebase');

const criarEntregas = async (userID) => {
    const entregadorDoc = await db.collection('entregadores').doc(entregadorId).get();
    if (!entregadorDoc.exists) return res.status(404).send('Entregador não encontrado.');


    const entregador = entregadorDoc.data();
    const jornadas = await db.collection('jornadas').where("userId", "==", entregador.userId).where("status", "==", "ativa").get();
    if (jornadas.empty) return res.status(400).send('Nenhuma jornada ativa.');

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

}