-- Notificações (push) da área de membros.
--
-- O celular da aluna se inscreve (push_inscricoes). A cada minuto o banco
-- confere, só para quem tem inscrição, o que ficou liberado e ainda não foi
-- avisado (avisos_pendentes) e chama a Edge Function enviar-avisos. O que é
-- liberado vem de aberturas_da_aluna: a mesma regra que abre a aula no app.
-- O segredo e a chave pública do projeto ficam no vault, fora do repositório.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  aluna_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criada_em timestamptz not null default now()
);
create index if not exists push_inscricoes_aluna on public.push_inscricoes (aluna_id);
alter table public.push_inscricoes enable row level security;
drop policy if exists push_equipe_le on public.push_inscricoes;
create policy push_equipe_le on public.push_inscricoes for select to authenticated using (eh_equipe());
grant select on public.push_inscricoes to authenticated;

create table if not exists public.avisos_enviados (
  aluna_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('aula', 'presente')),
  ref_id uuid not null,
  enviado_em timestamptz not null default now(),
  primary key (aluna_id, tipo, ref_id)
);
alter table public.avisos_enviados enable row level security;

alter table public.profiles add column if not exists notif_adiado_em timestamptz;

-- Pop-up "Ativar notificações" e botão do Perfil: textos, cores, layout e intervalo.
alter table public.configuracoes add column if not exists notif jsonb not null default '{}'::jsonb;
alter table public.configuracoes drop constraint if exists notif_valida;
alter table public.configuracoes add constraint notif_valida check (jsonb_typeof(notif) = 'object');

-- O que está liberado agora para a aluna (aulas e presentes).
create or replace function public.liberados_da_aluna(p_aluna uuid)
returns table (tipo text, ref_id uuid)
language sql stable security definer set search_path = public as $$
  select 'aula', ab.aula_id from aberturas_da_aluna(p_aluna) ab
   where ab.abre_em is null or ab.abre_em <= now()
  union all
  select 'presente', p.id
    from presentes p join categorias c on c.id = p.categoria_id
   where p.publicado and not p.bloqueado_geral and not c.bloqueada_geral and c.publicado
     and exists (select 1 from acessos ac where ac.aluna_id = p_aluna
       and (ac.escopo = 'acervo' or (ac.escopo = 'categoria' and ac.categoria_id = p.categoria_id)
            or (ac.escopo = 'presente' and ac.presente_id = p.id)));
$$;
revoke all on function public.liberados_da_aluna(uuid) from public, anon, authenticated;

-- A aluna inscreve este celular. O que já está liberado conta como avisado.
create or replace function public.salvar_inscricao_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not conta_ativa() then raise exception 'sem acesso'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'inscricao invalida'; end if;
  insert into push_inscricoes (aluna_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set aluna_id = excluded.aluna_id, p256dh = excluded.p256dh, auth = excluded.auth;
  insert into avisos_enviados (aluna_id, tipo, ref_id)
  select auth.uid(), l.tipo, l.ref_id from liberados_da_aluna(auth.uid()) l
  on conflict do nothing;
end $$;

create or replace function public.remover_inscricao_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_inscricoes where endpoint = p_endpoint and aluna_id = auth.uid();
$$;

-- "Agora não": o pop-up volta só depois do intervalo escolhido no painel.
create or replace function public.adiar_aviso_notificacao()
returns void language sql security definer set search_path = public as $$
  update profiles set notif_adiado_em = now() where id = auth.uid();
$$;
create or replace function public.meu_aviso_notificacao()
returns timestamptz language sql stable security definer set search_path = public as $$
  select notif_adiado_em from profiles where id = auth.uid();
$$;

-- Para a Edge Function (chave de serviço): o que falta avisar, por aluna.
create or replace function public.avisos_pendentes()
returns table (aluna_id uuid, tipo text, ref_id uuid, titulo text, modulo_id uuid, modulo_titulo text)
language sql stable security definer set search_path = public as $$
  select al.id, l.tipo, l.ref_id,
         coalesce(a.titulo, pr.titulo), m.id, m.titulo
    from (select distinct pi.aluna_id as id from push_inscricoes pi
            join profiles pf on pf.id = pi.aluna_id
           where pf.status = 'ativa' and (pf.acesso_ate is null or pf.acesso_ate > now())) al
    cross join lateral liberados_da_aluna(al.id) l
    left join aulas a on l.tipo = 'aula' and a.id = l.ref_id
    left join modulos m on m.id = a.modulo_id
    left join presentes pr on l.tipo = 'presente' and pr.id = l.ref_id
   where not exists (select 1 from avisos_enviados e where e.aluna_id = al.id and e.tipo = l.tipo and e.ref_id = l.ref_id);
$$;
revoke all on function public.avisos_pendentes() from public, anon, authenticated;
grant execute on function public.avisos_pendentes() to service_role;

create or replace function public.marcar_avisos(p_itens jsonb)
returns void language sql security definer set search_path = public as $$
  insert into avisos_enviados (aluna_id, tipo, ref_id)
  select (x->>'aluna_id')::uuid, x->>'tipo', (x->>'ref_id')::uuid from jsonb_array_elements(p_itens) x
  on conflict do nothing;
$$;
revoke all on function public.marcar_avisos(jsonb) from public, anon, authenticated;
grant execute on function public.marcar_avisos(jsonb) to service_role;

-- Quem já tem inscrição continua sem receber aviso do que já estava liberado.
insert into public.avisos_enviados (aluna_id, tipo, ref_id)
select pi.aluna_id, l.tipo, l.ref_id from (select distinct aluna_id from public.push_inscricoes) pi
cross join lateral public.liberados_da_aluna(pi.aluna_id) l on conflict do nothing;

-- A cada minuto: só chama a função quando há algo a avisar.
select cron.unschedule('enviar-avisos') where exists (select 1 from cron.job where jobname = 'enviar-avisos');
select cron.schedule('enviar-avisos', '* * * * *', $cron$
  select net.http_post(
    url := 'https://crcclhmamknqkamvavyp.supabase.co/functions/v1/enviar-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_chave_publica'),
      'x-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_segredo')),
    body := '{}'::jsonb)
  where exists (select 1 from public.avisos_pendentes() limit 1);
$cron$);

-- O botão "Ativar notificações" entra na lista de botões do Perfil (aparece só para quem não ativou).
update public.configuracoes set perfil_botoes = perfil_botoes || '[{"id":"notificacoes","rotulo":"Avisos das novas aulas","desc":"Aparece só para quem ainda não ativou","visivel":true}]'::jsonb
 where not perfil_botoes @> '[{"id":"notificacoes"}]'::jsonb;
