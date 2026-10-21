-- =====================================================================
-- 0059 — Descobertas: novo presente, com cartão no Início
--
-- Cor "turquesa" e ícone "lupa" passam a valer nos destaques do Início.
-- O curso "Descobertas" entra na categoria Presentes, trancado como os
-- outros até a equipe liberar.
-- =====================================================================

alter table destaques_inicio drop constraint if exists destaques_inicio_cor_check;
alter table destaques_inicio add constraint destaques_inicio_cor_check
  check (cor = any (array['dourado','violeta','verde','azul','vermelho','turquesa']));
alter table destaques_inicio drop constraint if exists destaques_inicio_icone_check;
alter table destaques_inicio add constraint destaques_inicio_icone_check
  check (icone = any (array['estrela','presente','filme','video','livro','som','lupa']));

insert into produtos (categoria_id, titulo, descricao, capa_path, ordem, publicado)
select c.id, 'Descobertas', 'Vídeos para descobrir o que está por trás do que você vive todos os dias.', '/inicio/descobertas.webp', 5, true
from categorias c
where c.titulo = 'Presentes'
  and not exists (select 1 from produtos p where p.categoria_id = c.id and p.titulo = 'Descobertas');

insert into destaques_inicio (imagem_path, rotulo, titulo, descricao, botao, destino, categoria_nome, icone, cor, ordem, visivel)
select '/inicio/descobertas.webp', 'Descobertas', 'Descubra o que está oculto',
       'Vídeos para descobrir o que está por trás do que você vive todos os dias.',
       'Ver as descobertas', 'categoria', 'Descobertas', 'lupa', 'turquesa',
       coalesce((select max(ordem) from destaques_inicio), 0) + 1, true
where not exists (select 1 from destaques_inicio where rotulo = 'Descobertas');
