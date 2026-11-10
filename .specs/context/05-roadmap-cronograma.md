# Cronograma de Codificação do Projeto - WhereToGo

Conforme definido na Seção 3.1 do Documento de Visão do Produto:

| Semana | Entrega Prevista | Foco Principal | Status Atual |
|:---:|---|---|:---:|
| **Semana 1** | **Configuração e Banco de Dados (Base)**: Configuração do repositório, infraestrutura do banco de dados (PostgreSQL + PostGIS) e criação da API de Autenticação com geração de token JWT (RBAC). | Base / Infra / Auth | ✅ **CONCLUÍDA** |
| **Semana 2** | **Backend (Regras de Negócio)**: Desenvolvimento das rotas da API para cadastro de abrigos, endpoints do inventário (Fast-CRUD) e implementação da gravação assíncrona do Log de Auditoria Imutável. | Backend Core / Logs | ✅ **CONCLUÍDA** |
| **Semana 3** | **Frontend Admin (Parte 1 - Visão do Coordenador)**: Criação da tela de Login segmentado, desenvolvimento do Dashboard de Triagem e tela de reporte de infraestrutura (Vias/Energia). | Frontend Admin / Coord | ✅ **CONCLUÍDA** |
| **Semana 4** | **Frontend Admin (Parte 2 - Visão do Voluntário)**: Desenvolvimento e integração da interface tátil de botões de incremento/decremento do inventário (Fast-CRUD), garantindo atualizações sem recarregar a tela. | Frontend Fast-CRUD Touch | ✅ **CONCLUÍDA** |
| **Semana 5** | **Aplicação Web Pública (Mapa Base)**: Setup do Next.js/React, integração com a biblioteca de mapas (Leaflet/Mapbox) e plotagem das coordenadas (pinos) dos abrigos baseadas nos dados reais do BD. | Frontend Público / Mapas | ✅ **CONCLUÍDA** |
| **Semana 6** | **Aplicação Pública (Roteamento e Filtros)**: Implementação da interface visual de filtros rápidos (Água, Remédios, etc.), cards detalhados dos abrigos e integração visual dos alertas de vias colapsadas no mapa. | Filtros / Roteamento | ✅ **CONCLUÍDA** |
| **Semana 7** | **Testes de Integração, Mobile-First 3G e Melhorias Comparativas**: Simulação em redes 3G (fila offline + selo de atualização recente), tags de perfil (`🐾 Aceita Pets`, `♿ PCD`), busca pública LGPD de familiares acolhidos, alerta PostGIS de trajeto cruzando polígono de risco (`ST_Intersects`), sugestão automática de transferência entre abrigos e reporte cidadão moderado. | QA / Resiliência 3G / PostGIS Avançado | ✅ **CONCLUÍDA** |
| **Semana 8** | **Deploy, Otimização e Entrega do MVP**: Implantação da aplicação em ambiente de nuvem (`render.yaml`, `vercel.json`, CI/CD GitHub Actions, suporte TLS/SSL para PostgreSQL gerenciado), configuração de CDN Edge (`stale-while-revalidate` + `stale-if-error`) e entrega da versão final (`Release v1.0.0`). | Deploy / CDN / Release v1.0.0 | ✅ **CONCLUÍDA** |

## Observações
- A **tela de login** (UI) pertence à Semana 3, conforme o DVP. A versão anterior do `task-semana-1.md` a listava como entregue na Semana 1; a Semana 1 entrega a **API** de autenticação.
- O backend das Semanas 1-2 já expõe os endpoints que as telas das Semanas 3 a 6 consomem (dashboard, Fast-CRUD, mapa público em JSON/GeoJSON, alertas). Detalhes em `06-api.md`.
- Testes automatizados (unitários, integração com banco real e e2e HTTP) já fazem parte da entrega; a Semana 7 amplia para testes de performance em 3G e de interface touch.
