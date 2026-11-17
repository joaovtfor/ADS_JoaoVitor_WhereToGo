/**
 * Limitador em memória (janela fixa): mitiga força bruta no login e abuso das
 * rotas públicas. Suficiente para uma instância única (Docker/MVP); com várias
 * réplicas, o estado deveria ir para um armazenamento compartilhado (ex.: Redis).
 */
export class LimitadorTentativas {
  private readonly registros = new Map<string, { falhas: number; expiraEm: number }>();

  constructor(
    private readonly maxFalhas: number,
    private readonly janelaMs: number,
  ) {}

  /** Segundos até liberar, ou 0 se a chave não está bloqueada. */
  segundosBloqueado(chave: string, agora = Date.now()): number {
    const registro = this.registros.get(chave);
    if (!registro) return 0;
    if (registro.expiraEm <= agora) {
      this.registros.delete(chave);
      return 0;
    }
    return registro.falhas >= this.maxFalhas ? Math.ceil((registro.expiraEm - agora) / 1000) : 0;
  }

  registrarFalha(chave: string, agora = Date.now()): void {
    if (this.registros.size >= 5000) this.podarExpirados(agora);
    const registro = this.registros.get(chave);
    if (!registro || registro.expiraEm <= agora) {
      this.registros.set(chave, { falhas: 1, expiraEm: agora + this.janelaMs });
      return;
    }
    registro.falhas += 1;
  }

  /**
   * Conta um uso da chave (limite de requisições, e não só de falhas). Devolve
   * os segundos de espera se o limite já foi atingido, ou 0 se o uso foi aceito.
   */
  consumir(chave: string, agora = Date.now()): number {
    const espera = this.segundosBloqueado(chave, agora);
    if (espera === 0) this.registrarFalha(chave, agora);
    return espera;
  }

  limpar(chave: string): void {
    this.registros.delete(chave);
  }

  private podarExpirados(agora: number): void {
    for (const [k, v] of this.registros) {
      if (v.expiraEm <= agora) this.registros.delete(k);
    }
  }
}

/** Login: no máximo 10 falhas por (IP + e-mail) a cada 15 minutos. */
export const limitadorLogin = new LimitadorTentativas(10, 15 * 60 * 1000);

/** Proteção complementar por conta (e-mail) contra rotação/spoofing de X-Forwarded-For. */
export const limitadorEmailLogin = new LimitadorTentativas(25, 15 * 60 * 1000);

/**
 * Falhas de login por IP, qualquer que seja o e-mail: barra a varredura com
 * e-mails aleatórios, que escapa dos limites acima e consome CPU com bcrypt.
 */
export const limitadorIpLogin = new LimitadorTentativas(50, 15 * 60 * 1000);

/**
 * Google One Tap: credenciais inválidas e auto-cadastros por IP (cada
 * auto-cadastro gera um hash bcrypt). Logins de contas existentes não contam.
 */
export const limitadorGoogle = new LimitadorTentativas(30, 15 * 60 * 1000);

/**
 * Reporte cidadão (rota pública de escrita): no máximo 10 envios por IP a cada
 * 15 minutos. Sem isso, um script enche a fila de moderação da coordenação.
 * A folga cobre várias pessoas atrás do mesmo IP (Wi-Fi de um abrigo).
 */
export const limitadorReportePublico = new LimitadorTentativas(10, 15 * 60 * 1000);

/**
 * Busca pública de acolhidos: no máximo 30 consultas por IP a cada 5 minutos.
 * Quem procura um familiar tenta algumas grafias; varrer o cadastro inteiro
 * com combinações de 3 letras exige milhares de consultas.
 */
export const limitadorBuscaAcolhidos = new LimitadorTentativas(30, 5 * 60 * 1000);
