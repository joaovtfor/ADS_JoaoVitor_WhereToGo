# Cronograma de Codificação do Projeto - WhereToGo

Conforme definido na Seção 3.1 do Documento de Visão do Produto:

| Semana | Entrega Prevista | Foco Principal | Status Atual |
|:---:|---|---|:---:|
| **Semana 1** | **Configuração e Banco de Dados (Base)**: Configuração do repositório, infraestrutura do banco de dados (PostgreSQL + PostGIS) e criação da API de Autenticação com geração de token JWT (RBAC). | Base / Infra / Auth | 🚀 **EM ANDAMENTO** |
| **Semana 2** | **Backend (Regras de Negócio)**: Desenvolvimento das rotas da API para cadastro de abrigos, endpoints do inventário (Fast-CRUD) e implementação da gravação assíncrona do Log de Auditoria Imutável. | Backend Core / Logs | ⏳ Pendente |
| **Semana 3** | **Frontend Admin (Parte 1 - Visão do Coordenador)**: Criação da tela de Login segmentado, desenvolvimento do Dashboard de Triagem e tela de reporte de infraestrutura (Vias/Energia). | Frontend Admin / Coord | ⏳ Pendente |
| **Semana 4** | **Frontend Admin (Parte 2 - Visão do Voluntário)**: Desenvolvimento e integração da interface tátil de botões de incremento/decremento do inventário (Fast-CRUD), garantindo atualizações sem recarregar a tela. | Frontend Fast-CRUD Touch | ⏳ Pendente |
| **Semana 5** | **Aplicação Web Pública (Mapa Base)**: Setup do Next.js/React, integração com a biblioteca de mapas (Leaflet/Mapbox) e plotagem das coordenadas (pinos) dos abrigos baseadas nos dados reais do BD. | Frontend Público / Mapas | ⏳ Pendente |
| **Semana 6** | **Aplicação Pública (Roteamento e Filtros)**: Implementação da interface visual de filtros rápidos (Água, Remédios, etc.), cards detalhados dos abrigos e integração visual dos alertas de vias colapsadas no mapa. | Filtros / Roteamento | ⏳ Pendente |
| **Semana 7** | **Testes de Integração e Mobile-First**: Rodadas de testes end-to-end simulando cenários reais: simulação em redes 3G (teste de performance), uso da interface Fast-CRUD em telas touch e validação contra invasão de perfis. | QA / Testes 3G / RBAC | ⏳ Pendente |
| **Semana 8** | **Deploy, Otimização e Entrega do MVP**: Implantação da aplicação em ambiente de nuvem (Ex: Vercel para front, Render para back/BD), configuração do CDN para carregamento rápido e entrega da versão final (Release). | Deploy / Produção | ⏳ Pendente |
