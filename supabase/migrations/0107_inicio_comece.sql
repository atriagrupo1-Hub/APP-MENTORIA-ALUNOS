-- Texto "Comece por aqui" do card "Sua mentoria" (0107): a equipe escolhe; vazio não aparece.
alter table public.configuracoes add column if not exists inicio_comece text not null default 'Comece por aqui';
alter table public.configuracoes drop constraint if exists configuracoes_inicio_comece_tamanho;
alter table public.configuracoes add constraint configuracoes_inicio_comece_tamanho check (char_length(inicio_comece) <= 40);
