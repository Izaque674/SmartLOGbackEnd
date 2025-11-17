const request = require('supertest');
const app = require('../app');
const admin = require('firebase-admin');

jest.setTimeout(30000);

describe('Fluxo completo: entregador -> jornada -> entrega -> status', () => {
  let db;
  let createdEntregadorId = null;
  let createdJornadaId = null;
  let createdEntregaId = null;
  const uniqueUser = `test-user-ci-${Date.now()}`;

  beforeAll(() => {
    db = admin.firestore();
  });

  afterAll(async () => {
    // garante que tudo foi limpo se algo sobrrou
    try {
      if (createdEntregaId) await db.collection('entregas').doc(createdEntregaId).delete().catch(()=>{});
      if (createdJornadaId) await db.collection('jornadas').doc(createdJornadaId).delete().catch(()=>{});
      if (createdEntregadorId) await db.collection('entregadores').doc(createdEntregadorId).delete().catch(()=>{});
    } catch (err) {
      // ignore
    }
  });

  it('cria entregador, cria jornada ativa, cria entrega, atualiza status e valida', async () => {
    // 1) cria entregador via endpoint
    const entregadorPayload = {
      nome: 'Teste Integracao',
      telefone: '0000000000',
      veiculo: 'Moto',
      rota: 'Rota Teste',
      userId: uniqueUser,
      fotoUrl: null
    };
    const resCreateEnt = await request(app).post('/api/entregadores').send(entregadorPayload);
    expect(resCreateEnt.statusCode).toBe(201);
    expect(resCreateEnt.body).toHaveProperty('id');
    createdEntregadorId = resCreateEnt.body.id;

    // 2) cria jornada ativa diretamente no Firestore (endpoint de criação de jornada não existe)
    const jornadaDoc = await db.collection('jornadas').add({
      userId: uniqueUser,
      dataInicio: admin.firestore.FieldValue.serverTimestamp(),
      dataFim: null,
      status: 'ativa',
      entregadoresIds: [createdEntregadorId],
      resumo: {}
    });
    createdJornadaId = jornadaDoc.id;

    // pequena espera para garantir indices/consistência
    await new Promise(r => setTimeout(r, 500));

    // 3) cria entrega via endpoint (deve associar à jornada ativa)
    const entregaPayload = {
      cliente: 'Cliente Teste',
      endereco: 'Rua Teste, 123',
      pedido: 'Pedido-XYZ',
      entregadorId: createdEntregadorId,
      tipo: 'Entrega',
      valorCobrar: 15.5
    };
    const resCreateEntrega = await request(app).post('/api/entregas').send(entregaPayload);
    expect(resCreateEntrega.statusCode).toBe(201);
    expect(resCreateEntrega.body).toHaveProperty('id');
    createdEntregaId = resCreateEntrega.body.id;

    // resposta deve conter jornadaId que criamos (ou pelo menos não ser vazio)
    expect(resCreateEntrega.body.jornadaId).toBeDefined();
    expect(resCreateEntrega.body.userId).toBe(uniqueUser);

    // 4) atualizar status para Concluída via endpoint PATCH
    const resPatch = await request(app).patch(`/api/entregas/${createdEntregaId}/status`).send({ status: 'Concluída' });
    expect(resPatch.statusCode).toBe(200);

    // 5) verificar diretamente no Firestore que o status foi alterado
    const entregaDocSnap = await db.collection('entregas').doc(createdEntregaId).get();
    expect(entregaDocSnap.exists).toBe(true);
    const entregaData = entregaDocSnap.data();
    expect(entregaData.status).toBe('Concluída');

    // 6) consultar /api/jornadas/:id/detalhes e garantir que a entrega aparece com status atualizado
    const resDetalhes = await request(app).get(`/api/jornadas/${createdJornadaId}/detalhes`);
    expect(resDetalhes.statusCode).toBe(200);
    expect(resDetalhes.body).toHaveProperty('entregas');
    const encontrada = (resDetalhes.body.entregas || []).find(e => e.id === createdEntregaId);
    expect(encontrada).toBeDefined();
    expect(encontrada.status).toBe('Concluída');

    // cleanup (tenta remover)
    await db.collection('entregas').doc(createdEntregaId).delete();
    createdEntregaId = null;
    await db.collection('jornadas').doc(createdJornadaId).delete();
    createdJornadaId = null;
    await db.collection('entregadores').doc(createdEntregadorId).delete();
    createdEntregadorId = null;
  });
});