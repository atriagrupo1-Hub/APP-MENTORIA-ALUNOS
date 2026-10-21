-- =====================================================================
-- 0049 — Imagem e descrição da categoria
--
-- O painel de Categorias mostra uma imagem para cada categoria e deixa
-- escrever uma descrição curta. "Visível" usa o que já existe:
-- `bloqueada_geral` — desligado, a categoria some da área de membros e
-- o banco já nega o conteúdo dela (abertura_da_aula, pode_ver_produto).
-- =====================================================================

alter table categorias add column if not exists capa_path text;
alter table categorias add column if not exists descricao text;
