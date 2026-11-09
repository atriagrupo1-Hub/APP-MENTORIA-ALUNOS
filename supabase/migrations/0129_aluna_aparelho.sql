-- Celular da aluna (android | iphone): escolhe o vídeo de instalação que vai junto com o acesso.
-- Fica na mesma linha do link próprio (aluna_link); agora o link pode ficar vazio.
alter table public.aluna_link alter column link drop not null;
alter table public.aluna_link drop constraint if exists aluna_link_link_check;
alter table public.aluna_link add constraint aluna_link_link_check check (link is null or length(link) between 1 and 500);
alter table public.aluna_link add column if not exists aparelho text check (aparelho in ('android', 'iphone'));
