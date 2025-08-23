// ...existing code...
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('serviceAccountKey.json não encontrado. Coloque o arquivo localmente ou use variáveis de ambiente.');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_NUMBER) {
  console.error("Credenciais Twilio faltando. Verifique variáveis de ambiente.");
  process.exit(1);
}
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

let ultimaEntregaAtiva = {}; // rastreador numero -> entregaId

app.get('/api/dados', async (req, res) => {
  try {
    const entregadoresSnapshot = await db.collection('entregadores').get();
    const entregasSnapshot = await db.collection('entregas').get();
    const entregadores = entregadoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const entregas = entregasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ entregadores, entregas });
  } catch (error) {
    console.error("Erro ao buscar dados:", error);
    res.status(500).send("Erro interno.");
  }
});

app.get('/api/operacao/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const jornadasRef = db.collection('jornadas');
    const qJornada = jornadasRef.where("userId", "==", userId).where("status", "==", "ativa");
    const jornadaSnapshot = await qJornada.get();

    if (jornadaSnapshot.empty) return res.json({ entregadoresAtivos: [], entregasAtivas: [] });

    const jornadaId = jornadaSnapshot.docs[0].id;
    const jornadaData = jornadaSnapshot.docs[0].data();
    const idsEntregadoresAtivos = jornadaData.entregadoresIds || [];

    if (idsEntregadoresAtivos.length === 0) return res.json({ entregadoresAtivos: [], entregasAtivas: [] });

    const chunks = [];
    for (let i = 0; i < idsEntregadoresAtivos.length; i += 10) {
      chunks.push(idsEntregadoresAtivos.slice(i, i + 10));
    }

    const entregadoresAtivos = [];
    for (const chunk of chunks) {
      const qEnt = db.collection('entregadores').where(admin.firestore.FieldPath.documentId(), 'in', chunk);
      const snap = await qEnt.get();
      snap.docs.forEach(d => entregadoresAtivos.push({ id: d.id, ...d.data() }));
    }

    const entregasSnap = await db.collection('entregas').where("jornadaId", "==", jornadaId).get();
    const entregasAtivas = entregasSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    res.json({ entregadoresAtivos, entregasAtivas });
  } catch (error) {
    console.error("Erro na operação:", error);
    res.status(500).send("Erro interno.");
  }
});

app.post('/api/entregas', async (req, res) => {
  const { cliente, endereco, pedido, entregadorId } = req.body;
  try {
    const entregadorDoc = await db.collection('entregadores').doc(entregadorId).get();
    if (!entregadorDoc.exists) return res.status(404).send('Entregador não encontrado.');

    const entregador = entregadorDoc.data();
    const jornadas = await db.collection('jornadas').where("userId", "==", entregador.userId).where("status", "==", "ativa").get();
    if (jornadas.empty) return res.status(400).send('Nenhuma jornada ativa.');

    const jornadaId = jornadas.docs[0].id;
    const nova = {
      cliente, endereco, pedido, status: 'Em Trânsito',
      entregadorId, userId: entregador.userId, jornadaId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db.collection('entregas').add(nova);

    const numeroTeste = process.env.MY_VERIFIED_NUMBER;
    const CONTENT_SID = process.env.TWILIO_CONTENT_SID || undefined;
    if (numeroTeste) {
      await client.messages.create({
        contentSid: CONTENT_SID,
        contentVariables: JSON.stringify({ '1': pedido, '2': cliente, '3': endereco }),
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${numeroTeste}`
      });
    }

    if (entregador.whatsapp) ultimaEntregaAtiva[entregador.whatsapp] = docRef.id;
    res.status(201).json({ id: docRef.id, ...nova });
  } catch (error) {
    console.error("Erro ao criar entrega:", error);
    res.status(500).send("Erro interno.");
  }
});

app.post('/api/webhook/whatsapp', async (req, res) => {
  try {
    const { From, Body } = req.body;
    if (!From || !Body) return res.status(400).send('Inválido');

    const numero = From.replace('whatsapp:', '');
    const texto = Body.trim().toLowerCase();
    const entregaId = ultimaEntregaAtiva[numero];
    if (entregaId) {
      const ref = db.collection('entregas').doc(entregaId);
      const doc = await ref.get();
      if (doc.exists && doc.data().status === 'Em Trânsito') {
        let novo = null;
        if (texto.includes('concluída') || texto.includes('concluida')) novo = 'Concluída';
        else if (texto.includes('falhou')) novo = 'Falhou';
        if (novo) await ref.update({ status: novo, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        delete ultimaEntregaAtiva[numero];
      }
    }

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response/>');
  } catch (error) {
    console.error("Erro webhook:", error);
    res.status(500).send('<Response/>');
  }
});

app.post('/api/entregadores', async (req, res) => {
  const { nome, telefone, veiculo, rota, userId } = req.body;
  if (!nome || !userId) return res.status(400).send('Dados incompletos');
  try {
    const docRef = await db.collection('entregadores').add({ nome, telefone, veiculo, rota, userId });
    res.status(201).json({ id: docRef.id, nome, telefone, veiculo, rota, userId });
  } catch (error) {
    console.error('Erro criar entregador:', error);
    res.status(500).send('Erro interno');
  }
});

app.put('/api/entregadores/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, veiculo, rota } = req.body;
  try {
    await db.collection('entregadores').doc(id).update({ nome, telefone, veiculo, rota });
    res.status(200).json({ id, nome, telefone, veiculo, rota });
  } catch (error) {
    console.error('Erro atualizar entregador:', error);
    res.status(500).send('Erro interno');
  }
});

app.delete('/api/entregadores/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('entregadores').doc(id).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Erro deletar entregador:', error);
    res.status(500).send('Erro interno');
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));
// ...existing code...