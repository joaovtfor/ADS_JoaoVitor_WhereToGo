import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// DESIGN.md v2 §2: todo o app usa só os tokens de cor (bg-superficie, text-texto-2...).
// Paleta crua do Tailwind e hex fixo em classes são barrados aqui.
const PALETA_CRUA =
  "/(?:^|[\\s:])(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|decoration|accent|caret|shadow)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d|\\[#)/";
const AVISO_PALETA = "Use os tokens de cor do DESIGN.md v2 (ex.: bg-superficie, text-texto-2, bg-primaria, text-critico-claro) em vez da paleta crua do Tailwind ou de hex fixo.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${PALETA_CRUA}]`, message: AVISO_PALETA },
        { selector: `TemplateElement[value.raw=${PALETA_CRUA}]`, message: AVISO_PALETA },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
