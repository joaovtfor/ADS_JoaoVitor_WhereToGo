import { exigirContexto } from "@/lib/auth/sessao";
import { lerQuery, responder, rota } from "@/lib/http";
import { esquemaPonto, localizarMunicipio } from "@/modules/municipios/municipios.service";

/**
 * Município de um ponto, para o cadastro de abrigo mostrar "Fica em: Passo
 * Fundo/RS" enquanto o ponto é escolhido. Query: lat, lng. Responde `null`
 * fora dos municípios cadastrados. Só para a equipe logada: o mapa público
 * ganha a cidade pelo GPS numa fase futura, dentro da própria consulta.
 */
export const GET = rota(async (req) => {
  await exigirContexto(req);
  const { lat, lng } = lerQuery(req, esquemaPonto);
  return responder(await localizarMunicipio(lat, lng));
});
