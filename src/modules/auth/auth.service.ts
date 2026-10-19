import { randomUUID } from "node:crypto";
import {
  buscarUsuarioAcessoPorEmail,
  buscarUsuarioAcessoPorGoogleSub,
  buscarUsuarioAcessoPorId,
  motivoBloqueio,
  paraSessao,
  type MotivoBloqueio,
} from "@/lib/auth/acesso";
import { obterPerfilGoogle } from "@/lib/auth/google";
import { assinarToken } from "@/lib/auth/jwt";
import { ROTA_INICIAL_POR_PAPEL, type Contexto, type Papel } from "@/lib/auth/rbac";
import { compararSenha, gerarHashSenha } from "@/lib/auth/senha";
import { auditar, registrarAuditoria } from "@/lib/auditoria";
import { consultar, consultarUm } from "@/lib/db";
import { ErroApi, erros } from "@/lib/http";
import { limitadorEmailLogin, limitadorLogin } from "@/lib/limitador";
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

export const esquemaLoginGoogle = z
  .object({
    credential: z.string().min(10).optional(),
    credencialSimulada: z
      .object({
        email: z.string().trim().toLowerCase().pipe(z.email("E-mail Google inválido.").max(255)),
        nome: z.string().trim().min(2, "Informe o nome da conta Google.").max(150),
        sub: z.string().trim().min(3).max(128).optional(),
      })
      .optional(),
    idAbrigo: z.coerce.number().int().positive().optional(),
  })
  .refine((d) => Boolean(d.credential || d.credencialSimulada), {
    message: "Informe uma credencial do Google One Tap.",
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
  const espera = Math.max(
    limitadorLogin.segundosBloqueado(chaveLimite),
    limitadorEmailLogin.segundosBloqueado(dados.email),
  );
  if (espera > 0) {
    registrarAuditoria({
      acao: "LOGIN_BLOQUEADO",
      descricao: `Tentativa de login bloqueada por limite de tentativas para ${dados.email}`,
      idUsuario: null,
      detalhes: { email: dados.email, motivo: "MUITAS_TENTATIVAS" },
      ip,
    });
    throw erros.muitasTentativas(`Muitas tentativas de login. Tente novamente em ${Math.ceil(espera / 60)} minuto(s).`);
  }

  const usuario = await buscarUsuarioAcessoPorEmail(dados.email);
  // Compara mesmo quando o usuário não existe, para igualar o tempo de resposta.
  const senhaConfere = await compararSenha(dados.senha, usuario?.senhaHash);

  if (!usuario || !senhaConfere) {
    limitadorLogin.registrarFalha(chaveLimite);
    limitadorEmailLogin.registrarFalha(dados.email);
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
  limitadorEmailLogin.limpar(dados.email);
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

export type ResultadoAutenticacaoGoogle =
  | ({ status: "AUTENTICADO" } & ResultadoLogin)
  | {
      status: "REQUER_ABRIGO";
      perfilGoogle: { nome: string; email: string };
      mensagem: string;
    }
  | {
      status: "PENDENTE_APROVACAO";
      mensagem: string;
      usuario: {
        id: number;
        nome: string;
        email: string;
        papel: Papel;
        idAbrigo: number | null;
        abrigo: string | null;
      };
    };

/**
 * Autenticação e auto-cadastro via Google One Tap (RF01 / RF11):
 * - Se o usuário já existe e está ativo: vincula `google_sub` (se necessário) e autentica com 1 toque.
 * - Se o usuário já existe mas está inativo (pendente de aprovação): retorna `PENDENTE_APROVACAO`.
 * - Se o usuário ainda não existe:
 *   - Sem `idAbrigo`: retorna `REQUER_ABRIGO` para o usuário escolher em qual abrigo vai atuar.
 *   - Com `idAbrigo`: cria registro `VOLUNTARIO` com `ativo = FALSE` aguardando aprovação de Coordenador/Admin.
 */
export async function autenticarComGoogle(
  dados: z.infer<typeof esquemaLoginGoogle>,
  ip: string | null,
): Promise<ResultadoAutenticacaoGoogle> {
  const perfil = await obterPerfilGoogle(dados);

  const porSub = await buscarUsuarioAcessoPorGoogleSub(perfil.sub);
  const existente = porSub ?? (await buscarUsuarioAcessoPorEmail(perfil.email));

  if (existente) {
    if (existente.googleSub && existente.googleSub !== perfil.sub) {
      throw erros.conflito(
        "CONFLITO_CONTA_GOOGLE",
        "Este e-mail já está vinculado a outra conta Google.",
      );
    }

    if (!existente.googleSub) {
      await consultar("UPDATE usuario SET google_sub = $1 WHERE id = $2", [perfil.sub, existente.id]);
    }

    const abrigo = existente.idAbrigo
      ? await consultarUm<{ nome: string }>("SELECT nome FROM abrigo WHERE id = $1", [existente.idAbrigo])
      : null;

    if (!existente.ativo) {
      registrarAuditoria({
        acao: "LOGIN_GOOGLE_PENDENTE",
        descricao: `Tentativa de acesso via Google de usuário pendente/inativo: ${existente.email}`,
        idUsuario: existente.id,
        idAbrigo: existente.idAbrigo,
        ip,
      });
      return {
        status: "PENDENTE_APROVACAO",
        mensagem: `Seu cadastro para ${abrigo?.nome ?? "o abrigo"} já foi registrado e aguarda aprovação do Coordenador ou da Administração Geral.`,
        usuario: {
          id: existente.id,
          nome: existente.nome,
          email: existente.email,
          papel: existente.papel,
          idAbrigo: existente.idAbrigo,
          abrigo: abrigo?.nome ?? null,
        },
      };
    }

    const bloqueio = motivoBloqueio(existente);
    if (bloqueio) {
      registrarAuditoria({
        acao: "LOGIN_BLOQUEADO",
        descricao: `Login via Google negado para ${existente.email}: ${bloqueio}`,
        idUsuario: existente.id,
        idAbrigo: existente.idAbrigo,
        detalhes: { motivo: bloqueio },
        ip,
      });
      throw new ErroApi(403, bloqueio, MENSAGENS_BLOQUEIO[bloqueio]);
    }

    const sessao = paraSessao(existente);
    const { token, expiraEm } = await assinarToken(sessao);

    registrarAuditoria({
      acao: "LOGIN_SUCESSO",
      descricao: `Login via Google One Tap de ${sessao.email} (${sessao.papel})`,
      idUsuario: sessao.id,
      idAbrigo: sessao.idAbrigo,
      detalhes: { metodo: "GOOGLE_ONE_TAP" },
      ip,
    });

    return {
      status: "AUTENTICADO",
      token,
      expiraEm,
      usuario: { ...sessao, abrigo: abrigo?.nome ?? null },
      redirecionarPara: ROTA_INICIAL_POR_PAPEL[sessao.papel],
    };
  }

  // Novo usuário: exige escolher o abrigo onde atuará como voluntário
  if (!dados.idAbrigo) {
    return {
      status: "REQUER_ABRIGO",
      perfilGoogle: {
        nome: perfil.nome,
        email: perfil.email,
      },
      mensagem:
        "Conta Google verificada! Escolha abaixo em qual abrigo você deseja atuar como voluntário para enviar sua solicitação.",
    };
  }

  const abrigo = await consultarUm<{ id: number; nome: string; ativo: boolean }>(
    "SELECT id, nome, ativo FROM abrigo WHERE id = $1",
    [dados.idAbrigo],
  );
  if (!abrigo) throw erros.naoEncontrado("Abrigo");
  if (!abrigo.ativo) {
    throw erros.conflito("ABRIGO_INATIVO", "Não é possível solicitar vínculo a um abrigo desativado.");
  }

  const nomeNormalizado = perfil.nome.trim().slice(0, 150) || perfil.email.split("@")[0];
  const senhaAleatoriaHash = await gerarHashSenha(`${randomUUID()}-${randomUUID()}`);

  const criado = await consultarUm<{ id: number }>(
    `INSERT INTO usuario (id_papel, id_abrigo, nome, email, senha_hash, google_sub, ativo)
     VALUES ((SELECT id FROM papel_usuario WHERE nome = 'VOLUNTARIO'), $1, $2, $3, $4, $5, FALSE)
     RETURNING id`,
    [abrigo.id, nomeNormalizado, perfil.email, senhaAleatoriaHash, perfil.sub],
  );

  registrarAuditoria({
    acao: "AUTO_CADASTRO_GOOGLE",
    descricao: `Solicitação de cadastro via Google One Tap por ${perfil.email} para ${abrigo.nome}`,
    idUsuario: criado!.id,
    idAbrigo: abrigo.id,
    detalhes: {
      email: perfil.email,
      nome: nomeNormalizado,
      idAbrigo: abrigo.id,
      metodo: "GOOGLE_ONE_TAP",
    },
    ip,
  });

  return {
    status: "PENDENTE_APROVACAO",
    mensagem: `Solicitação enviada para ${abrigo.nome}! Assim que o Coordenador ou a Administração Geral aprovar seu acesso na aba "Equipe & Acessos", você poderá entrar com 1 toque.`,
    usuario: {
      id: criado!.id,
      nome: nomeNormalizado,
      email: perfil.email,
      papel: "VOLUNTARIO",
      idAbrigo: abrigo.id,
      abrigo: abrigo.nome,
    },
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
