const express = require('express');
const router = express.Router();
const entregadoresController = require('../controllers/entregadores.controller');


router.get('/:id', entregadoresController.buscarPorId);

router.post('/', entregadoresController.criarEntregador);

router.put('/:id',entregadoresController.alterarEntregador);

router.delete('/:id', entregadoresController.deletarEntregador);

router.get('/', entregadoresController.listarEntregadores);

module.exports = router;