require('dotenv').config(); // Carrega as variáveis do arquivo .env
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const app = express();
app.use(cors()); // Permite requisições do nosso frontend
app.use(express.json()); // Permite que o servidor entenda JSON

// --- Credenciais do Twilio ---
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER;
const client = twilio(accountSid, authToken);

console.log("--- INICIANDO BACKEND COM AS SEGUINTES CREDENCIAIS ---");
console.log(`ACCOUNT SID USADO: ${accountSid}`);
console.log("---------------------------------------------------------");
// ...

// --- "Banco de Dados" em Memória (para simulação) ---
let { entregadoresIniciais, entregasIniciais } = require('./data.js'); // Usaremos seu data.js
let entregas = [...entregasIniciais];
let entregadores = [...entregadoresIniciais];

// --- Endpoints da API ---

// Rota para o frontend pegar todos os dados iniciais
app.get('/api/dados', (req, res) => {
  res.json({ entregas, entregadores });
});

// Rota para o frontend adicionar uma nova entrega
app.post('/api/entregas', (req, res) => {
  const { cliente, endereco, pedido, entregadorId } = req.body;
  const entregador = entregadores.find(e => e.id === entregadorId);

  if (!entregador) {
    return res.status(404).send('Entregador não encontrado.');
  }

  // 1. Adicionar a entrega ao nosso "banco de dados"
  const novaEntrega = {
    id: Date.now(),
    cliente,
    endereco,
    pedido,
    status: 'Em Trânsito',
    entregadorId,
  };
  entregas.push(novaEntrega);

  // 2. Preparar e enviar a mensagem via Twilio
  const mensagem = `Nova entrega para você!\n\n*Pedido:* ${pedido}\n*Cliente:* ${cliente}\n*Endereço:* ${endereco}`;
  
  client.messages
    .create({
      body: mensagem,
      from: twilioNumber,
      to: 'whatsapp:+554284252941' 
    })
    .then(message => {
      console.log('Mensagem enviada com SID:', message.sid);
      // Retorna a nova entrega para o frontend
      res.status(201).json(novaEntrega);
    })
    .catch(err => {
      console.error('Erro ao enviar mensagem via Twilio:', err);
      res.status(500).send('Erro ao contatar a API do Twilio.');
    });
});

// --- Iniciar o Servidor ---
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});