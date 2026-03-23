const { db, admin } = require('../config/firebase');

const buscarKpis = async (userId) =>{
    const entregadoresSnap = await db.collection('entregadores').where('userId', '==', userId).get();
    const totalEntregadores = entregadoresSnap.size;

    const jornadasSnap = await db.collection('jornadas')
      .where('userId', '==', userId)
      .where('status', '==', 'finalizada')
      .orderBy('dataFim', 'desc')
      .limit(1)
      .get();
     
    if (jornadasSnap.empty) return{
        totalEntregadores,
        valorRecebido: 0,
        porcentagemEntregasConcluidas: 0,
        tempoMedioEntrega: '—'
    };



     const ultimaJornadaId = jornadasSnap.docs[0].id;
     const entregasSnap = await db.collection('entregas')
      .where('jornadaId', '==', ultimaJornadaId)
      .get();


    let valorRecebido = 0;
    let entregasConcluidasCount = 0;
    let totalEntregas = entregasSnap.size;
    let tempos = [];

    entregasSnap.forEach(doc => {
      const data = doc.data();
      
      if (data.status === 'Concluída') {
        entregasConcluidasCount++;
        valorRecebido += parseFloat(data.valorCobrar || 0);
        
      
        if (data.createdAt && data.updatedAt &&
            typeof data.createdAt.toDate === 'function' &&
            typeof data.updatedAt.toDate === 'function') {
          const tempoEmMinutos = (data.updatedAt.toDate().getTime() - data.createdAt.toDate().getTime()) / 60000;
          tempos.push(tempoEmMinutos);
        }
      }
    });


    const porcentagemEntregasConcluidas = totalEntregas > 0 
      ? Math.round((entregasConcluidasCount / totalEntregas) * 100) 
      : 0;

    
    let tempoMedioEntrega = '—';
    if (tempos.length > 0) {
      const mediaMins = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
      
      if (mediaMins < 60) {
        tempoMedioEntrega = `${mediaMins} min`;
      } else {
        const horas = Math.floor(mediaMins / 60);
        const minutos = mediaMins % 60;
        tempoMedioEntrega = `${horas}h ${minutos}min`;
      }
    }



    return {
        totalEntregadores,
        valorRecebido,
        porcentagemEntregasConcluidas,
        tempoMedioEntrega}

}



module.exports = { buscarKpis };