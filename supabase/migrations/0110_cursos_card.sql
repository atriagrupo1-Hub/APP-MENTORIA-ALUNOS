-- Card do curso (0110): o texto em cima do nome e o texto do botão, iguais para todos os cursos; vazio não aparece.
alter table public.configuracoes add column if not exists cursos_rotulo text not null default 'Curso completo';
alter table public.configuracoes add column if not exists cursos_botao text not null default 'Ver curso';
alter table public.configuracoes drop constraint if exists configuracoes_cursos_textos;
alter table public.configuracoes add constraint configuracoes_cursos_textos check (char_length(cursos_rotulo) <= 40 and char_length(cursos_botao) <= 30);
