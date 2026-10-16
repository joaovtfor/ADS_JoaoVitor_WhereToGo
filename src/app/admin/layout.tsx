import { Suspense, type ReactNode } from "react";
import { AdminShell } from "./contexto-admin";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-6 text-sm">
          Carregando painel operacional...
        </div>
      }
    >
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
