const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegram.controller')


router.post ('/telegram', telegramController.telegramController);

module.exports = router;