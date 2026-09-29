# RF08 - Roteamento de Doações (Filtro por Necessidade)

## Metadados
- **Identificador**: RF08
- **Caso de Uso**: UC03 Roteamento de Doações (Filtro por Necessidade)
- **História de Usuário**: HU08 – Filtrar abrigos por necessidade no mapa
- **Importância**: Importante
- **Priorização**: 2
- **Dependências**: RF06, RF03

---

## Descrição do Requisito
O sistema deve permitir que o doador selecione quais categorias de itens ele possui para doar (ex: água, cobertores, alimentos, medicamentos) e, com base nisso, destacar no mapa os abrigos mais próximos que necessitam urgentemente desses itens específicos.

---

## Regras de Negócio (RN)
1. **Filtro de Urgência**: O filtro deve buscar apenas abrigos em que o Coordenador tenha classificado o item específico com a flag de `"URGENTE"`.
2. **Exclusão de Bloqueados**: Abrigos que marcaram o item como `"BLOQUEADO"` (não aceitam mais doações deste tipo) não devem ser destacados para o doador caso o filtro seja aplicado.
3. **Cálculo de Proximidade (PostGIS)**: Ordenação ou destaque de abrigos calculados via coordenadas geográficas da localização do doador.

---

## Critérios de Aceite
- A aplicação web pública possui menu visual e limpo de filtros rápidos (ícones minimalistas representando água, comida, higiene, cobertores, etc.).
- O filtro é utilizável sem login ou cadastro.
- Ao clicar no ícone "Água", o mapa foca e destaca os marcadores dos abrigos que demandam água urgentemente, diminuindo a opacidade ou ocultando os demais.
