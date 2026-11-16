import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Icone } from "@/components/ui/icone";

interface PropriedadesLinhaFicha {
  icone: LucideIcon;
  rotulo: string;
  children: ReactNode;
}

/** Uma informação da ficha: ícone, rótulo discreto e valor, separada da anterior por divisória. */
export function LinhaFicha({ icone, rotulo, children }: PropriedadesLinhaFicha) {
  return (
    <div className="flex gap-3 border-t border-borda py-3">
      <Icone de={icone} className="mt-0.5 text-texto-3" />
      <div className="min-w-0 flex-1">
        <h3 className="text-meta font-normal text-texto-3">{rotulo}</h3>
        <div className="mt-0.5 text-corpo text-texto">{children}</div>
      </div>
    </div>
  );
}
