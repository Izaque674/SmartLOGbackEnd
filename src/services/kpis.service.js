const { db, admin } = require('../config/firebase');

const buscarKpis = async (userId) =>{
    const totalEntregadores = await db.collection('entregadores').where('userId', '==', userId).get();

}