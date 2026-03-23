const express = require('express');
const app = express ();
const entregadoresRouter = require('./src/routes/entregadores.routes');
const jornadasRouter = require ('./src/routes/jornadas.routes')
const kpisRouter = require ('./src/routes/kpis.routes')
const cors = require('cors');

app.use(cors());
app.use(express.json());

app.use('/api/entregadores', entregadoresRouter);
app.use('/api/jornadas', jornadasRouter);
app.use('/api/kpis',kpisRouter)

module.exports = app;