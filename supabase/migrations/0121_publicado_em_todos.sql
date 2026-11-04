-- Publicação/liberação nova para todos (0121): módulos e aulas já publicados começam com a data de criação como data de publicação.
update public.modulos set publicado_em = criado_em where publicado_em is null and publicado and not rascunho;
update public.aulas set publicado_em = criada_em where publicado_em is null and publicado and not rascunho;
