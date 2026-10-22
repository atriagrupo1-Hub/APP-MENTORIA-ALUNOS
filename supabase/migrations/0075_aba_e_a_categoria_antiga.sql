-- Hierarquia do app: Aba → Categoria → Módulos → Aulas. A "aba" é a
-- linha de categorias (Mentoria, Presentes…): cada uma, menos a da
-- mentoria (Início e Módulos), vira uma aba no menu da aluna, com o
-- ícone escolhido. Os produtos dentro dela são as categorias da aba.
-- A tabela abas (0074) e categorias.aba_id deixam de existir.
alter table public.categorias add column if not exists icone text not null default 'presentes';
alter table public.categorias drop column if exists aba_id;
drop table if exists public.abas;
