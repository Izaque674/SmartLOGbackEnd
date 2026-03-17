const express = require('express');
const router = express.Router();
const jornadasController = require('../controllers/jornadas.controller');


router.delete('/:id', jornadasController.deletarJornada);

router.post('/:id/finalizar', jornadasController.finalizarJornada);

router.get('/ativa/:userId', jornadasController.buscaJornadaAtiva);

router.get('/:id/detalhes', jornadasController.detalhesJornada);

router.get('/historico/:userId', jornadasController.historicoJornada);

module.exports = router;