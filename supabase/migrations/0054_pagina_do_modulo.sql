-- =====================================================================
-- 0054 — Página do módulo
--
-- 1) Cor do módulo: `modulos.cor_destaque` passa a guardar a cor em
--    hexadecimal (#rrggbb), editada no painel. Os módulos da mentoria
--    recebem as cores aprovadas na maquete, na ordem do curso; os demais
--    só trocam o formato antigo "r,g,b" pelo hexadecimal.
-- 2) Aulas em sequência: dentro do módulo, a aula só abre quando a
--    anterior (publicada, na ordem do painel) foi concluída pela aluna.
--    Continua valendo tudo o que já valia (liberações, datas e bloqueios
--    do painel). `pode_ver_aula` é quem entrega vídeo, comentários e
--    progresso, então forçar o endereço não adianta.
-- =====================================================================

with cores(i, cor) as (
  select ord - 1, c from unnest(array['#e6b85a','#ff5a4f','#4ea6ff','#b47cff','#8ec5ff','#b5d66b','#f5a64a','#4f8cff','#ff6fa3','#f0b45c','#e6b85a']) with ordinality as t(c, ord)
), mods as (
  select m.id, (row_number() over (order by m.ordem, m.numero) - 1) % 11 as i
  from modulos m
  where m.produto_id = (select produto_jornada from configuracoes limit 1)
)
update modulos m set cor_destaque = cores.cor
from mods join cores on cores.i = mods.i
where m.id = mods.id;

update modulos
set cor_destaque = '#' || lpad(to_hex(split_part(cor_destaque, ',', 1)::int), 2, '0')
                       || lpad(to_hex(split_part(cor_destaque, ',', 2)::int), 2, '0')
                       || lpad(to_hex(split_part(cor_destaque, ',', 3)::int), 2, '0')
where cor_destaque ~ '^\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*$';

create or replace function aula_anterior_concluida(p_aluna uuid, p_aula uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select exists (
      select 1 from progresso p
      where p.aluna_id = p_aluna and p.aula_id = ant.id and p.concluida_em is not null
    )
    from aulas a
    join aulas ant on ant.modulo_id = a.modulo_id and ant.publicado and ant.id <> a.id
                  and (ant.ordem, ant.numero) < (a.ordem, a.numero)
    where a.id = p_aula
    order by ant.ordem desc, ant.numero desc
    limit 1
  ), true);
$$;

revoke execute on function aula_anterior_concluida(uuid, uuid) from public, anon;
grant execute on function aula_anterior_concluida(uuid, uuid) to authenticated, service_role;

create or replace function pode_ver_aula(p_aula uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select conta_ativa() and exists (
    select 1 from abertura_da_aula(auth.uid(), p_aula) ab
    where ab.abre_em is null or ab.abre_em <= now()
  ) and aula_anterior_concluida(auth.uid(), p_aula);
$$;
