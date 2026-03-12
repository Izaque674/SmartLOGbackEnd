const express = require('express');
const app = express ();
const entregadoresRouter = require('./src/routes/entregadores.routes');
const cors = require('cors');

app.use(cors());
app.use(express.json());

app.use('/api/entregadores', entregadoresRouter);

module.exports = app;