import Link from "next/link";

// O mapa público interativo (Leaflet) é entregue na Semana 5 do cronograma.
export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6">
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-black text-lg">
            W
          </span>
          <div>
            <span className="font-bold tracking-tight text-lg block leading-none text-white">WhereToGo</span>
            <span className="text-xs text-slate-400">Gestão de Crise e Abrigos Emergenciais</span>
          </div>
        </div>
        <Link
          href="/login"
          className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 transition"
        >
          Acesso Restrito (Equipe) →
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-6 py-12">
        <div className="space-y-3">
          <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-300">
            Marco Concluído: Semanas 1 a 4 (Infra + Backend + Painel Admin & Fast-CRUD Touch)
          </span>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            Coordenação em Tempo Real para Abrigos de Emergência
          </h1>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl">
            Plataforma integrada para controle de vagas, triagem rápida de acolhidos, gestão de suprimentos (Fast-CRUD),
            reporte de vias colapsadas e trilha de auditoria imutável.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 transition"
          >
            Entrar no Painel Operacional (/login)
          </Link>
          <Link
            href="/admin/dashboard"
            className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            Dashboard do Coordenador
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-1">
            <p className="text-xs font-bold uppercase text-amber-400">RF01 • RBAC Segmentado</p>
            <p className="text-sm font-semibold text-white">Login por Perfil</p>
            <p className="text-xs text-slate-400">
              Redirecionamento automático para Voluntário, Coordenador ou Administrador Geral.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-1">
            <p className="text-xs font-bold uppercase text-amber-400">RF04 & RF12 • Triagem</p>
            <p className="text-sm font-semibold text-white">Lotação e Acolhidos</p>
            <p className="text-xs text-slate-400">
              Ajuste rápido de fila não triada, check-in nominal, transferências e semáforo de vagas.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-1">
            <p className="text-xs font-bold uppercase text-amber-400">RF05 & RF09 • Vias e Infra</p>
            <p className="text-sm font-semibold text-white">Alertas Operacionais</p>
            <p className="text-xs text-slate-400">
              Reporte em 1 clique de queda de energia, falta de água, alagamentos e vias interditadas.
            </p>
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl border-t border-slate-900 pt-4 text-xs text-slate-500 flex flex-wrap justify-between gap-2">
        <span>WhereToGo • UPF / Análise e Desenvolvimento de Sistemas</span>
        <span>
          API Pública: <code>/api/public/abrigos</code> • <code>/api/public/alertas</code> • <code>/api/health</code>
        </span>
      </footer>
    </div>
  );
}
