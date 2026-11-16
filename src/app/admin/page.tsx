"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAdmin } from "./contexto-admin";

/** `/admin` não tem tela própria: leva para a seção inicial do perfil (o proxy já faz isso na maioria dos casos). */
export default function AdminIndexPage() {
  const { usuario } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    router.replace(usuario.redirecionarPara);
  }, [router, usuario.redirecionarPara]);

  return <p className="py-12 text-center text-corpo text-texto-2">Abrindo o painel...</p>;
}
