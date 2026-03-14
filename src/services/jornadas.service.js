const { db, admin } = require('../config/firebase');

const deletarJornada = async (id) => {
    await db.collection('jornadas').doc(id).delete();
}

const historicoJornada = async(id) => {
    const snapshot = await db.collection('jornadas')
    .where ("userId", "==", id)
    .where("status", "==", "finalizada")
    .get();

    if(snapshot.empty) return [];

  return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            ...data,
            dataInicio: data.dataInicio ? data.dataInicio.toDate().toISOString() : null,
            dataFim: data.dataFim ? data.dataFim.toDate().toISOString() : null
        };
    });
}


const detalhesJornada = async (id) => {
  const jornadaDoc=  await db.collection('jornadas').doc(id).get();
    if (!jornadaDoc.exists) return null;

  const idsEntregadores = jornadaDoc.data().entregadoresIds || [];
    let entregadores = [];

  if (idsEntregadores.length > 0) {
    const snapshot = await db.collection('entregadores')
        .where(admin.firestore.FieldPath.documentId(), 'in', idsEntregadores)
        .get();
    
    entregadores = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
  const entregasRef = await db.collection('entregas')
    .where("jornadaId", "==", id)
    .get();

    const entregas = entregasRef.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  const eventosSnapshot = await db.collection('jornadas')
      .doc(id)
      .collection('eventos')
      .get();

  const eventos = eventosSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  return {
    id: jornadaDoc.id,
    ...jornadaDoc.data(),
    entregadores,
    entregas,
    eventos
  };

}

const finalizarJornada = async (id) => {
    const jornadaRef = db.collection('jornadas').doc(id);
    const jornadaDoc = await jornadaRef.get();
    if (!jornadaDoc.exists) return null;

    const entregasSnapshot = await db.collection('entregas')
        .where("jornadaId", "==", id)
        .get();

    let totalEntregas = entregasSnapshot.docs.length;
    let concluidas = 0;
    let falhas = 0;

    entregasSnapshot.docs.forEach(doc => {
        const status = doc.data().status;
        if (status === 'Concluída') concluidas++;
        else if (status === 'Falhou') falhas++;
    });

    const resumo = {
        totalEntregas,
        concluidas,
        falhas,
        taxaSucesso: totalEntregas > 0 ? ((concluidas / totalEntregas) * 100).toFixed(1) : "0.0"
    };

    await jornadaRef.update({
        status: "finalizada",
        dataFim: admin.firestore.FieldValue.serverTimestamp(),
        resumo: resumo
    });

    return resumo;
}



const buscaJornadaAtiva = async (userId) => {
    const jornadaSnapshot = await db.collection('jornadas')
    .where("userId", "==", userId)
    .where("status", "==", "ativa")
    .get();

    if(jornadaSnapshot.empty) return null;

    const jornadaDoc = jornadaSnapshot.docs[0];
    const jornadaId = jornadaDoc.id;
    const jornadaData = jornadaDoc.data();
    const idsEntregadoresAtivos = jornadaData.entregadoresIds || [];
    if (idsEntregadoresAtivos.length === 0) return null;

    const entregadoresSnapshot = await db.collection('entregadores')
    .where(admin.firestore.FieldPath.documentId(), 'in', idsEntregadoresAtivos)
    .get();

    const entregadoresAtivos = entregadoresSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

   const entregasSnapshot = await db.collection('entregas')
    .where("jornadaId", "==", jornadaId)
    .get();
    const entregasAtivas = entregasSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));

  return {entregadoresAtivos, entregasAtivas };

}


module.exports ={deletarJornada, historicoJornada, detalhesJornada,finalizarJornada,buscaJornadaAtiva}












