import bcrypt from "bcryptjs";

const CUSTO_BCRYPT = 12;

// Hash válido de uma senha aleatória: usado para comparar quando o e-mail não
// existe, igualando o tempo de resposta (mitiga enumeração de usuários).
const HASH_FICTICIO = "$2b$12$TdeNAdO8hr0n52IN0Z1RsuldeCkYAkzL.QSkL8wK2Vb.nitXi4CzO";

export function gerarHashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

export function compararSenha(senha: string, hash: string | null | undefined): Promise<boolean> {
  return bcrypt.compare(senha, hash ?? HASH_FICTICIO);
}
