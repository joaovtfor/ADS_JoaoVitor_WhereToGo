/**
 * Monta as cláusulas SET de um UPDATE parcial (PATCH) a partir dos campos
 * enviados. Campos `undefined` são ignorados; `null` limpa a coluna.
 *
 * @param colunas mapa campoDaApi -> coluna do banco (lista branca de colunas)
 * @param inicio  número do primeiro placeholder ($n)
 */
export function montarAtualizacao(
  dados: Record<string, unknown>,
  colunas: Record<string, string>,
  inicio = 1,
): { sets: string[]; valores: unknown[] } {
  const sets: string[] = [];
  const valores: unknown[] = [];

  for (const [campo, coluna] of Object.entries(colunas)) {
    if (dados[campo] === undefined) continue;
    valores.push(dados[campo]);
    sets.push(`${coluna} = $${inicio + valores.length - 1}`);
  }

  return { sets, valores };
}
