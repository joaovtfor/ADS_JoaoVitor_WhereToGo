const DB_NOME = "wtg-mapa";
const VERSAO_DB = 1;
const STORE_NOME = "estado";
const CHAVE_SNAPSHOT = "ultimo-snapshot";
const CHAVE_LEGADA_LOCALSTORAGE = "wtg:mapa:ultimo-estado";

let cancelamentoPendente: (() => void) | null = null;

function abrirBanco(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolver) => {
    try {
      const requisicao = indexedDB.open(DB_NOME, VERSAO_DB);
      requisicao.onupgradeneeded = () => {
        const db = requisicao.result;
        if (!db.objectStoreNames.contains(STORE_NOME)) {
          db.createObjectStore(STORE_NOME);
        }
      };
      requisicao.onsuccess = () => resolver(requisicao.result);
      requisicao.onerror = () => resolver(null);
      requisicao.onblocked = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
}

function lerDoBanco<T>(db: IDBDatabase): Promise<T | null> {
  return new Promise((resolver) => {
    try {
      const tx = db.transaction(STORE_NOME, "readonly");
      const req = tx.objectStore(STORE_NOME).get(CHAVE_SNAPSHOT);
      req.onsuccess = () => resolver((req.result as T | undefined) ?? null);
      req.onerror = () => resolver(null);
      tx.onabort = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
}

function gravarNoBanco<T>(db: IDBDatabase, estado: T): Promise<boolean> {
  return new Promise((resolver) => {
    try {
      const tx = db.transaction(STORE_NOME, "readwrite");
      tx.objectStore(STORE_NOME).put(estado, CHAVE_SNAPSHOT);
      tx.oncomplete = () => resolver(true);
      tx.onerror = () => resolver(false);
      tx.onabort = () => resolver(false);
    } catch {
      resolver(false);
    }
  });
}

function lerLegadoLocalStorage<T>(): T | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const bruto = localStorage.getItem(CHAVE_LEGADA_LOCALSTORAGE);
    if (!bruto) return null;
    return JSON.parse(bruto) as T;
  } catch {
    return null;
  }
}

function removerLegadoLocalStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CHAVE_LEGADA_LOCALSTORAGE);
  } catch {
    // Armazenamento bloqueado: ignora.
  }
}

/**
 * Lê o último snapshot offline do IndexedDB; se vazio, migra uma única vez
 * da chave legada do `localStorage` e a remove. Retorna `null` se indisponível.
 */
export async function lerEstadoOffline<T>(): Promise<T | null> {
  const db = await abrirBanco();
  if (!db) return null;

  try {
    const salvo = await lerDoBanco<T>(db);
    if (salvo !== null) return salvo;

    const legado = lerLegadoLocalStorage<T>();
    if (legado === null) return null;

    const migrado = await gravarNoBanco(db, legado);
    if (migrado) removerLegadoLocalStorage();
    return legado;
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      // Ignora erro ao fechar conexão.
    }
  }
}

/** Persiste o snapshot offline no IndexedDB, silenciando erros de ambiente/cota. */
export async function salvarEstadoOffline<T>(estado: T): Promise<void> {
  const db = await abrirBanco();
  if (!db) return;

  try {
    await gravarNoBanco(db, estado);
  } catch {
    // Armazenamento cheio ou bloqueado: segue sem modo offline.
  } finally {
    try {
      db.close();
    } catch {
      // Ignora erro ao fechar conexão.
    }
  }
}

/**
 * Agenda a gravação offline com debounce (1000 ms por padrão) seguido de
 * `requestIdleCallback` (com fallback `setTimeout`), retornando função de cancelamento.
 */
export function agendarSalvamentoOffline<T>(estado: T, atrasoMs = 1000): () => void {
  cancelamentoPendente?.();

  let cancelado = false;
  let timerDebounce: ReturnType<typeof setTimeout> | undefined;
  let timerFallback: ReturnType<typeof setTimeout> | undefined;
  let idIdle: number | undefined;

  const cancelar = () => {
    if (cancelado) return;
    cancelado = true;
    if (timerDebounce !== undefined) clearTimeout(timerDebounce);
    if (timerFallback !== undefined) clearTimeout(timerFallback);
    if (idIdle !== undefined && typeof cancelIdleCallback === "function") cancelIdleCallback(idIdle);
    if (cancelamentoPendente === cancelar) cancelamentoPendente = null;
  };

  const executar = () => {
    if (cancelado) return;
    if (cancelamentoPendente === cancelar) cancelamentoPendente = null;
    void salvarEstadoOffline(estado);
  };

  timerDebounce = setTimeout(() => {
    timerDebounce = undefined;
    if (cancelado) return;

    if (typeof requestIdleCallback === "function") {
      idIdle = requestIdleCallback(
        () => {
          idIdle = undefined;
          executar();
        },
        { timeout: 2000 },
      );
    } else {
      timerFallback = setTimeout(() => {
        timerFallback = undefined;
        executar();
      }, 0);
    }
  }, atrasoMs);

  cancelamentoPendente = cancelar;
  return cancelar;
}
