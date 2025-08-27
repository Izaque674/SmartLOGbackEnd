require('dotenv').config();

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const admin = require('firebase-admin');

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  console.error("ERRO FATAL: Credenciais do Twilio não encontradas.");
  process.exit(1);
}
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

let ultimaEntregaAtiva = {};

app.get('/api/dados', async (req, res) => {
  try {
    const entregadoresSnapshot = await db.collection('entregadores').get();
    const entregasSnapshot = await db.collection('entregas').get();
    const entregadores = entregadoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const entregas = entregasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ entregadores, entregas });
  } catch (error) {
    console.error("Erro ao buscar dados do Firestore:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.get('/api/operacao/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const jornadasRef = db.collection('jornadas');
    const qJornada = jornadasRef.where("userId", "==", userId).where("status", "==", "ativa");
    const jornadaSnapshot = await qJornada.get();
    if (jornadaSnapshot.empty) {
      return res.json({ entregadoresAtivos: [], entregasAtivas: [] });
    }
    const jornada = jornadaSnapshot.docs[0].data();
    const jornadaId = jornadaSnapshot.docs[0].id;
    const idsEntregadoresAtivos = jornada.entregadoresIds || [];
    if (idsEntregadoresAtivos.length === 0) {
      return res.json({ entregadoresAtivos: [], entregasAtivas: [] });
    }
    const entregadoresRef = db.collection('entregadores');
    const qEntregadores = entregadoresRef.where(admin.firestore.FieldPath.documentId(), 'in', idsEntregadoresAtivos);
    const entregadoresSnapshot = await qEntregadores.get();
    const entregadoresAtivos = entregadoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const entregasRef = db.collection('entregas');
    const qEntregas = entregasRef.where("jornadaId", "==", jornadaId);
    const entregasSnapshot = await qEntregas.get();
    const entregasAtivas = entregasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ entregadoresAtivos, entregasAtivas });
  } catch (error) {
    console.error("Erro ao buscar dados da operação:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.post('/api/entregas', async (req, res) => {
  const { cliente, endereco, pedido, entregadorId } = req.body;
  try {
    const entregadorRef = db.collection('entregadores').doc(entregadorId);
    const entregadorDoc = await entregadorRef.get();

    // --- CORREÇÃO AQUI ---
    if (!entregadorDoc.exists) { // .exists é uma propriedade, não uma função
      return res.status(404).send('Entregador não encontrado.');
    }
    
    const entregador = entregadorDoc.data();
    if (!entregador.userId) return res.status(500).send('Erro: Entregador sem userId.');
    
    const numeroDeTeste = process.env.MY_VERIFIED_NUMBER;
    if (!numeroDeTeste) return res.status(500).send('Erro: MY_VERIFIED_NUMBER não definido.');

    const jornadasRef = db.collection('jornadas');
    const q = jornadasRef.where("userId", "==", entregador.userId).where("status", "==", "ativa");
    const jornadasSnapshot = await q.get();
    if (jornadasSnapshot.empty) {
      return res.status(400).send('Nenhuma jornada ativa encontrada.');
    }
    const jornadaAtivaId = jornadasSnapshot.docs[0].id;

    const novaEntrega = { 
      cliente, endereco, pedido, status: 'Em Trânsito', 
      entregadorId, userId: entregador.userId, jornadaId: jornadaAtivaId
    };
    
    const docRef = await db.collection('entregas').add(novaEntrega);
    const novaEntregaComId = { id: docRef.id, ...novaEntrega };
    
    console.log(`[DB] Nova entrega ${docRef.id} salva para a jornada ${jornadaAtivaId}.`);

    const CONTENT_SID = 'HX54374ce3e36b6bffa76dfe61c3522f3b';

    await client.messages.create({
      contentSid: CONTENT_SID,
      contentVariables: JSON.stringify({ '1': novaEntrega.pedido, '2': novaEntrega.cliente, '3': novaEntrega.endereco }),
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${numeroDeTeste}`
    });

    console.log(`[TWILIO-SUCCESS] Mensagem enviada para: ${numeroDeTeste}`);
    
    if (entregador.whatsapp) {
      ultimaEntregaAtiva[entregador.whatsapp] = novaEntregaComId.id;
    }

    res.status(201).json(novaEntregaComId);
  } catch (error) {
    console.error('ERRO GERAL no /api/entregas:', error);
    res.status(500).send("Ocorreu um erro no servidor.");
  }
});

app.post('/api/webhook/whatsapp', async (req, res) => {
  const { From, Body } = req.body;
  if (!From || !Body) return res.status(400).send('Inválido.');
  const numeroEntregador = From.replace('whatsapp:', '');
  const textoResposta = Body.trim().toLowerCase();
  
  const entregaIdAtiva = ultimaEntregaAtiva[numeroEntregador];
  if (entregaIdAtiva) {
    const entregaRef = db.collection('entregas').doc(entregaIdAtiva);
    const entregaDoc = await entregaRef.get();
    
    // --- CORREÇÃO AQUI ---
    if (entregaDoc.exists && entregaDoc.data().status === 'Em Trânsito') { // .exists é uma propriedade
      let novoStatus = null;
      if (textoResposta.includes('concluída')) novoStatus = 'Concluída';
      else if (textoResposta.includes('falhou')) novoStatus = 'Falhou';
      
      if (novoStatus) {
        await entregaRef.update({ status: novoStatus });
        delete ultimaEntregaAtiva[numeroEntregador];
      }
    }
  }
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send('<Response/>');
});

// Endpoints CRUD de Entregadores
app.post('/api/entregadores', async (req, res) => {
  const { nome, telefone, veiculo, rota, userId } = req.body;
  if (!nome || !userId) return res.status(400).send('Dados incompletos.');
  try {
    const docRef = await db.collection('entregadores').add({ nome, telefone, veiculo, rota, userId });
    res.status(201).json({ id: docRef.id, ...req.body });
  } catch (error) {
    res.status(500).send("Erro ao criar.");
  }
});

app.put('/api/entregadores/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, veiculo, rota } = req.body;
  try {
    const entregadorRef = db.collection('entregadores').doc(id);
    await entregadorRef.update({ nome, telefone, veiculo, rota });
    res.status(200).json({ id, ...req.body });
  } catch (error) {
    res.status(500).send("Erro ao atualizar.");
  }
});

app.delete('/api/entregadores/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('entregadores').doc(id).delete();
    res.status(204).send();
  } catch (error) {
    res.status(500).send("Erro ao deletar.");
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});