/**
 * Limitador de tentativas em memória (janela fixa) para mitigar força bruta no
 * login. Suficiente para uma instância única (Docker/MVP); com várias réplicas,
 * o estado deveria ir para um armazenamento compartilhado (ex.: Redis).
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

