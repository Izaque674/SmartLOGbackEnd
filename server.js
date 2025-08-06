require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const DB_PATH = path.join(__dirname, 'database.json');

// --- Funções de Leitura/Escrita do DB ---
const readDatabase = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const writeDatabase = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// =======================================================
// === O RASTREADOR DE ENTREGAS ATIVAS ===
// =======================================================
// Este objeto guardará o último ID de entrega enviado para cada número.
let ultimaEntregaAtiva = {};

// --- Endpoints da API ---

app.get('/api/dados', (req, res) => {
  const data = readDatabase();
  res.json(data);
});

app.post('/api/entregas', (req, res) => {
  const { cliente, endereco, pedido, entregadorId } = req.body;
  
  const db = readDatabase();
  const entregador = db.entregadores.find(e => e.id === entregadorId);

  if (!entregador) return res.status(404).send('Entregador não encontrado.');

  const novaEntrega = { id: Date.now(), cliente, endereco, pedido, status: 'Em Trânsito', entregadorId };
  
  db.entregas.push(novaEntrega);
  writeDatabase(db);
  console.log(`[DB] Nova entrega ${novaEntrega.id} salva.`);

  client.messages.create({
    contentSid: 'HX87711f56a3448a789d964b94573b92a1', // SEU SID AQUI
    contentVariables: JSON.stringify({ '1': novaEntrega.pedido, '2': novaEntrega.cliente, '3': novaEntrega.endereco }),
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: `whatsapp:${entregador.whatsapp}`
  })
    .then(message => {
      // =======================================================
      // === REGISTRAMOS A ENTREGA QUE ACABOU DE SER ENVIADA ===
      // =======================================================
      ultimaEntregaAtiva[entregador.whatsapp] = novaEntrega.id;
      console.log(`[RASTREADOR] Ativada entrega ${novaEntrega.id} para ${entregador.whatsapp}`);
      
      console.log('Mensagem com TEMPLATE enviada com SID:', message.sid);
      res.status(201).json(novaEntrega);
    })
    .catch(err => { console.error('Erro no Twilio:', err); res.status(500).send('Erro no Twilio.'); });
});

app.post('/api/webhook/whatsapp', (req, res) => {
  const { From, Body } = req.body;
  const numeroEntregador = From.replace('whatsapp:', '');

  console.log(`Webhook de ${numeroEntregador}: "${Body}"`);
  
  // =======================================================
  // === USAMOS O RASTREADOR PARA ACHAR A ENTREGA CORRETA ===
  // =======================================================
  const entregaIdAtiva = ultimaEntregaAtiva[numeroEntregador];

  if (entregaIdAtiva) {
    const db = readDatabase();
    const entregaAlvo = db.entregas.find(e => e.id === entregaIdAtiva);
    
    if (entregaAlvo && entregaAlvo.status === 'Em Trânsito') {
      let novoStatus = Body.includes('Concluída') ? 'Concluída' : (Body.includes('Falhou') ? 'Falhou' : null);
      
      if (novoStatus) {
        const novasEntregas = db.entregas.map(e => 
          e.id === entregaIdAtiva ? { ...e, status: novoStatus } : e
        );
        writeDatabase({ ...db, entregas: novasEntregas });
        console.log(`[DB] Entrega ${entregaIdAtiva} atualizada para ${novoStatus}`);
        
        // Limpamos o rastreador, pois a entrega foi finalizada
        delete ultimaEntregaAtiva[numeroEntregador];
      }
    }
  } else {
    console.log(`[RASTREADOR] Nenhuma entrega ativa encontrada para ${numeroEntregador}`);
  }

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<Response/>');
});


const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});