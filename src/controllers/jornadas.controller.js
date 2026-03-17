const jornadasService =  require ('../services/jornadas.service');


const deletarJornada = async (req, res) => {
    const {id} = req.params;
        try {
            await jornadasService.deletarJornada(id);
            res.status(200).json({mensagem:'jornada deletada'});
        }
    
        catch (error) {
            console.error('Erro ao deletar jornada',error);
            res.status(500).json({erro:'erro interno'});
    
        } 
}


const historicoJornada = async(req, res) => {
    const {userId} = req.params;

    if(!userId){
        return res.status(400).json({erro:'userId obrigatorio'});
    }
    try{
        const historico = await jornadasService.historicoJornada(userId);
        res.status(200).json(historico);


    }catch(error){
        console.error('erro ao buscar jornadas');
        res.status(500).json({erro: 'erro interno'});

    }
}



const detalhesJornada = async (req, res) =>{
    const {id} = req.params;
        if(!id){
        return res.status(400).json({erro:'jornada nao encontrada'});
        }
        try{

            const detalhes = await jornadasService.detalhesJornada(id);
            if(!detalhes){
                return res.status(404).json ({erro: 'jornada nao encontrada'});
            }
            res.status(200).json(detalhes);
        }catch(error){
            console.error('erro ao buscar detalhes');
            res.status(500).json({erro: 'erro interno'});
        }
 }



 const buscaJornadaAtiva = async (req,res) => {
    const {userId} = req.params;
    if (!userId) {
        return res.status(400).json ({erro: 'usuario nao encontrado'});
    }
    try{   
        const jornadaAtiva = await jornadasService.buscaJornadaAtiva(userId);
        if (!jornadaAtiva){
            return res.status(404).json ({erro : ' jornada ativa nao encontrada '});
        }
        res.status(200).json(jornadaAtiva);

    }catch(erro){
          console.error('erro ao buscar jornada ativa');
            res.status(500).json({erro: 'erro interno'});

    }
    
 }


 const finalizarJornada = async (req, res) => {
    const {id} = req.params;
    if (!id){
        return res.status(400).json ({erro: 'jornada nao encontrado'});
    }
        try {
            const resumo = await jornadasService.finalizarJornada(id);

            if (!resumo){
                return res.status(404).json ({erro : 'jornada nao finalizada'});
            }
            res.status(200).json(resumo);
        }
    
        catch (error) {
            console.error('Erro ao finalizar jornada',error);
            res.status(500).json({erro:'erro interno'});
    
        } 
}


module.exports = {deletarJornada, buscaJornadaAtiva, detalhesJornada, finalizarJornada, historicoJornada}




