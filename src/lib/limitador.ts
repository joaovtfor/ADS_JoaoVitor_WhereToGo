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
}

/** Login: no máximo 10 falhas por (IP + e-mail) a cada 15 minutos. */
export const limitadorLogin = new LimitadorTentativas(10, 15 * 60 * 1000);
