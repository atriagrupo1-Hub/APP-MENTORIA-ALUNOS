-- O estado "para moderar".
--
-- Sozinho nesta migration porque o PostgreSQL não deixa usar um valor
-- novo de enum na mesma transação que o criou. A 0040 é quem passa a
-- usá-lo como padrão.

alter type status_comentario add value if not exists 'pendente' before 'publicado';
