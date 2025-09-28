// --- INÍCIO DO ARQUIVO server.js ---

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch'); // Usaremos para a API do Telegram

// Inicialização do Firebase (sem alterações)
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('ERRO FATAL: serviceAccountKey.json não encontrado.');
  process.exit(1);
}
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

// Inicialização do Express (sem alterações)
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// --- ROTA PRINCIPAL PARA CRIAR ENTREGAS E ENVIAR MENSAGEM ---
app.post('/api/entregas', async (req, res) => {
  const { cliente, endereco, pedido, entregadorId } = req.body;
  try {
    // Lógica do Firebase para criar a entrega (sem alterações)
    const entregadorDoc = await db.collection('entregadores').doc(entregadorId).get();
    if (!entregadorDoc.exists) return res.status(404).send('Entregador não encontrado.');

    const entregador = entregadorDoc.data();
    const jornadas = await db.collection('jornadas').where("userId", "==", entregador.userId).where("status", "==", "ativa").get();
    if (jornadas.empty) return res.status(400).send('Nenhuma jornada ativa.');

    const jornadaId = jornadas.docs[0].id;
    const novaEntrega = {
      cliente, endereco, pedido, status: 'Em Trânsito',
      entregadorId, userId: entregador.userId, jornadaId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('entregas').add(novaEntrega);

    await db.collection('jornadas').doc(jornadaId).collection('eventos').add({
      tipo: 'CRIACAO',
      texto: `Entrega "${pedido || 'N/A'}" para "${cliente}" atribuída a ${entregador.nome}.`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      entregaId: docRef.id
    });

    // --- SEÇÃO TELEGRAM BOT API ---
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const text = `*Nova entrega para ${cliente}!*\n\n*Pedido:* ${pedido}\n*Endereço:* ${endereco}`;

        try {
            console.log(`[TELEGRAM] Preparando envio para o Chat ID: ${TELEGRAM_CHAT_ID}`);

            const response = await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: text,
                    parse_mode: 'Markdown', // Permite usar *bold* e _italic_
                    reply_markup: {
                        inline_keyboard: [
                            [ // Primeira linha de botões
                                { text: "✅ Entrega Concluída", callback_data: `update_${docRef.id}_concluida` },
                                { text: "❌ Falha na Entrega", callback_data: `update_${docRef.id}_falhou` }
                            ]
                        ]
                    }
                })
            });
            const data = await response.json();
            if (response.ok) {
                console.log("[TELEGRAM] Mensagem enviada com sucesso!", data);
            } else {
                console.error("[TELEGRAM] Falha ao enviar mensagem:", data);
            }
        } catch (error) {
            console.error("[TELEGRAM] Erro crítico:", error.message);
        }
    } else {
        console.warn("[TELEGRAM] Envio não realizado. Verifique as variáveis de ambiente.");
    }
    
    res.status(201).json({ id: docRef.id, ...novaEntrega });
  } catch (error) {
    console.error("Erro ao criar entrega:", error.message);
    res.status(500).send("Erro interno do servidor.");
  }
});


// --- WEBHOOK PARA RECEBER RESPOSTAS DOS BOTÕES DO TELEGRAM ---
app.post('/api/webhook/telegram', async (req, res) => {
    try {
        console.log('[WEBHOOK TELEGRAM] Nova notificação recebida:', req.body);

        if (req.body.callback_query) {
            const callbackQuery = req.body.callback_query;
            const callbackData = callbackQuery.data; // Ex: "update_abc123_concluida"
            
            // Informações da mensagem original para podermos editá-la depois
            const messageId = callbackQuery.message.message_id;
            const chatId = callbackQuery.message.chat.id;
            const originalText = callbackQuery.message.text;

            const parts = callbackData.split('_');
            if (parts.length === 3 && parts[0] === 'update') {
                const entregaId = parts[1];
                const novoStatus = parts[2] === 'concluida' ? 'Concluída' : 'Falhou';

                console.log(`[WEBHOOK TELEGRAM] Atualizando entrega ${entregaId} para ${novoStatus}`);

                // 1. Salva no Firebase (como antes)
                const entregaRef = db.collection('entregas').doc(entregaId);
                await entregaRef.update({ status: novoStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                
                console.log(`[DB] Entrega ${entregaId} atualizada com sucesso para ${novoStatus}.`);

                // 2. Edita a mensagem original no Telegram para dar feedback
                const { TELEGRAM_BOT_TOKEN } = process.env;
                const telegramEditUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;

                const emoji = novoStatus === 'Concluída' ? '✅' : '❌';
                const newText = `${originalText}\n\n*Status atualizado para: ${novoStatus} ${emoji}*`;

                await fetch(telegramEditUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: messageId,
                        text: newText,
                        parse_mode: 'Markdown'
                        // Importante: Não enviamos 'reply_markup' para que os botões desapareçam!
                    })
                });

                console.log(`[TELEGRAM] Mensagem ${messageId} editada com sucesso.`);
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("Erro no webhook do Telegram:", error);
        res.sendStatus(500);
    }
});


// --- RESTANTE DAS SUAS ROTAS ORIGINAIS (SEM ALTERAÇÕES) ---

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
    const entregadoresRef = db.collection('entregadores');
    const qEntregadores = entregadoresRef.where(admin.firestore.FieldPath.documentId(), 'in', idsEntregadoresAtivos);
    const entregadoresSnapshot = await qEntregadores.get();
    const entregadoresAtivos = entregadoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const entregasRef = db.collection('entregas');
    const qEntregas = entregasRef.where("jornadaId", "==", jornadaId);
    const entregasSnapshot = await qEntregas.get();
    const entregasAtivas = entregasSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ entregadoresAtivos, entregasAtivas });
  } catch (error) {
    console.error("Erro na operação:", error);
    res.status(500).send("Erro interno.");
  }
});

app.patch('/api/entregas/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).send('Status é obrigatório.');
  try {
    const entregaRef = db.collection('entregas').doc(id);
    const entregaDoc = await entregaRef.get();
    if (!entregaDoc.exists) return res.status(404).send('Entrega não encontrada.');
    await entregaRef.update({ status: status, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const entregaData = entregaDoc.data();
    const entregadorDoc = await db.collection('entregadores').doc(entregaData.entregadorId).get();
    const nomeEntregador = entregadorDoc.exists ? entregadorDoc.data().nome : 'Desconhecido';
    if (entregaData.jornadaId) {
      await db.collection('jornadas').doc(entregaData.jornadaId).collection('eventos').add({
        tipo: 'STATUS',
        texto: `Gestor alterou status da entrega "${entregaData.pedido}" para ${status}.`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        entregaId: id,
        novoStatus: status
      });
    }
    res.status(200).json({ message: 'Status atualizado com sucesso.' });
  } catch (error) {
    console.error(`Erro ao atualizar status:`, error);
    res.status(500).send("Erro interno.");
  }
});

app.post('/api/entregadores', async (req, res) => {
  const { nome, telefone, veiculo, rota, userId } = req.body;
  if (!nome || !userId) return res.status(400).send('Dados incompletos.');
  try {
    const docRef = await db.collection('entregadores').add({ nome, telefone, veiculo, rota, userId });
    res.status(201).json({ id: docRef.id, ...req.body });
  } catch (error) {
    console.error('Erro ao criar entregador:', error);
    res.status(500).send('Erro interno');
  }
});

app.put('/api/entregadores/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, telefone, veiculo, rota } = req.body;
  try {
    await db.collection('entregadores').doc(id).update({ nome, telefone, veiculo, rota });
    res.status(200).json({ id, ...req.body });
  } catch (error) {
    console.error('Erro ao atualizar entregador:', error);
    res.status(500).send('Erro interno');
  }
});

app.delete('/api/entregadores/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('entregadores').doc(id).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Erro ao deletar entregador:', error);
    res.status(500).send('Erro interno');
  }
});

app.delete('/api/jornadas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('jornadas').doc(id).delete();
    res.status(204).send();
  } catch (error) {
    console.error(`Erro ao deletar jornada ${id}:`, error);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.get('/api/kpis/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const inicioOntem = admin.firestore.Timestamp.fromDate(ontem);
    const fimOntem = admin.firestore.Timestamp.fromDate(hoje);
    const jornadasRef = db.collection('jornadas');
    const q = jornadasRef.where("userId", "==", userId).where("status", "==", "finalizada").where("dataFim", ">=", inicioOntem).where("dataFim", "<", fimOntem);
    const snapshot = await q.get();
    let entregasConcluidasOntem = 0;
    if (!snapshot.empty) {
      snapshot.docs.forEach(doc => {
        const resumo = doc.data().resumo;
        if (resumo && resumo.concluidas) {
          entregasConcluidasOntem += resumo.concluidas;
        }
      });
    }
    res.status(200).json({ entregasConcluidasOntem });
  } catch (error) {
    console.error("Erro ao buscar KPIs:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.post('/api/jornadas/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  try {
    const jornadaRef = db.collection('jornadas').doc(id);
    const jornadaDoc = await jornadaRef.get();
    if (!jornadaDoc.exists) {
      return res.status(404).send('Jornada não encontrada.');
    }
    const entregasRef = db.collection('entregas');
    const q = entregasRef.where("jornadaId", "==", id);
    const entregasSnapshot = await q.get();
    let totalEntregas = entregasSnapshot.docs.length;
    let concluidas = 0;
    let falhas = 0;
    entregasSnapshot.docs.forEach(doc => {
      const status = doc.data().status;
      if (status === 'Concluída') concluidas++;
      else if (status === 'Falhou') falhas++;
    });
    const resumo = { totalEntregas, concluidas, falhas, taxaSucesso: totalEntregas > 0 ? ((concluidas / totalEntregas) * 100).toFixed(1) : "0.0" };
    await jornadaRef.update({
      status: "finalizada",
      dataFim: admin.firestore.FieldValue.serverTimestamp(),
      resumo: resumo
    });
    res.status(200).json(resumo);
  } catch (error) {
    console.error(`Erro ao finalizar jornada ${id}:`, error);
    res.status(500).send("Erro ao finalizar jornada.");
  }
});

app.get('/api/jornadas/historico/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const jornadasRef = db.collection('jornadas');
    const q = jornadasRef
      .where("userId", "==", userId)
      .where("status", "==", "finalizada");
    
    const snapshot = await q.get();

    if (snapshot.empty) {
      return res.json([]);
    }

    let historico = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        dataInicio: data.dataInicio ? data.dataInicio.toDate().toISOString() : null,
        dataFim: data.dataFim ? data.dataFim.toDate().toISOString() : null
      };
    });

    historico.sort((a, b) => new Date(b.dataFim) - new Date(a.dataFim));

    res.status(200).json(historico);

  } catch (error) {
    console.error("Erro ao buscar histórico de jornadas:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.get('/api/jornadas/:id/detalhes', async (req, res) => {
  const { id } = req.params;
  try {
    const jornadaRef = db.collection('jornadas').doc(id);
    const jornadaDoc = await jornadaRef.get();
    if (!jornadaDoc.exists) {
      return res.status(404).send('Jornada não encontrada.');
    }
    const jornadaData = jornadaDoc.data();
    if (jornadaData.dataInicio) jornadaData.dataInicio = jornadaData.dataInicio.toDate().toISOString();
    if (jornadaData.dataFim) jornadaData.dataFim = jornadaData.dataFim.toDate().toISOString();
    
    const idsEntregadores = jornadaData.entregadoresIds || [];
    let entregadoresParticipantes = [];
    if (idsEntregadores.length > 0) {
      const entregadoresRef = db.collection('entregadores');
      const qEntregadores = entregadoresRef.where(admin.firestore.FieldPath.documentId(), 'in', idsEntregadores);
      const entregadoresSnapshot = await qEntregadores.get();
      entregadoresParticipantes = entregadoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const entregasRef = db.collection('entregas');
    const qEntregas = entregasRef.where("jornadaId", "==", id);
    const entregasSnapshot = await qEntregas.get();
    const entregasDaJornada = entregasSnapshot.docs.map(doc => {
        const entregaData = doc.data();
        return {
            id: doc.id, ...entregaData,
            createdAt: entregaData.createdAt ? entregaData.createdAt.toDate().toISOString() : null,
            updatedAt: entregaData.updatedAt ? entregaData.updatedAt.toDate().toISOString() : null,
        }
    });
    
    const eventosRef = db.collection('jornadas').doc(id).collection('eventos');
    const eventosSnapshot = await eventosRef.get();

    let eventos = eventosSnapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data, timestamp: data.timestamp.toDate().toISOString() };
    });
    
    eventos.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.status(200).json({
      jornada: jornadaData,
      entregadores: entregadoresParticipantes,
      entregas: entregasDaJornada,
      eventos: eventos
    });
  } catch (error) {
    console.error(`Erro ao buscar detalhes da jornada ${id}:`, error);
    res.status(500).send("Erro interno do servidor.");
  }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));