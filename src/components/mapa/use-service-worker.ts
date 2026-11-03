"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (`public/sw.js`) só no build de produção: em
 * `next dev` ele guardaria versões antigas da página e atrapalharia o hot
 * reload, então qualquer registro anterior é removido.
 */
export function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registros) => registros.forEach((r) => void r.unregister()));
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o mapa funciona normalmente, só sem o modo offline.
    });
  }, []);
}
