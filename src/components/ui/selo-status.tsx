import type { ReactNode } from "react";
import { juntarClasses } from "./classes";

export type NivelStatus = "ok" | "atencao" | "critico" | "neutro";

const PONTO: Record<NivelStatus, string> = {
  ok: "bg-ok",
  atencao: "bg-atencao",
  critico: "bg-critico",
  neutro: "bg-texto-3",
};

const PREENCHIDO: Record<NivelStatus, string> = {
  ok: "bg-ok/12 text-ok-claro",
  atencao: "bg-atencao/12 text-atencao-claro",
  critico: "bg-critico/12 text-critico-claro",
  neutro: "bg-superficie-2 text-texto-2",
};

interface PropriedadesSeloStatus {
  nivel: NivelStatus;
  /** O rótulo é obrigatório: a cor nunca é o único sinal do estado. */
  children: ReactNode;
  /**
   * `ponto` (padrão): bolinha colorida + texto neutro, para listas e fichas.
   * `preenchido`: fundo tingido, só quando o estado é a informação principal do bloco.
   */
  forma?: "ponto" | "preenchido";
  className?: string;
}

/** Único lugar do sistema onde verde, âmbar e vermelho aparecem. */
export function SeloStatus({ nivel, children, forma = "ponto", className }: PropriedadesSeloStatus) {
  if (forma === "preenchido") {
    return (
      <span className={juntarClasses("inline-flex items-center gap-1.5 rounded-controle px-2 py-0.5 text-meta font-medium", PREENCHIDO[nivel], className)}>
        <span aria-hidden className={juntarClasses("size-1.5 rounded-full", PONTO[nivel])} />
        {children}
      </span>
    );
  }
  return (
    <span className={juntarClasses("inline-flex items-center gap-2 text-meta text-texto-2", className)}>
      <span aria-hidden className={juntarClasses("size-2 shrink-0 rounded-full", PONTO[nivel])} />
      {children}
    </span>
  );
}
