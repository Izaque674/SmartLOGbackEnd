require('dotenv').config();

const express = require('express');
const cors = require('cors');
const twilio = require('twilio');
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

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

// --- RASTREADOR ATUALIZADO ---
// Agora mapeia o SID da MENSAGEM para o ID da ENTREGA
let sidParaEntregaMap = {}; 

// ...endpoints /api/dados e /api/operacao/:userId (sem alterações)...

app.post('/api/entregas', async (req, res) => {
  const { cliente, endereco, pedido, entregadorId } = req.body;
  try {
    const entregadorDoc = await db.collection('entregadores').doc(entregadorId).get();
    if (!entregadorDoc.exists) return res.status(404).send('Entregador não encontrado.');

    const entregador = entregadorDoc.data();
    const jornadas = await db.collection('jornadas').where("userId", "==", entregador.userId).where("status", "==", "ativa").get();
    if (jornadas.empty) return res.status(400).send('Nenhuma jornada ativa.');

    const jornadaId = jornadas.docs[0].id;
    const novaEntrega = {
      cliente, endereco, pedido, status: 'Em Trânsito',
      entregadorId, userId: entregador.userId, jornadaId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const docRef = await db.collection('entregas').add(novaEntrega);

    const numeroTeste = process.env.MY_VERIFIED_NUMBER;
    const CONTENT_SID = 'HX54374ce3e36b6bffa76dfe61c3522f3b';

    if (numeroTeste && CONTENT_SID) {
      // A chamada `create` agora está dentro de uma variável `message`
      const message = await client.messages.create({
        contentSid: CONTENT_SID,
        contentVariables: JSON.stringify({ '1': pedido, '2': cliente, '3': endereco }),
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${numeroTeste}`
      });
      
      // --- LÓGICA DE RASTREAMENTO CORRIGIDA ---
      // Associamos o SID da mensagem enviada com o ID da nossa entrega
      sidParaEntregaMap[message.sid] = docRef.id;
      console.log(`[RASTREADOR] Mensagem SID ${message.sid} associada à entrega ${docRef.id}`);
    }
    
    res.status(201).json({ id: docRef.id, ...novaEntrega });
  } catch (error) {
    console.error("Erro ao criar entrega:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.post('/api/webhook/whatsapp', async (req, res) => {
  try {
    // --- LÓGICA DO WEBHOOK CORRIGIDA ---
    const { OriginalRepliedMessageSid, Body } = req.body;
    
    if (!OriginalRepliedMessageSid || !Body) return res.status(400).send('Webhook inválido');
    
    console.log(`[WEBHOOK] Resposta recebida para a mensagem original SID: ${OriginalRepliedMessageSid}`);

    // Usamos o SID da mensagem respondida para encontrar o ID da nossa entrega
    const entregaId = sidParaEntregaMap[OriginalRepliedMessageSid];
    const textoResposta = Body.trim().toLowerCase();

    if (entregaId) {
      console.log(`[RASTREADOR] Encontrada entrega ativa: ${entregaId}`);
      const ref = db.collection('entregas').doc(entregaId);
      const doc = await ref.get();

      if (doc.exists && doc.data().status === 'Em Trânsito') {
        let novoStatus = null;
        if (textoResposta.includes('concluída')) novoStatus = 'Concluída';
        else if (textoResposta.includes('falhou')) novoStatus = 'Falhou';
        
        if (novoStatus) {
            await ref.update({ status: novoStatus });
            console.log(`[DB] Entrega ${entregaId} atualizada para ${novoStatus}`);
            // Limpamos o rastreador para esta mensagem específica
            delete sidParaEntregaMap[OriginalRepliedMessageSid];
        }
      }
    } else {
      console.log(`[RASTREADOR] Nenhuma entrega encontrada para a mensagem SID ${OriginalRepliedMessageSid}`);
    }

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response/>');
  } catch (error) {
    console.error("Erro no webhook:", error);
    res.status(500).send('<Response/>');
  }
});




// Endpoints CRUD de Entregadores
app.post('/api/entregadores', async (req, res) => {
  const { nome, telefone, veiculo, rota, userId } = req.body;
  
  console.log('[API] Recebida requisição para criar entregador:', req.body);

  if (!nome || !userId) {
    console.error('[API-ERRO] Dados incompletos: nome e userId são obrigatórios.');
    return res.status(400).send('Dados incompletos: Nome e userId são obrigatórios.');
  }

  try {
    const dadosParaSalvar = { nome, telefone, veiculo, rota, userId };
    const docRef = await db.collection('entregadores').add(dadosParaSalvar);
    
    console.log(`[DB-SUCCESS] Entregador criado com sucesso. ID: ${docRef.id}`);
    
    // Retorna o novo objeto completo, incluindo o ID gerado
    res.status(201).json({ id: docRef.id, ...dadosParaSalvar });

  } catch (error) {
    console.error('ERRO GERAL ao criar entregador:', error);
    res.status(500).send('Erro interno do servidor ao criar entregador.');
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


// --- ENDPOINT PARA DELETAR UMA JORNADA ESPECÍFICA ---
app.delete('/api/jornadas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Nota: Em um sistema de produção, poderíamos querer deletar também
    // todas as entregas associadas a esta jornada. Por enquanto, vamos
    // apenas deletar o documento da jornada em si.
    await db.collection('jornadas').doc(id).delete();
    
    console.log(`[JORNADA] Jornada ${id} deletada com sucesso.`);
    res.status(204).send(); // Sucesso, sem conteúdo para retornar
  } catch (error) {
    console.error(`Erro ao deletar jornada ${id}:`, error);
    res.status(500).send("Erro interno do servidor.");
  }
});

// --- ENDPOINT PARA BUSCAR OS DADOS DOS KPIs (VERSÃO FINAL E ROBUSTA) ---
app.get('/api/kpis/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);

    // 1. A query agora é a mais simples possível: busca TODAS as jornadas do usuário.
    // Esta query SÓ filtra por 'userId' e não precisa de nenhum índice composto.
    const jornadasRef = db.collection('jornadas');
    const q = jornadasRef.where("userId", "==", userId);
    
    const snapshot = await q.get();

    let entregasConcluidasOntem = 0;
    if (!snapshot.empty) {
      // 2. O filtro por 'status' E por 'data' é feito aqui, no código.
      snapshot.docs.forEach(doc => {
        const jornada = doc.data();
        // Verifica se a jornada está finalizada E se a data de fim foi ontem
        if (jornada.status === 'finalizada' && jornada.dataFim && jornada.dataFim.toDate() >= ontem && jornada.dataFim.toDate() < hoje) {
          if (jornada.resumo && jornada.resumo.concluidas) {
            entregasConcluidasOntem += jornada.resumo.concluidas;
          }
        }
      });
    }

    const kpis = {
      entregasConcluidasOntem: entregasConcluidasOntem,
    };

    res.status(200).json(kpis);

  } catch (error) {
    console.error("Erro ao buscar KPIs:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

// --- ENDPOINT PARA ATUALIZAR O STATUS DE UMA ENTREGA ---
app.patch('/api/entregas/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Espera receber um objeto como { "status": "Concluída" }

  if (!status) {
    return res.status(400).send('O novo status é obrigatório.');
  }

  try {
    const entregaRef = db.collection('entregas').doc(id);
    await entregaRef.update({ 
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp() // Adiciona um timestamp de atualização
    });
    
    console.log(`[STATUS] Status da entrega ${id} atualizado para "${status}" pelo gestor.`);
    res.status(200).json({ message: 'Status atualizado com sucesso.' });

  } catch (error) {
    console.error(`Erro ao atualizar status da entrega ${id}:`, error);
    res.status(500).send("Erro interno do servidor.");
  }
});

// --- ENDPOINT PARA BUSCAR OS DADOS DA OPERAÇÃO AO VIVO ---
app.get('/api/operacao/:userId', async (req, res) => {
  const { userId } = req.params;
  
  try {
    // 1. Encontra a jornada ativa para o usuário
    const jornadasRef = db.collection('jornadas');
    const qJornada = jornadasRef.where("userId", "==", userId).where("status", "==", "ativa");
    const jornadaSnapshot = await qJornada.get();

    if (jornadaSnapshot.empty) {
      // Se não há jornada, retorna vazio. O front-end saberá como lidar com isso.
      return res.json({ entregadoresAtivos: [], entregasAtivas: [] });
    }

    const jornada = jornadaSnapshot.docs[0].data();
    const jornadaId = jornadaSnapshot.docs[0].id;
    const idsEntregadoresAtivos = jornada.entregadoresIds || [];

    if (idsEntregadoresAtivos.length === 0) {
      return res.json({ entregadoresAtivos: [], entregasAtivas: [] });
    }

    // 2. Busca os detalhes dos entregadores ativos
    const entregadoresRef = db.collection('entregadores');
    const qEntregadores = entregadoresRef.where(admin.firestore.FieldPath.documentId(), 'in', idsEntregadoresAtivos);
    const entregadoresSnapshot = await qEntregadores.get();
    const entregadoresAtivos = entregadoresSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 3. Busca as entregas da jornada ativa
    const entregasRef = db.collection('entregas');
    const qEntregas = entregasRef.where("jornadaId", "==", jornadaId);
    const entregasSnapshot = await qEntregas.get();
    const entregasAtivas = entregasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // 4. Retorna tudo de uma vez para o front-end
    res.json({ entregadoresAtivos, entregasAtivas });

  } catch (error) {
    console.error("Erro ao buscar dados da operação:", error);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.get('/api/jornadas/historico/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const jornadasRef = db.collection('jornadas');
    const q = jornadasRef
      .where("userId", "==", userId)
      .where("status", "==", "finalizada")
      .orderBy("dataFim", "desc"); // Ordena pelas mais recentes

    const snapshot = await q.get();

    if (snapshot.empty) {
      return res.json([]); // Retorna um array vazio se não houver histórico
    }

    const historico = snapshot.docs.map(doc => {
      const data = doc.data();
      // Converte os timestamps para strings ISO para o front-end
      return {
        id: doc.id,
        ...data,
        dataInicio: data.dataInicio ? data.dataInicio.toDate().toISOString() : null,
        dataFim: data.dataFim ? data.dataFim.toDate().toISOString() : null
      };
    });

    res.status(200).json(historico);

  } catch (error) {
    console.error("Erro ao buscar histórico de jornadas:", error);
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

    // 1. Buscar todas as entregas associadas a esta jornada
    const entregasRef = db.collection('entregas');
    const q = entregasRef.where("jornadaId", "==", id);
    const entregasSnapshot = await q.get();

    // 2. Calcular as estatísticas
    let totalEntregas = entregasSnapshot.docs.length;
    let concluidas = 0;
    let falhas = 0;

    entregasSnapshot.docs.forEach(doc => {
      const status = doc.data().status;
      if (status === 'Concluída') {
        concluidas++;
      } else if (status === 'Falhou') {
        falhas++;
      }
    });

    const resumo = {
      totalEntregas,
      concluidas,
      falhas,
      taxaSucesso: totalEntregas > 0 ? ((concluidas / totalEntregas) * 100).toFixed(1) : "0.0"
    };

    // 3. Atualizar o documento da jornada com o resumo e o novo status
    await jornadaRef.update({
      status: "finalizada",
      dataFim: admin.firestore.FieldValue.serverTimestamp(),
      resumo: resumo
    });

    console.log(`[JORNADA] Jornada ${id} finalizada com sucesso.`);

    // 4. Retornar o resumo calculado para o front-end
    res.status(200).json(resumo);

  } catch (error) {
    console.error(`Erro ao finalizar jornada ${id}:`, error);
    res.status(500).send("Erro interno do servidor ao finalizar jornada.");
  }
});


// --- ENDPOINT PARA BUSCAR OS DETALHES DE UMA JORNADA FINALIZADA (CORRIGIDO) ---
app.get('/api/jornadas/:id/detalhes', async (req, res) => {
  const { id } = req.params;

  try {
    const jornadaRef = db.collection('jornadas').doc(id);
    const jornadaDoc = await jornadaRef.get();
    if (!jornadaDoc.exists) {
      return res.status(404).send('Jornada não encontrada.');
    }
    
    // --- CORREÇÃO APLICADA AQUI ---
    const jornadaData = jornadaDoc.data();
    // Converte os timestamps do Firebase para strings ISO antes de enviar
    if (jornadaData.dataInicio) {
      jornadaData.dataInicio = jornadaData.dataInicio.toDate().toISOString();
    }
    if (jornadaData.dataFim) {
      jornadaData.dataFim = jornadaData.dataFim.toDate().toISOString();
    }
    
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
    const entregasDaJornada = entregasSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    res.status(200).json({
      jornada: jornadaData,
      entregadores: entregadoresParticipantes,
      entregas: entregasDaJornada
    });

  } catch (error) {
    console.error(`Erro ao buscar detalhes da jornada ${id}:`, error);
    res.status(500).send("Erro interno do servidor.");
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});