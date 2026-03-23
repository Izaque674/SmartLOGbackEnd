const kpisService = require ('../services/kpis.service');

const buscarKpis = async (req, res)=>{
    const {userId} = req.params;

    if(!userId){
        return res.status(400).json({erro:'userId obrigatorio'});
    }

    try{    
        const dados = await kpisService.buscarKpis(userId);
        res.status(200).json(dados);

    }catch(error){
        console.error('erro ao buscar kpis');
        res.status(500).json({erro: 'erro interno'});

    }
    
}

module.exports = { buscarKpis };