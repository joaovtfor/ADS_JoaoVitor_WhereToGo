import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agendarSalvamentoOffline, lerEstadoOffline, salvarEstadoOffline } from "@/components/mapa/armazenamento-offline";

const CHAVE_LEGADA = "wtg:mapa:ultimo-estado";

interface MockStore {
  dados: Map<string, unknown>;
}

function criarMockIndexedDB(opcoes: { falharAoAbrir?: boolean; falharNaGravacao?: boolean } = {}) {
  const bancos = new Map<string, Map<string, MockStore>>();
  let conexoesAbertas = 0;

  const disparar = (alvo: { [key: string]: unknown }, evento: string) => {
    const handler = alvo[evento];
    if (typeof handler === "function") (handler as () => void)();
  };

  const indexedDBMock = {
    open(nome: string) {
      const req: Record<string, unknown> = { result: null };
      queueMicrotask(() => {
        if (opcoes.falharAoAbrir) {
          disparar(req, "onerror");
          return;
        }

        let stores = bancos.get(nome);
        const precisaUpgrade = !stores;
        if (!stores) {
          stores = new Map();
          bancos.set(nome, stores);
        }

        const db = {
          objectStoreNames: {
            contains: (storeNome: string) => stores.has(storeNome),
          },
          createObjectStore: (storeNome: string) => {
            if (!stores.has(storeNome)) stores.set(storeNome, { dados: new Map() });
          },
          close: () => {
            conexoesAbertas = Math.max(0, conexoesAbertas - 1);
          },
          transaction: (storeNome: string) => {
            const store = stores.get(storeNome);
            const tx: Record<string, unknown> = {
              objectStore: () => ({
                get: (chave: string) => {
                  const getReq: Record<string, unknown> = { result: undefined };
                  queueMicrotask(() => {
                    getReq.result = store?.dados.get(chave);
                    disparar(getReq, "onsuccess");
                  });
                  return getReq;
                },
                put: (valor: unknown, chave: string) => {
                  queueMicrotask(() => {
                    if (opcoes.falharNaGravacao || !store) {
                      disparar(tx, "onerror");
                      return;
                    }
                    store.dados.set(chave, structuredClone(valor));
                    disparar(tx, "oncomplete");
                  });
                },
              }),
            };
            return tx;
          },
        };

        conexoesAbertas += 1;
        req.result = db;
        if (precisaUpgrade) disparar(req, "onupgradeneeded");
        disparar(req, "onsuccess");
      });
      return req;
    },
  };

  return {
    indexedDBMock,
    conexoesAbertas: () => conexoesAbertas,
    obterSnapshotSalvo: () => bancos.get("wtg-mapa")?.get("estado")?.dados.get("ultimo-snapshot"),
  };
}

function criarMockLocalStorage(inicial: Record<string, string> = {}) {
  const mapa = new Map<string, string>(Object.entries(inicial));
  return {
    getItem: (chave: string) => mapa.get(chave) ?? null,
    setItem: (chave: string, valor: string) => mapa.set(chave, valor),
    removeItem: (chave: string) => mapa.delete(chave),
    clear: () => mapa.clear(),
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

describe("Armazenamento offline (IndexedDB + migração localStorage)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retorna null silenciosamente quando indexedDB não está disponível ou falha ao abrir", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await lerEstadoOffline()).toBeNull();
    await expect(salvarEstadoOffline({ ok: true })).resolves.toBeUndefined();

    const { indexedDBMock } = criarMockIndexedDB({ falharAoAbrir: true });
    vi.stubGlobal("indexedDB", indexedDBMock);
    expect(await lerEstadoOffline()).toBeNull();
    await expect(salvarEstadoOffline({ ok: true })).resolves.toBeUndefined();
  });

  it("salva e lê snapshots do IndexedDB e fecha a conexão", async () => {
    const mock = criarMockIndexedDB();
    vi.stubGlobal("indexedDB", mock.indexedDBMock);

    const estado = { abrigos: [{ id: 1 }], salvoEm: "2026-11-25T12:00:00Z" };
    await salvarEstadoOffline(estado);
    expect(mock.conexoesAbertas()).toBe(0);

    const lido = await lerEstadoOffline<typeof estado>();
    expect(lido).toEqual(estado);
    expect(mock.conexoesAbertas()).toBe(0);
  });

  it("migra uma única vez da chave legada no localStorage e remove a chave antiga", async () => {
    const mock = criarMockIndexedDB();
    const legado = { abrigos: [{ id: 42 }], salvoEm: "2026-11-25T10:00:00Z" };
    const storage = criarMockLocalStorage({ [CHAVE_LEGADA]: JSON.stringify(legado) });

    vi.stubGlobal("indexedDB", mock.indexedDBMock);
    vi.stubGlobal("localStorage", storage);

    const primeiraLeitura = await lerEstadoOffline<typeof legado>();
    expect(primeiraLeitura).toEqual(legado);
    expect(storage.getItem(CHAVE_LEGADA)).toBeNull();
    expect(mock.obterSnapshotSalvo()).toEqual(legado);

    // Segunda leitura já vem direto do IndexedDB mesmo se localStorage estiver vazio
    const segundaLeitura = await lerEstadoOffline<typeof legado>();
    expect(segundaLeitura).toEqual(legado);
  });

  it("retorna null se localStorage legado contiver JSON inválido", async () => {
    const mock = criarMockIndexedDB();
    const storage = criarMockLocalStorage({ [CHAVE_LEGADA]: "{json-quebrado" });

    vi.stubGlobal("indexedDB", mock.indexedDBMock);
    vi.stubGlobal("localStorage", storage);

    expect(await lerEstadoOffline()).toBeNull();
  });

  it("aplica debounce no agendarSalvamentoOffline e permite cancelar antes de gravar", async () => {
    const mock = criarMockIndexedDB();
    vi.stubGlobal("indexedDB", mock.indexedDBMock);

    const cancelarPrimeiro = agendarSalvamentoOffline({ versao: 1 }, 1000);
    await vi.advanceTimersByTimeAsync(500);
    expect(mock.obterSnapshotSalvo()).toBeUndefined();

    // Nova chamada substitui a anterior (debounce)
    const cancelarSegundo = agendarSalvamentoOffline({ versao: 2 }, 1000);
    cancelarPrimeiro(); // cancelar o antigo não cancela o novo
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1);
    await flushMicrotasks();

    expect(mock.obterSnapshotSalvo()).toEqual({ versao: 2 });

    // Cancelamento explícito antes do prazo impede gravação
    const cancelarTerceiro = agendarSalvamentoOffline({ versao: 3 }, 1000);
    cancelarSegundo();
    cancelarTerceiro();
    await vi.advanceTimersByTimeAsync(1500);
    await flushMicrotasks();
    expect(mock.obterSnapshotSalvo()).toEqual({ versao: 2 });
  });

  it("usa requestIdleCallback quando disponível e cancela via cancelIdleCallback", async () => {
    const mock = criarMockIndexedDB();
    vi.stubGlobal("indexedDB", mock.indexedDBMock);

    const callbacks = new Map<number, IdleRequestCallback>();
    let proximoId = 1;
    const cancelIdle = vi.fn((id: number) => {
      callbacks.delete(id);
    });

    vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => {
      const id = proximoId++;
      callbacks.set(id, cb);
      return id;
    });
    vi.stubGlobal("cancelIdleCallback", cancelIdle);

    const cancelar = agendarSalvamentoOffline({ idle: 1 }, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.size).toBe(1);

    // Cancela já na fase do requestIdleCallback
    cancelar();
    expect(cancelIdle).toHaveBeenCalledTimes(1);
    expect(mock.obterSnapshotSalvo()).toBeUndefined();

    // Novo agendamento executa quando o idle callback roda
    agendarSalvamentoOffline({ idle: 2 }, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.size).toBe(1);
    const [cb] = Array.from(callbacks.values());
    cb({ didTimeout: false, timeRemaining: () => 50 });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(mock.obterSnapshotSalvo()).toEqual({ idle: 2 });
  });
});
