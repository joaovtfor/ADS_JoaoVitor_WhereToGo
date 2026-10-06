import { consultarUm } from "@/lib/db";
import { rota } from "@/lib/http";

/** Verificação de saúde (healthcheck do Docker): aplicação + banco + PostGIS. */
export const GET = rota(async () => {
  try {
    const banco = await consultarUm<{ postgis: string }>("SELECT postgis_lib_version() AS postgis");
    return Response.json(
      { status: "ok", banco: "ok", postgis: banco?.postgis ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    console.error("[health] banco indisponível", erro);
    return Response.json(
      { status: "erro", banco: "indisponivel" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
});
