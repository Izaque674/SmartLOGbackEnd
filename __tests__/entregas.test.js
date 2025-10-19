const request = require('supertest');
const app = require('../app');

describe('POST /api/entregas', () => {
  it('retorna 404 se entregador não existe', async () => {
    const entrega = {
      cliente: 'Teste',
      endereco: 'Rua Teste, 123',
      pedido: 'PedidoTeste',
      entregadorId: 'id_inexistente',
      tipo: 'expressa',
      valorCobrar: 10
    };
    const response = await request(app).post('/api/entregas').send(entrega);
    expect(response.statusCode).toBe(404);
    expect(response.text).toMatch(/Entregador não encontrado/);
  });
});