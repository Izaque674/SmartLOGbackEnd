// backend/data.js

const entregadoresIniciais = [
  // Todos os entregadores agora têm o SEU número de WhatsApp para teste
  { id: 1, nome: 'João Silva (Teste)', whatsapp: '+554284252941' },
  { id: 2, nome: 'Maria Oliveira (Teste)', whatsapp: '+554284252941' },
  { id: 3, nome: 'Carlos Pereira (Teste)', whatsapp: '+554284252941' },
];

const entregasIniciais = [
  { 
    id: 101, 
    cliente: 'Padaria Pão Quente', 
    endereco: 'Rua das Flores, 123', 
    pedido: 'Nº 5589',
    status: 'Pendente',
    entregadorId: 1,
  },
  { 
    id: 102, 
    cliente: 'Mercado Preço Bom', 
    endereco: 'Avenida Principal, 789', 
    pedido: 'Nº 5590',
    status: 'Pendente',
    entregadorId: 1,
  },
  { 
    id: 103, 
    cliente: 'Farmácia Saúde Já', 
    endereco: 'Praça da Matriz, 45', 
    pedido: 'Nº 5591',
    status: 'Em Trânsito',
    entregadorId: 1,
  },
  { 
    id: 104, 
    cliente: 'Loja de Roupas Estilo', 
    endereco: 'Rua do Comércio, 500', 
    pedido: 'Nº 5592',
    status: 'Concluída',
    entregadorId: 1,
  },
];

// A mudança está aqui:
module.exports = {
  entregadoresIniciais,
  entregasIniciais
};