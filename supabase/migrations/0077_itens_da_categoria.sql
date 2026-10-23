-- O que fica dentro de cada categoria: cursos, módulos ou aulas soltas.
-- Um item pode estar em várias categorias ao mesmo tempo; tirar de uma
-- não tira das outras. Cada curso começa na categoria que já tinha.
create table if not exists public.categoria_itens (
  id uuid primary key default gen_random_uuid(),
  categoria_aba_id uuid not null references public.categorias_aba(id) on delete cascade,
  tipo text not null check (tipo in ('curso', 'modulo', 'aula')),
  item_id uuid not null,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (categoria_aba_id, tipo, item_id)
);
create index if not exists categoria_itens_item_idx on public.categoria_itens(tipo, item_id);
alter table public.categoria_itens enable row level security;
create policy categoria_itens_leitura on public.categoria_itens for select using (conta_ativa() or eh_admin());
create policy categoria_itens_escrita on public.categoria_itens for all using (eh_admin()) with check (eh_admin());
grant select, insert, update, delete on public.categoria_itens to authenticated;

insert into public.categoria_itens (categoria_aba_id, tipo, item_id, ordem)
select p.categoria_aba_id, 'curso', p.id, 0 from public.produtos p
where p.categoria_aba_id is not null
on conflict do nothing;

-- Quando o curso, o módulo ou a aula é apagado, sai das categorias.
create or replace function public.tirar_das_categorias() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  delete from categoria_itens where item_id = old.id and tipo = tg_argv[0];
  return old;
end $$;
drop trigger if exists produtos_sai_das_categorias on public.produtos;
create trigger produtos_sai_das_categorias after delete on public.produtos for each row execute function public.tirar_das_categorias('curso');
drop trigger if exists modulos_sai_das_categorias on public.modulos;
create trigger modulos_sai_das_categorias after delete on public.modulos for each row execute function public.tirar_das_categorias('modulo');
drop trigger if exists aulas_sai_das_categorias on public.aulas;
create trigger aulas_sai_das_categorias after delete on public.aulas for each row execute function public.tirar_das_categorias('aula');
