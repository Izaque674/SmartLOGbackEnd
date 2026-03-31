const  entregasService = require ('../services/entregas.service')


const criarEntregas = async(req, res) =>{
     const dados = {cliente, endereco, pedido, entregadorId, tipo, valorCobrar} = req.body;
    
     if (!cliente || !endereco || !entregadorId){
        return res.status(400).json({erro:'dados obrigatorios: cliente, endereco e entregadorId'});
     }
     try{  
        const entrega = await entregasService.criarEntregas(dados)
        res.status(200).json(entrega);
     }catch (error){
        if (error.message === 'Entregador não encontrado') {
        return res.status(404).json({ erro: error.message });
    }
    if (error.message === 'Nenhuma jornada ativa') {
        return res.status(400).json({ erro: error.message });
    }

    res.status(500).json({ erro: 'erro interno' });
    }
}


const atualizarStatus = async (req,res) => {
    const {id} = req.params;
    const {status} = req.body;

    if(!id){
        return res.status(400).json({erro:'dados obrigatorios'})
    }
    if(!status){
        return res.status(400).json({erro:'dados obrigatorios'})
    }

    try{   
        const atualizado = await entregasService.atualizarStatus(id,status);
        res.status(200).json(atualizado);

    }catch(error){
        console.error('erro ao atualizar');
        res.status(500).json({erro: 'erro interno'});

    }
}


module.exports = {criarEntregas, atualizarStatus};