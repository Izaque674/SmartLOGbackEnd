const express = require('express');
const router = express.Router();
const kpisController = require ('../controllers/kpis.controller');

router.get('/:userId',kpisController.buscarKpis);

module.exports = router;