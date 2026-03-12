const { db } = require('../config/firebase');



const criarEntregador = async (dados) => {

  return await db.collection ('entregadores').add(dados);

}


const alterarEntregador = async (id,dados) => {
    await db.collection ('entregadores').doc(id).update(dados);
}




const deletarEntregador = async (id) => {
    await db.collection('entregadores').doc(id).delete();
}


const buscarPorId = async(id) =>{
    const doc = await db.collection('entregadores').doc(id).get();
    return doc;
}


const listarEntregadores = async() =>{
    return await db.collection('entregadores').get();
}


module.exports = {criarEntregador, alterarEntregador, deletarEntregador, buscarPorId, listarEntregadores};



















