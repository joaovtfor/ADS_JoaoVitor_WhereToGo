// Valores fixos para os testes unitários (não acessam banco).
process.env.JWT_SECRET ??= "chave-de-teste-unitario-com-mais-de-32-caracteres";
process.env.DATABASE_URL ??= "postgresql://nao-usado-em-testes-unitarios";
