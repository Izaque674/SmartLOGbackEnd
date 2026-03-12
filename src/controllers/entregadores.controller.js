const entregadoresService = require('../services/entregadores.service');

const criarEntregador = async (req , res) => {
    const {nome, telefone, veiculo, rota, userId, fotoUrl} = req.body;

    if (!nome || !userId){
        return res.status(400).json({ erro: 'dados incompletos'});

    }
    try{
     const dados = {nome, telefone, veiculo, rota, userId, fotoUrl};
    const docRef = await entregadoresService.criarEntregador(dados);
    res.status(201).json({ id: docRef.id, ...dados });

    }catch(error){      
        console.error('Erro ao criar entregador:', error);
        res.status(500).json({erro:'erro interno'});

    }

}



const alterarEntregador = async(req,res) => {
    const {id} = req.params;
    const {nome, telefone, veiculo, rota, userId, fotoUrl} = req.body;


        if (!nome || !userId){
        return res.status(400).json({ erro: 'dados incompletos'});
     }
    try {
        const dados = { nome, telefone, veiculo, rota, fotoUrl };
        await entregadoresService.alterarEntregador(id, dados);
        res.status(200).json({ id, ...req.body });
    }

   catch (error) {
    console.error('Erro ao atualizar entregador:', error);
    res.status(500).json({erro:'erro interno'});
  }

}



const deletarEntregador = async(req,res) => {
    const {id} = req.params;
    try {
        await entregadoresService.deletarEntregador(id);
        res.status(200).json({mensagem:'Entregador deletado'});
    }

    catch (error) {
        console.error('Erro ao deletar entregador',error);
        res.status(500).json({erro:'erro interno'});

    }

}




const buscarPorId = async(req,res) => {
    const {id} = req.params;
    if (!id){
        return res.status(400).json({ erro: 'Entregador nao localizado'});
    }

    try{
        const doc = await entregadoresService.buscarPorId(id);
        if (!doc.exists) {
            return res.status(404).json({ erro: 'Entregador não encontrado' });
        }
        res.status(200).json({ id: doc.id, ...doc.data() });
        
    } catch(error){
        console.error('Erro ao buscar entregador',error);
        res.status(500).json({erro:'erro interno'});

    }
}

const listarEntregadores = async (req, res)=>{ 
    try{
        const snapshot = await entregadoresService.listarEntregadores();
        const entregadores = snapshot.docs.map(doc =>({
            id: doc.id,
            ...doc.data()
        }));
        res.status(200).json(entregadores);

    } catch(error) {
        console.error('erro ao listar entregadores',error);
        res.status(500).json ({erro: 'erro interno' })
    }


}


module.exports =  {criarEntregador, alterarEntregador, deletarEntregador, buscarPorId, listarEntregadores};









