/** Remove máscara do CPF ("123.456.789-09" -> "12345678909"). */
export function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/**
 * Máscara de exibição (LGPD - minimização): "12345678909" -> "***.456.789-**".
 * Mantém os 6 dígitos centrais, suficientes para conferir o documento na mão da pessoa.
 */
export function mascararCpf(cpf: string): string {
  const digitos = normalizarCpf(cpf);
  if (digitos.length !== 11) return "***";
  return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`;
}

/** Valida tamanho, sequências repetidas e os dois dígitos verificadores. */
export function cpfValido(cpf: string): boolean {
  const digitos = normalizarCpf(cpf);
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;

  const calcularDigito = (quantidade: number) => {
    let soma = 0;
    for (let i = 0; i < quantidade; i++) soma += Number(digitos[i]) * (quantidade + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return calcularDigito(9) === Number(digitos[9]) && calcularDigito(10) === Number(digitos[10]);
}
