const express = require('express');
const router = express.Router();

const entregasController = require ('../controllers/entregas.controller');

router.post('/', entregasController.criarEntregas);

router.patch ('/:id/status' , entregasController.atualizarStatus);


module.exports = router;