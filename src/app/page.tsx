// Página provisória: o mapa público (Leaflet) é entregue na Semana 5 do cronograma.
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-3xl font-bold">WhereToGo</h1>
      <p>
        Backend da plataforma em funcionamento. O mapa público de abrigos e o painel administrativo
        serão disponibilizados nas próximas entregas.
      </p>
      <ul className="list-disc pl-6 text-sm">
        <li>
          Saúde da API: <code>/api/health</code>
        </li>
        <li>
          Abrigos (público): <code>/api/public/abrigos</code>
        </li>
      </ul>
    </main>
  );
}
