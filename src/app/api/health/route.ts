import { consultarUm } from "@/lib/db";
import { rota } from "@/lib/http";

/** Verificação de saúde (healthcheck do Docker / Render / CDN): aplicação + banco + PostGIS. */
export const GET = rota(async () => {
  const inicio = performance.now();
  try {
    const banco = await consultarUm<{ postgis: string }>("SELECT postgis_lib_version() AS postgis");
    const latenciaBancoMs = Math.round((performance.now() - inicio) * 100) / 100;
    return Response.json(
      {
        status: "ok",
        versao: "1.0.0",
        ambiente: process.env.NODE_ENV ?? "development",
        banco: "ok",
        postgis: banco?.postgis ?? null,
        latenciaBancoMs,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    console.error("[health] banco indisponível", erro);
    return Response.json(
      { status: "erro", versao: "1.0.0", banco: "indisponivel" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
});
