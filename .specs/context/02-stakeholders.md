# Stakeholders do Projeto WhereToGo

Conforme definido na Seção 1.2.2 do Documento de Visão do Produto (DVP):

| Nome do Stakeholder | Responsabilidade no Sistema | Canal / Interface de Acesso |
|---|---|---|
| **Cidadão / Afetado** | Consome informações de localização de abrigos, status de lotação, meios de contato e alertas de vias pelo mapa público. | Aplicação Web Pública (sem login) |
| **Doador (Público)** | Utiliza o mapa público para filtrar abrigos que necessitam dos itens específicos que possui para doar, além de acessar chaves PIX oficiais. | Aplicação Web Pública (sem login) |
| **Voluntário Local** | Acessa o Painel Interno (com permissões restritas) para registrar entradas e saídas rápidas de suprimentos (fast-CRUD). | Painel Interno (Login RBAC: `VOLUNTARIO`) |
| **Coordenador de Abrigo** | Gerencia o dashboard do seu abrigo específico, monitora alertas de estoque crítico, reporta problemas de infraestrutura (falta de luz, vias colapsadas) e define quais doações estão bloqueadas ou são urgentes. | Painel Interno (Login RBAC: `COORDENADOR`) |
| **Administrador Geral** | Tem visão sistêmica de todos os abrigos, cadastra novos coordenadores, gerencia a plataforma e audita os logs de segurança e movimentações. | Painel Interno (Login RBAC: `ADMIN`) |
