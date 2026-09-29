# WhereToGo - Visão Geral do Projeto (Contexto)

## 1. Identificação do Projeto
- **Nome do Projeto**: WhereToGo
- **Instituição**: Universidade de Passo Fundo – UPF (Curso de Análise e Desenvolvimento de Sistemas / Ciência da Computação / Engenharia de Computação)
- **Autor**: João Vitor de For dos Santos
- **Orientadores**: Prof. Jeangrei Veiga / Prof. Alexandre Zanatta
- **Versão do DVP**: 1.5

---

## 2. O Problema e Contexto de Crise
Em cenários de desastres naturais (como as enchentes históricas ocorridas no Rio Grande do Sul), a desinformação e a falta de coordenação logística agravam sensivelmente a crise humanitária:
- **Sobreviventes e Cidadãos Afetados**: enfrentam extrema dificuldade para localizar abrigos abertos que ainda possuam vagas disponíveis ou infraestrutura básica em funcionamento.
- **Doadores de Suprimentos**: frequentemente entregam recursos em locais errados ou enviam itens já saturados, gerando desperdício e gargalos logísticos.
- **Gestão Interna dos Abrigos**: sofre com controles manuais lentos (planilhas ou papéis) e ausência de canal ágil de comunicação para reportar riscos viários, vias colapsadas ou quedas de energia elétrica.

---

## 3. A Solução Proposta
O sistema **WhereToGo** é uma plataforma integrada de gestão de crise dividida em duas grandes frentes coordenadas:

### Frente 1: Aplicação Web Pública (PWA / Mobile-First)
- **Acesso Instantâneo e Aberto**: não exige qualquer cadastro ou login (RNF02).
- **Otimizada para Baixa Conectividade**: projetada para redes 3G degradadas ou Edge (RNF01) via interface minimalista e cache de mapas (Leaflet.js).
- **Mapa Interativo e Status de Lotação**: localização de abrigos ativos e capacidade em tempo real.
- **Roteamento Inteligente de Doações**: destaca no mapa os abrigos que necessitam urgentemente de determinado item e oculta os que já estão bloqueados por saturação.
- **Alertas de Risco Viário**: visualização no mapa de vias bloqueadas ou obstruídas reportadas pelos coordenadores.
- **Cards com Navegação e PIX**: atalhos para Waze/Google Maps e chaves PIX oficiais validadas.

### Frente 2: Painel Administrativo Interno (RBAC & Fast-CRUD)
- **Controle de Acesso Baseado em Papéis (RBAC)**: perfis com permissões isoladas (Administrador Geral, Coordenador de Abrigo, Voluntário Local).
- **Gestão de Inventário de Resposta Rápida (Fast-CRUD)**: interface tátil com botões de incremento/decremento (`+` e `-`), sem necessidade de digitação contínua, com persistência assíncrona.
- **Gestão de Necessidades**: marcação de suprimentos como "Urgente" ou "Bloqueado por excesso".
- **Monitoramento de Infraestrutura**: reporte de alertas de energia elétrica e colapso de vias.
- **Logs de Auditoria Imutáveis**: registro em background com ID do usuário, IP, timestamp, item e ação (+1/-1), prevenindo desvios e fraudes.
