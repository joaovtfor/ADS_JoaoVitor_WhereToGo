import {
  buscarUsuarioAcessoPorEmail,
  buscarUsuarioAcessoPorId,
  motivoBloqueio,
  paraSessao,
  type MotivoBloqueio,
} from "@/lib/auth/acesso";
import { assinarToken } from "@/lib/auth/jwt";
import { ROTA_INICIAL_POR_PAPEL, type Contexto, type Papel } from "@/lib/auth/rbac";
import { compararSenha, gerarHashSenha } from "@/lib/auth/senha";
import { auditar, registrarAuditoria } from "@/lib/auditoria";
import { consultar, consultarUm } from "@/lib/db";
import { ErroApi, erros } from "@/lib/http";
import { limitadorLogin } from "@/lib/limitador";
import { z } from "@/lib/validacao";

/** Senha: mínimo 8 caracteres; máximo 72 bytes (limite do bcrypt). */
export const esquemaSenha = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .refine((s) => new TextEncoder().encode(s).length <= 72, "A senha deve ter no máximo 72 bytes.");

export const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
  senha: z.string().min(1, "Informe a senha.").max(200),
});

export const esquemaAlterarSenha = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual."),
  novaSenha: esquemaSenha,
});

const MENSAGEM_CREDENCIAIS_INVALIDAS = "Credenciais inválidas.";

const MENSAGENS_BLOQUEIO: Record<MotivoBloqueio, string> = {
  USUARIO_INATIVO: "Acesso negado: usuário inativo.",
  SEM_VINCULO_ABRIGO: "Acesso negado: usuário não está vinculado a um abrigo.",
  ABRIGO_INATIVO: "Acesso negado: o abrigo vinculado ao usuário está desativado.",
};

export interface ResultadoLogin {
  token: string;
  expiraEm: Date;
  usuario: { id: number; nome: string; email: string; papel: Papel; idAbrigo: number | null; abrigo: string | null };
  redirecionarPara: string;
}

/**
 * UC01 / HU01 - valida e-mail e senha (bcrypt), aplica as regras de bloqueio
 * e gera o JWT com o papel do usuário. Falhas retornam sempre a mesma
 * mensagem genérica, sem revelar se o erro foi no e-mail ou na senha.
 */
export async function login(dados: z.infer<typeof esquemaLogin>, ip: string | null): Promise<ResultadoLogin> {
  const chaveLimite = `${ip ?? "desconhecido"}|${dados.email}`;
  const espera = limitadorLogin.segundosBloqueado(chaveLimite);
  if (espera > 0) {
    throw erros.muitasTentativas(`Muitas tentativas de login. Tente novamente em ${Math.ceil(espera / 60)} minuto(s).`);
  }

  const usuario = await buscarUsuarioAcessoPorEmail(dados.email);
  // Compara mesmo quando o usuário não existe, para igualar o tempo de resposta.
  const senhaConfere = await compararSenha(dados.senha, usuario?.senhaHash);

  if (!usuario || !senhaConfere) {
    limitadorLogin.registrarFalha(chaveLimite);
    registrarAuditoria({
      acao: "LOGIN_FALHA",
      descricao: `Tentativa de login malsucedida para ${dados.email}`,
      idUsuario: usuario?.id ?? null,
      idAbrigo: usuario?.idAbrigo ?? null,
      detalhes: { email: dados.email },
      ip,
    });
    throw erros.naoAutenticado(MENSAGEM_CREDENCIAIS_INVALIDAS);
  }

  const bloqueio = motivoBloqueio(usuario);
  if (bloqueio) {
    registrarAuditoria({
      acao: "LOGIN_BLOQUEADO",
      descricao: `Login negado para ${usuario.email}: ${bloqueio}`,
      idUsuario: usuario.id,
      idAbrigo: usuario.idAbrigo,
      detalhes: { motivo: bloqueio },
      ip,
    });
    throw new ErroApi(403, bloqueio, MENSAGENS_BLOQUEIO[bloqueio]);
  }

  limitadorLogin.limpar(chaveLimite);
  const sessao = paraSessao(usuario);
  const { token, expiraEm } = await assinarToken(sessao);
  const abrigo = sessao.idAbrigo
    ? await consultarUm<{ nome: string }>("SELECT nome FROM abrigo WHERE id = $1", [sessao.idAbrigo])
    : null;

  registrarAuditoria({
    acao: "LOGIN_SUCESSO",
    descricao: `Login de ${sessao.email} (${sessao.papel})`,
    idUsuario: sessao.id,
    idAbrigo: sessao.idAbrigo,
    ip,
  });

  return {
    token,
    expiraEm,
    usuario: { ...sessao, abrigo: abrigo?.nome ?? null },
    redirecionarPara: ROTA_INICIAL_POR_PAPEL[sessao.papel],
  };
}

/** Dados da sessão atual (GET /api/auth/me). */
export async function obterPerfil(ctx: Contexto) {
  const [perfil] = await consultar<{ abrigo: string | null }>(
    "SELECT a.nome AS abrigo FROM usuario u LEFT JOIN abrigo a ON a.id = u.id_abrigo WHERE u.id = $1",
    [ctx.usuario.id],
  );
  return {
    ...ctx.usuario,
    abrigo: perfil?.abrigo ?? null,
    redirecionarPara: ROTA_INICIAL_POR_PAPEL[ctx.usuario.papel],
  };
}

export async function alterarSenha(ctx: Contexto, dados: z.infer<typeof esquemaAlterarSenha>): Promise<void> {
  const usuario = await buscarUsuarioAcessoPorId(ctx.usuario.id);
  if (!usuario || !(await compararSenha(dados.senhaAtual, usuario.senhaHash))) {
    throw erros.regraDeNegocio("SENHA_ATUAL_INCORRETA", "A senha atual está incorreta.");
  }
  if (dados.senhaAtual === dados.novaSenha) {
    throw erros.regraDeNegocio("SENHA_REPETIDA", "A nova senha deve ser diferente da atual.");
  }

  await consultar("UPDATE usuario SET senha_hash = $1 WHERE id = $2", [await gerarHashSenha(dados.novaSenha), ctx.usuario.id]);
  auditar(ctx, { acao: "SENHA_ALTERADA", descricao: `Senha alterada por ${ctx.usuario.email}`, idAbrigo: ctx.usuario.idAbrigo });
}
