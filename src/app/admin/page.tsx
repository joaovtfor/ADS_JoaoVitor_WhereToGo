"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAdmin } from "./contexto-admin";

export default function AdminIndexPage() {
  const { usuario } = useAdmin();
  const router = useRouter();

  useEffect(() => {
    router.replace(usuario.redirecionarPara);
  }, [router, usuario.redirecionarPara]);

  return (
    <div className="py-12 text-center text-sm text-slate-400">
      Redirecionando para {usuario.redirecionarPara}...
    </div>
  );
}
