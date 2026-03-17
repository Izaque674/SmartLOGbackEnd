const express = require('express');
const app = express ();
const entregadoresRouter = require('./src/routes/entregadores.routes');
const jornadasRouter = require ('./src/routes/jornadas.routes')
const cors = require('cors');

app.use(cors());
app.use(express.json());

app.use('/api/entregadores', entregadoresRouter);
app.use('/api/jornadas', jornadasRouter);

module.exports = app;