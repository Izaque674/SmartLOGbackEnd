require('dotenv').config();

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

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

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ROTA PRINCIPAL PARA CRIAR ENTREGAS E ENVIAR MENSAGEM ---
app.post('/api/entregas', async (req, res) => {
 
  const { cliente, endereco, pedido, entregadorId, tipo, valorCobrar } = req.body;
  try {
    const entregadorDoc = await db.collection('entregadores').doc(entregadorId).get();
    if (!entregadorDoc.exists) return res.status(404).send('Entregador não encontrado.');

    const entregador = entregadorDoc.data();
    const jornadas = await db.collection('jornadas').where("userId", "==", entregador.userId).where("status", "==", "ativa").get();
    if (jornadas.empty) return res.status(400).send('Nenhuma jornada ativa.');

    const jornadaId = jornadas.docs[0].id;
    const novaEntrega = {
      cliente, 
      endereco, 
      pedido, 
      status: 'Em Trânsito',
      entregadorId, 
      userId: entregador.userId, 
      jornadaId,
      tipo: tipo || 'Entrega', 
      valorCobrar: valorCobrar || 0, 
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('entregas').add(novaEntrega);

    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
        let text = `*Nova ${novaEntrega.tipo} para ${cliente}!*\n\n*Pedido:* ${pedido}\n*Endereço:* ${endereco}`;
        if (novaEntrega.valorCobrar > 0) {
            text += `\n\n*Atenção:* Cobrar R$ ${novaEntrega.valorCobrar.toFixed(2).replace('.', ',')}`;
        }

        try {
            const response = await fetch(telegramUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID, // Mude aqui para o telefone do entregador no futuro
                    text: text,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [ // Linha 1 de botões
                                { text: "✅ Concluída", callback_data: `update_${docRef.id}_concluida` },
                                { text: "❌ Falhou", callback_data: `update_${docRef.id}_falhou` }
                            ],
                            [ // Linha 2 de botões
                                { text: "📝 Adicionar Observação", callback_data: `obs_${docRef.id}` }
                            ]
                        ]
                    }
                })
            });
            // ... resto do tratamento da resposta
        } catch (error) { /* ... */ }
    }
    
    res.status(201).json({ id: docRef.id, ...novaEntrega });
  } catch (error) {
    console.error("Erro ao criar entrega:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});




// Em server.js

// --- FUNÇÕES AUXILIARES ---

// Função para enviar NOVAS mensagens
async function enviarMensagemTelegram(chatId, text, replyMarkup = null) {
  const { TELEGRAM_BOT_TOKEN } = process.env;
  if (!TELEGRAM_BOT_TOKEN) return;
  
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        text: text, 
        parse_mode: 'Markdown',
        reply_markup: replyMarkup 
      })
    });
  } catch (error) {
    console.error("[TELEGRAM] Erro ao enviar mensagem:", error);
  }
}

// Função para EDITAR mensagens existentes
async function editarMensagemTelegram(chatId, messageId, text) {
    const { TELEGRAM_BOT_TOKEN } = process.env;
    if (!TELEGRAM_BOT_TOKEN) return;

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
    try {
        await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text: text,
                parse_mode: 'Markdown'
                // Não enviamos 'reply_markup' para que os botões desapareçam
            })
        });
        console.log(`[TELEGRAM] Mensagem ${messageId} editada com sucesso.`);
    } catch (error) {
        console.error("[TELEGRAM] Erro ao editar mensagem:", error);
    }
}


// --- ROTA PRINCIPAL DO WEBHOOK ---
app.post('/api/webhook/telegram', async (req, res) => {
    try {
        if (req.body.callback_query) {
            const callbackQuery = req.body.callback_query;
            const callbackData = callbackQuery.data;
            const message = callbackQuery.message;
            const chatId = message.chat.id;
            const messageId = message.message_id;
            const originalText = message.text;

            // --- Lógica para ATUALIZAR STATUS (Concluída ou Falhou) ---
            if (callbackData.startsWith('update_')) {
                const parts = callbackData.split('_');
                const entregaId = parts[1];
                const novoStatus = parts[2] === 'concluida' ? 'Concluída' : 'Falhou';

                await db.collection('entregas').doc(entregaId).update({ 
                    status: novoStatus, 
                    updatedAt: admin.firestore.FieldValue.serverTimestamp() 
                });
                
                const emoji = novoStatus === 'Concluída' ? '✅' : '❌';
                const newText = `${originalText}\n\n*Status atualizado para: ${novoStatus} ${emoji}*`;
                await editarMensagemTelegram(chatId, messageId, newText);
            }
            
            // --- Lógica para CONCLUIR COM OBSERVAÇÃO ---
            else if (callbackData.startsWith('obs_')) {
                const entregaId = callbackData.split('_')[1];

                // 1. Marca a entrega como 'Concluída' e adiciona o sinalizador 'requerAtencao'
                await db.collection('entregas').doc(entregaId).update({
                    status: 'Concluída',
                    requerAtencao: true,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // 2. Edita a mensagem no Telegram para confirmar e pedir a observação
                const newText = `${originalText}\n\n*✅ Entrega Concluída com Observação.*\nPor favor, descreva o ocorrido abaixo e envie.`;
                await editarMensagemTelegram(chatId, messageId, newText);
            }
        }
        // Não precisamos mais da lógica para receber texto, pois a conversa será informal
        
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

// DEPOIS - server.js (CORRIGIDO)
app.post('/api/entregadores', async (req, res) => {
  
  const { nome, telefone, veiculo, rota, userId, fotoUrl } = req.body; 
  if (!nome || !userId) return res.status(400).send('Dados incompletos.');
  try {
    const docRef = await db.collection('entregadores').add({ 
        nome, 
        telefone, 
        veiculo, 
        rota, 
        userId, 
        fotoUrl: fotoUrl || null // 2. Adicione 'fotoUrl' ao objeto que será salvo no Firestore
    });
    res.status(201).json({ id: docRef.id, ...req.body });
  } catch (error) {
    console.error('Erro ao criar entregador:', error);
    res.status(500).send('Erro interno');
  }
});
app.put('/api/entregadores/:id', async (req, res) => {
  const { id } = req.params;
  // 1. Adicione 'fotoUrl' para extraí-lo do corpo da requisição
  const { nome, telefone, veiculo, rota, fotoUrl } = req.body;
  try {
    await db.collection('entregadores').doc(id).update({ 
        nome, 
        telefone, 
        veiculo, 
        rota, 
        fotoUrl: fotoUrl || null // 2. Adicione 'fotoUrl' ao objeto que será atualizado
    });
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
  try {
    const { userId } = req.params;

    // ✅ Buscar total de entregadores (esse continua geral)
    const entregadoresSnap = await db.collection('entregadores').where('userId', '==', userId).get();
    const totalEntregadores = entregadoresSnap.size;

    // ✅ Buscar a ÚLTIMA jornada finalizada
    const jornadasSnap = await db.collection('jornadas')
      .where('userId', '==', userId)
      .where('status', '==', 'finalizada')
      .orderBy('dataFim', 'desc')
      .limit(1)
      .get();

    // Se não houver jornadas finalizadas, retornar valores vazios
    if (jornadasSnap.empty) {
      return res.json({
        totalEntregadores,
        valorRecebido: 0,
        porcentagemEntregasConcluidas: 0,
        tempoMedioEntrega: '—'
      });
    }

    // Pegar ID da última jornada
    const ultimaJornadaId = jornadasSnap.docs[0].id;

    // ✅ Buscar APENAS entregas da última jornada
    const entregasSnap = await db.collection('entregas')
      .where('jornadaId', '==', ultimaJornadaId)
      .get();

    let valorRecebido = 0;
    let entregasConcluidasCount = 0;
    let totalEntregas = entregasSnap.size;
    let tempos = [];

    entregasSnap.forEach(doc => {
      const data = doc.data();
      
      if (data.status === 'Concluída') {
        entregasConcluidasCount++;
        valorRecebido += parseFloat(data.valorCobrar || 0);
        
        // Calcular tempo de entrega
        if (data.createdAt && data.updatedAt &&
            typeof data.createdAt.toDate === 'function' &&
            typeof data.updatedAt.toDate === 'function') {
          const tempoEmMinutos = (data.updatedAt.toDate().getTime() - data.createdAt.toDate().getTime()) / 60000;
          tempos.push(tempoEmMinutos);
        }
      }
    });

    // Calcular porcentagem de conclusão
    const porcentagemEntregasConcluidas = totalEntregas > 0 
      ? Math.round((entregasConcluidasCount / totalEntregas) * 100) 
      : 0;

    // Calcular tempo médio
    let tempoMedioEntrega = '—';
    if (tempos.length > 0) {
      const mediaMins = Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length);
      
      if (mediaMins < 60) {
        tempoMedioEntrega = `${mediaMins} min`;
      } else {
        const horas = Math.floor(mediaMins / 60);
        const minutos = mediaMins % 60;
        tempoMedioEntrega = `${horas}h ${minutos}min`;
      }
    }

    res.json({
      totalEntregadores,
      valorRecebido,
      porcentagemEntregasConcluidas,
      tempoMedioEntrega
    });

  } catch (error) {
    console.error('Erro no get /api/kpis/:userId:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
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

module.exports = app;
