-- Módulo e aula sem número (0096): o número continua guardado (ordem e unicidade),
-- mas a aluna não vê quando a equipe apaga o número no painel.
alter table public.modulos add column if not exists sem_numero boolean not null default false;
alter table public.aulas add column if not exists sem_numero boolean not null default false;
