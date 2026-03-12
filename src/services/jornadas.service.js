const { db } = require('../config/firebase');

const deletarJornada = async (id) => {
    await db.collection('jornadas').doc(id).delete();
}

const historicoJornada = async(id) => {
    const snapshot = await db.collection('jornadas')
    .where ("userId", "==", userId)
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

    const entregadoresRef = await db.collection('entregadores').doc(id).get();


      
    
}















app.get('/api/jornadas/historico/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const jornadasRef = db.collection('jornadas');
    const q = jornadasRef
      .where("userId", "==", userId)
      .where("status", "==", "finalizada");
    
    const snapshot = await q.get();

    if (snapshot.empty) {
      return res.json([]);
    }

    let historico = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        dataInicio: data.dataInicio ? data.dataInicio.toDate().toISOString() : null,
        dataFim: data.dataFim ? data.dataFim.toDate().toISOString() : null
      };
    });

    historico.sort((a, b) => new Date(b.dataFim) - new Date(a.dataFim));

    res.status(200).json(historico);

  } catch (error) {
    console.error("Erro ao buscar histórico de jornadas:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});
