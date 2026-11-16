import type { LucideIcon } from "lucide-react";

interface PropriedadesIcone {
  /** Componente de ícone do lucide-react (ex.: `MapPin`). */
  de: LucideIcon;
  tamanho?: number;
  className?: string;
}

/**
 * Ícone decorativo no traço padrão do sistema. Fica fora da árvore de
 * acessibilidade: o significado vem sempre do texto ou do `aria-label` ao lado.
 */
export function Icone({ de: Desenho, tamanho = 18, className }: PropriedadesIcone) {
  return <Desenho size={tamanho} strokeWidth={1.75} aria-hidden className={className ? `shrink-0 ${className}` : "shrink-0"} />;
}
