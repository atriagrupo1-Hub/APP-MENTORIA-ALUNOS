-- Módulo (0116): data em que foi publicado. Gravada pelo banco quando o módulo passa a publicado
-- (sai do rascunho ou de oculto). Os que já estavam publicados começam com a data de criação.
alter table public.modulos add column if not exists publicado_em timestamptz;
update public.modulos set publicado_em = criado_em where publicado_em is null and publicado and not rascunho;

create or replace function public.modulos_marca_publicacao() returns trigger language plpgsql as $$
begin
  if new.publicado and not new.rascunho
     and (tg_op = 'INSERT' or not (old.publicado and not old.rascunho)) then
    new.publicado_em := now();
  end if;
  return new;
end $$;
drop trigger if exists modulos_marca_publicacao on public.modulos;
create trigger modulos_marca_publicacao before insert or update of publicado, rascunho on public.modulos
  for each row execute function public.modulos_marca_publicacao();
