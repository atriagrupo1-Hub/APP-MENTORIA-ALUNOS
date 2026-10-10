-- O banco do painel aprovado na maquete (`previa/painel-para-desenhar.html`).
--
-- O que muda:
--   1. Comentário nasce "para moderar". Comentário da equipe nasce
--      publicado. Responder publica.
--   2. Aula "liberada para todas" vira um estado da aula, que vale para
--      quem já está e para quem entrar depois, e passa por cima da
--      liberação individual.
--   3. `produtos.inicio`: 0 na Mentoria, 1 nos outros. O número do
--      módulo e o da aula passam a ser a posição na lista — o banco
--      recalcula sozinho, ninguém grava número à mão.
--   4. `profiles.entrada`: a data de entrada, escolhida no cadastro.
--   5. Liberação em três níveis guardada pelo nível mais alto: produto
--      inteiro, módulo inteiro ou aula avulsa. Uma aula avulsa com data
--      marcada é cronograma, e fica mesmo que o módulo inteiro esteja
--      liberado.
--   6. Cronograma por módulo: quantos dias depois da entrada ele abre.
--      Convive com a data fixa por aula, que é mais específica e vence.
--   7. Quem da equipe faz o quê: o código da aluna, toda a equipe vê e
--      troca; o código do dono e do administrador, só o dono. O
--      administrador gerencia o suporte; o dono, todo mundo.
--
-- A categoria continua como estava: não sai enquanto tiver produto.

-- ---------------------------------------------------------------------
-- 1. COMENTÁRIOS
-- ---------------------------------------------------------------------

alter table comentarios alter column status set default 'pendente';

-- A aluna escolhe se o nome dela aparece. É escolha dela sobre ela
-- mesma, não decide acesso a nada. O padrão continua sendo mostrar.
grant insert (nome_visivel) on comentarios to authenticated;

-- Quem é da equipe não espera moderação de si mesmo.
create or replace function comentario_da_equipe_nasce_publicado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pendente' and exists (
    select 1 from profiles
    where id = new.autora_id and papel in ('dono', 'admin', 'suporte')
  ) then
    new.status := 'publicado';
  end if;
  return new;
end;
$$;

drop trigger if exists comentario_da_equipe on comentarios;
create trigger comentario_da_equipe
  before insert on comentarios
  for each row execute function comentario_da_equipe_nasce_publicado();

revoke execute on function comentario_da_equipe_nasce_publicado() from public, anon, authenticated;

-- Moderar é trabalho de toda a equipe, suporte incluído.
create or replace function public.moderar_comentario(p_comentario uuid, p_status status_comentario)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  update comentarios
     set status = p_status, moderado_por = auth.uid(), moderado_em = now()
   where id = p_comentario;
  if not found then raise exception 'comentario_nao_encontrado'; end if;
end;
$$;

/**
 * A resposta da equipe a um comentário.
 *
 * Uma resposta só por comentário: responder de novo edita a que já
 * existe. E responder publica o comentário que estava para moderar —
 * não faz sentido responder em público a algo que ninguém vê.
 */
create or replace function responder_comentario(p_comentario uuid, p_texto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pai comentarios%rowtype;
  v_id uuid;
  v_texto text := btrim(coalesce(p_texto, ''));
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if length(v_texto) not between 1 and 600 then raise exception 'texto_invalido'; end if;

  select * into v_pai from comentarios where id = p_comentario and resposta_a is null;
  if not found then raise exception 'comentario_nao_encontrado'; end if;

  select c.id into v_id
  from comentarios c
  join profiles p on p.id = c.autora_id
  where c.resposta_a = p_comentario
    and p.papel in ('dono', 'admin', 'suporte')
    and c.status <> 'removido'
  order by c.criado_em
  limit 1;

  if v_id is null then
    insert into comentarios (aula_id, autora_id, texto, posicao_segundos, status, resposta_a, nome_visivel)
    values (v_pai.aula_id, auth.uid(), v_texto, v_pai.posicao_segundos, 'publicado', p_comentario, true)
    returning id into v_id;
  else
    update comentarios set texto = v_texto where id = v_id;
  end if;

  if v_pai.status = 'pendente' then
    update comentarios
       set status = 'publicado', moderado_por = auth.uid(), moderado_em = now()
     where id = p_comentario;
  end if;

  return v_id;
end;
$$;

revoke execute on function responder_comentario(uuid, text) from public, anon;
grant execute on function responder_comentario(uuid, text) to authenticated;

-- A aluna corrige o próprio comentário também enquanto ele espera.
create or replace function editar_meu_comentario(p_comentario uuid, p_texto text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if length(trim(coalesce(p_texto, ''))) not between 1 and 600 then return; end if;
  update comentarios
     set texto = p_texto
   where id = p_comentario
     and autora_id = auth.uid()
     and status in ('pendente', 'publicado');
end;
$$;

-- ---------------------------------------------------------------------
-- 2. AULA LIBERADA PARA TODAS
-- ---------------------------------------------------------------------

alter table aulas add column if not exists liberada_geral boolean not null default false;

alter table aulas drop constraint if exists liberada_ou_bloqueada;
alter table aulas add constraint liberada_ou_bloqueada
  check (not (liberada_geral and bloqueado_geral));

comment on column aulas.liberada_geral is
  'Liberada para todas as alunas ativas, as de hoje e as que entrarem depois. Passa por cima da liberação individual e do cronograma. Não passa por cima de bloqueio de módulo, de produto oculto nem de conta vencida.';

-- ---------------------------------------------------------------------
-- 3. NUMERAÇÃO PELA POSIÇÃO
-- ---------------------------------------------------------------------

alter table produtos add column if not exists inicio smallint not null default 1;
alter table produtos drop constraint if exists inicio_valido;
alter table produtos add constraint inicio_valido check (inicio in (0, 1));

comment on column produtos.inicio is
  'Número do primeiro módulo: 0 na Mentoria, 1 nos outros.';

update produtos set inicio = 0
 where id = (select produto_jornada from configuracoes limit 1);

alter table modulos alter column numero set default 0;
alter table aulas   alter column numero set default 0;

create or replace function renumerar_modulos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update modulos m
     set numero = x.n
    from (
      select mm.id,
             (p.inicio
              + row_number() over (partition by mm.produto_id
                                   order by mm.ordem, mm.numero, mm.criado_em, mm.id)
              - 1)::smallint as n
      from modulos mm
      join produtos p on p.id = mm.produto_id
    ) x
   where m.id = x.id and m.numero is distinct from x.n;
  return null;
end;
$$;

create or replace function renumerar_aulas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update aulas a
     set numero = x.n
    from (
      select id,
             row_number() over (partition by modulo_id
                                order by ordem, numero, criada_em, id)::smallint as n
      from aulas
    ) x
   where a.id = x.id and a.numero is distinct from x.n;
  return null;
end;
$$;

revoke execute on function renumerar_modulos() from public, anon, authenticated;
revoke execute on function renumerar_aulas()   from public, anon, authenticated;

drop trigger if exists modulos_numerados on modulos;
create trigger modulos_numerados
  after insert or delete or update of ordem, produto_id on modulos
  for each statement execute function renumerar_modulos();

drop trigger if exists produtos_numerados on produtos;
create trigger produtos_numerados
  after update of inicio on produtos
  for each statement execute function renumerar_modulos();

drop trigger if exists aulas_numeradas on aulas;
create trigger aulas_numeradas
  after insert or delete or update of ordem, modulo_id on aulas
  for each statement execute function renumerar_aulas();

-- Acerta o que já existe.
update modulos set ordem = ordem;
update aulas   set ordem = ordem;

-- ---------------------------------------------------------------------
-- 4. DATA DE ENTRADA
-- ---------------------------------------------------------------------

alter table profiles add column if not exists entrada date;
update profiles set entrada = (criada_em at time zone 'America/Sao_Paulo')::date
 where entrada is null;
alter table profiles alter column entrada set default ((now() at time zone 'America/Sao_Paulo')::date);
alter table profiles alter column entrada set not null;

comment on column profiles.entrada is
  'Dia em que a aluna entrou, escolhido no cadastro. O cronograma por módulo conta a partir daqui.';

grant select (entrada) on profiles to authenticated;

-- ---------------------------------------------------------------------
-- 5. LIBERAÇÃO EM TRÊS NÍVEIS
-- ---------------------------------------------------------------------

-- A regra de coerência da 0001 é anterior ao escopo `produto` (0027) e
-- recusava a linha. Agora cada escopo tem exatamente o seu alvo.
alter table acessos drop constraint if exists alvo_coerente;
alter table acessos add constraint alvo_coerente check (
  (escopo = 'curso'     and num_nonnulls(modulo_id, aula_id, categoria_id, presente_id, produto_id) = 0) or
  (escopo = 'acervo'    and num_nonnulls(modulo_id, aula_id, categoria_id, presente_id, produto_id) = 0) or
  (escopo = 'modulo'    and modulo_id    is not null and num_nonnulls(modulo_id, aula_id, categoria_id, presente_id, produto_id) = 1) or
  (escopo = 'aula'      and aula_id      is not null and num_nonnulls(modulo_id, aula_id, categoria_id, presente_id, produto_id) = 1) or
  (escopo = 'categoria' and categoria_id is not null and num_nonnulls(modulo_id, aula_id, categoria_id, presente_id, produto_id) = 1) or
  (escopo = 'presente'  and presente_id  is not null and num_nonnulls(modulo_id, aula_id, categoria_id, presente_id, produto_id) = 1) or
  (escopo = 'produto'   and produto_id   is not null and num_nonnulls(modulo_id, aula_id, categoria_id, presente_id, produto_id) = 1)
);

-- Uma linha por alvo. Duplicadas de antes ficam com a mais antiga.
delete from acessos a using acessos b
 where a.escopo = 'modulo' and b.escopo = 'modulo'
   and a.aluna_id = b.aluna_id and a.modulo_id = b.modulo_id
   and (a.concedido_em, a.id) > (b.concedido_em, b.id);
delete from acessos a using acessos b
 where a.escopo = 'produto' and b.escopo = 'produto'
   and a.aluna_id = b.aluna_id and a.produto_id = b.produto_id
   and (a.concedido_em, a.id) > (b.concedido_em, b.id);

create unique index if not exists acessos_produto_unico
  on acessos (aluna_id, produto_id) where escopo = 'produto';

-- ---------------------------------------------------------------------
-- 6. CRONOGRAMA POR MÓDULO
-- ---------------------------------------------------------------------

create table if not exists cronograma_modulo (
  aluna_id  uuid not null references profiles(id) on delete cascade,
  modulo_id uuid not null references modulos(id)  on delete cascade,
  dias      integer not null check (dias between 0 and 3650),
  primary key (aluna_id, modulo_id)
);

create index if not exists cronograma_modulo_por_modulo on cronograma_modulo (modulo_id);

comment on table cronograma_modulo is
  'Quantos dias depois da entrada cada módulo abre para cada aluna. Sem linha, o módulo segue a liberação normal.';

alter table cronograma_modulo enable row level security;
revoke all on cronograma_modulo from anon;
revoke insert, update, delete on cronograma_modulo from authenticated;
grant select on cronograma_modulo to authenticated;

drop policy if exists cronograma_modulo_leitura on cronograma_modulo;
create policy cronograma_modulo_leitura on cronograma_modulo
  for select using (aluna_id = auth.uid() or eh_equipe());

-- ---------------------------------------------------------------------
-- 7. A REGRA ÚNICA DE QUANDO UMA AULA ABRE
-- ---------------------------------------------------------------------

/**
 * Se a aula é da aluna, e quando abre. Nulo em `abre_em` = já aberta.
 * Sem linha = não é dela.
 *
 * Ordem de quem vence:
 *   1. Liberada para todas — aberta agora.
 *   2. Aula avulsa com data marcada — abre na data.
 *   3. Aula avulsa sem data, módulo inteiro ou produto inteiro — abre
 *      na data do cronograma do módulo, se houver; senão, na data da
 *      liberação (quase sempre agora).
 *
 * Bloqueio de aula, de módulo, de categoria e produto oculto fecham
 * tudo, inclusive a liberada para todas. Conta ativa é conferida por
 * quem chama.
 */
create or replace function abertura_da_aula(p_aluna uuid, p_aula uuid)
returns table (abre_em timestamptz)
language sql stable security definer set search_path = public as $$
  with x as (
    select a.liberada_geral,
           exists (
             select 1 from acessos ac
             where ac.aluna_id = p_aluna and ac.escopo = 'aula' and ac.aula_id = a.id
           ) as tem_aula,
           (select ac.abre_em from acessos ac
             where ac.aluna_id = p_aluna and ac.escopo = 'aula' and ac.aula_id = a.id
             limit 1) as aula_abre,
           (select min(coalesce(ac.abre_em, '-infinity'::timestamptz))
              from acessos ac
             where ac.aluna_id = p_aluna
               and (   (ac.escopo = 'modulo'    and ac.modulo_id    = m.id)
                    or (ac.escopo = 'produto'   and ac.produto_id   = m.produto_id)
                    or (ac.escopo = 'categoria' and ac.categoria_id = pr.categoria_id)
                    or (ac.escopo = 'acervo'    and m.produto_id is not null))
           ) as acima_abre,
           (select (pf.entrada::timestamp at time zone 'America/Sao_Paulo')
                   + make_interval(days => cm.dias)
              from cronograma_modulo cm
              join profiles pf on pf.id = cm.aluna_id
             where cm.aluna_id = p_aluna and cm.modulo_id = m.id) as cronograma
    from aulas a
    join modulos m on m.id = a.modulo_id
    left join produtos   pr on pr.id = m.produto_id
    left join categorias ca on ca.id = pr.categoria_id
    where a.id = p_aula
      and a.publicado and m.publicado
      and not a.bloqueado_geral and not m.bloqueado_geral
      and (pr.id is null or (pr.publicado and not pr.bloqueado_geral))
      and (ca.id is null or not ca.bloqueada_geral)
  )
  select case
           when liberada_geral then null
           when tem_aula and aula_abre is not null then aula_abre
           else nullif(
                  greatest(case when tem_aula then '-infinity'::timestamptz else acima_abre end,
                           coalesce(cronograma, '-infinity'::timestamptz)),
                  '-infinity'::timestamptz)
         end
  from x
  where liberada_geral or tem_aula or acima_abre is not null;
$$;

/** Todas as aulas de uma aluna, com a data de cada uma. */
create or replace function aberturas_da_aluna(p_aluna uuid)
returns table (aula_id uuid, modulo_id uuid, abre_em timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.modulo_id, ab.abre_em
  from aulas a
  cross join lateral abertura_da_aula(p_aluna, a.id) ab;
$$;

-- Só para uso interno das funções abaixo: com elas, qualquer um
-- perguntaria pelo cronograma de qualquer aluna.
revoke execute on function abertura_da_aula(uuid, uuid) from public, anon, authenticated;
revoke execute on function aberturas_da_aluna(uuid)     from public, anon, authenticated;

create or replace function pode_ver_aula(p_aula uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select conta_ativa() and exists (
    select 1 from abertura_da_aula(auth.uid(), p_aula) ab
    where ab.abre_em is null or ab.abre_em <= now()
  );
$$;

create or replace function minhas_aulas()
returns table (
  aula_id uuid, modulo_id uuid, modulo_numero smallint, aula_numero smallint,
  titulo text, duracao_segundos integer, capa_path text,
  posicao_segundos integer, concluida boolean, atualizada_em timestamptz
) language sql stable security definer set search_path = public as $$
  select a.id, m.id, m.numero, a.numero, a.titulo, a.duracao_segundos, a.capa_path,
         coalesce(p.posicao_segundos, 0),
         p.concluida_em is not null,
         p.atualizada_em
  from aberturas_da_aluna(auth.uid()) ab
  join aulas a   on a.id = ab.aula_id
  join modulos m on m.id = a.modulo_id
  left join progresso p on p.aula_id = a.id and p.aluna_id = auth.uid()
  where conta_ativa()
    and (ab.abre_em is null or ab.abre_em <= now())
  order by m.ordem, a.ordem, a.numero;
$$;

create or replace function meus_modulos()
returns table (
  modulo_id uuid, modulo_numero smallint,
  atribuidas integer, abertas integer, proxima_abertura timestamptz
) language sql stable security definer set search_path = public as $$
  select m.id, m.numero,
         count(*)::integer,
         count(*) filter (where ab.abre_em is null or ab.abre_em <= now())::integer,
         min(ab.abre_em) filter (where ab.abre_em > now())
  from aberturas_da_aluna(auth.uid()) ab
  join modulos m on m.id = ab.modulo_id
  where conta_ativa()
  group by m.id, m.numero, m.ordem
  order by m.ordem;
$$;

create or replace function minhas_aberturas()
returns table (aula_id uuid, abre_em timestamptz)
language sql stable security definer set search_path = public as $$
  select ab.aula_id, ab.abre_em
  from aberturas_da_aluna(auth.uid()) ab
  where conta_ativa()
    and ab.abre_em is not null
    and ab.abre_em > now();
$$;

create or replace function pode_ver_modulo(p_modulo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from modulos m
    where m.id = p_modulo
      and m.publicado and not m.bloqueado_geral
      and conta_ativa()
      and (
        exists (
          select 1 from aulas a
          cross join lateral abertura_da_aula(auth.uid(), a.id) ab
          where a.modulo_id = m.id
            and (ab.abre_em is null or ab.abre_em <= now())
        )
        or exists (
          select 1 from acessos ac
          where ac.aluna_id = auth.uid() and ac.escopo = 'modulo' and ac.modulo_id = m.id
            and (ac.abre_em is null or ac.abre_em <= now())
        )
        or (m.produto_id is not null and pode_ver_produto(m.produto_id))
      )
  );
$$;

create or replace function pode_ver_ao_vivo(p_ao_vivo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from aulas_ao_vivo v
    join modulos m on m.id = v.modulo_id
    where v.id = p_ao_vivo
      and v.liberada
      and m.publicado and not m.bloqueado_geral
      and conta_ativa()
      and exists (
        select 1 from aulas a
        cross join lateral abertura_da_aula(auth.uid(), a.id) ab
        where a.modulo_id = m.id
          and (ab.abre_em is null or ab.abre_em <= now())
      )
  );
$$;

create or replace function cronograma_da_aluna(p_aluna uuid)
returns table (
  aula_id uuid, modulo_id uuid, modulo_numero smallint, modulo_titulo text,
  aula_numero smallint, aula_titulo text, atribuida boolean,
  abre_em timestamptz, aberta boolean
)
language sql stable security definer set search_path = public as $$
  select a.id, m.id, m.numero, m.titulo, a.numero, a.titulo,
         ab.aula_id is not null,
         ab.abre_em,
         ab.aula_id is not null and (ab.abre_em is null or ab.abre_em <= now())
  from aulas a
  join modulos m on m.id = a.modulo_id
  left join aberturas_da_aluna(p_aluna) ab on ab.aula_id = a.id
  where eh_equipe()
  order by m.ordem, a.ordem, a.numero;
$$;

create or replace function ficha_da_aluna(p_aluna uuid)
returns table (
  aulas_atribuidas integer, aulas_abertas integer, aulas_concluidas integer,
  comentarios integer, curtidas integer,
  ultima_atividade_em timestamptz, ultima_modulo smallint,
  ultima_aula smallint, ultima_titulo text
)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::integer from aberturas_da_aluna(p_aluna)),
    (select count(*)::integer from aberturas_da_aluna(p_aluna) ab
      where ab.abre_em is null or ab.abre_em <= now()),
    (select count(*)::integer from progresso pr
      where pr.aluna_id = p_aluna and pr.concluida_em is not null),
    (select count(*)::integer from comentarios c
      where c.autora_id = p_aluna and c.status <> 'removido'),
    (select count(*)::integer from curtidas cu where cu.aluna_id = p_aluna),
    u.atualizada_em, u.modulo, u.aula, u.titulo
  from (select 1) sempre
  left join lateral (
    select pr.atualizada_em, m.numero as modulo, a.numero as aula, a.titulo
    from progresso pr
    join aulas a   on a.id = pr.aula_id
    join modulos m on m.id = a.modulo_id
    where pr.aluna_id = p_aluna
    order by pr.atualizada_em desc
    limit 1
  ) u on true
  where eh_equipe();
$$;

-- ---------------------------------------------------------------------
-- 8. O QUE O PAINEL CHAMA — ALUNAS
-- ---------------------------------------------------------------------

/** A lista da aba Alunas, com o código: toda a equipe vê. */
create or replace function alunas_do_painel()
returns table (
  id uuid, nome text, login text, codigo text,
  entrada date, validade date, status status_conta,
  aulas_liberadas integer, celular text
)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.login, c.codigo,
         p.entrada,
         (p.acesso_ate at time zone 'America/Sao_Paulo')::date,
         p.status,
         (select count(*)::integer from aberturas_da_aluna(p.id)),
         p.celular
  from profiles p
  left join credenciais c on c.aluna_id = p.id
  where eh_equipe() and p.papel = 'aluna'
  order by p.nome;
$$;

/**
 * Salva a ficha: nome, login, código, entrada e validade.
 *
 * A validade é o último dia de acesso: ela entra até as 23h59 desse dia,
 * no horário de Brasília. Código novo zera a trava de tentativas.
 */
create or replace function salvar_ficha_aluna(
  p_aluna uuid, p_nome text, p_login text, p_codigo text,
  p_entrada date, p_validade date
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_login text := lower(btrim(coalesce(p_login, '')));
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;
  if length(v_nome) not between 2 and 80 then raise exception 'nome_invalido'; end if;
  if v_login !~ '^[a-z0-9._-]{2,40}$' then raise exception 'login_invalido'; end if;
  if coalesce(p_codigo, '') !~ '^[0-9]{4}$' then raise exception 'codigo_invalido'; end if;
  if p_entrada is null or p_validade is null then raise exception 'data_vazia'; end if;
  if p_validade < p_entrada then raise exception 'validade_antes_da_entrada'; end if;
  if exists (select 1 from profiles where login = v_login and id <> p_aluna) then
    raise exception 'login_em_uso';
  end if;

  update profiles
     set nome = v_nome, login = v_login, entrada = p_entrada,
         acesso_ate = ((p_validade + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '1 second'
   where id = p_aluna;

  update credenciais
     set codigo = p_codigo,
         codigo_definido_em = now(),
         tentativas_erradas = 0,
         travada_ate = null
   where aluna_id = p_aluna and codigo <> p_codigo;
end;
$$;

revoke execute on function alunas_do_painel() from public, anon;
grant execute on function alunas_do_painel() to authenticated;
revoke execute on function salvar_ficha_aluna(uuid, text, text, text, date, date) from public, anon;
grant execute on function salvar_ficha_aluna(uuid, text, text, text, date, date) to authenticated;

-- Renovar: mais um ano a partir da validade ou de hoje, o que for mais
-- tarde. Toda a equipe pode.
create or replace function renovar_acesso(
  p_aluna uuid,
  p_dias integer default 0,
  p_meses integer default 0,
  p_anos integer default 0
) returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_nova timestamptz;
begin
  if not eh_equipe() then
    raise exception 'sem_permissao';
  end if;
  if p_dias < 0 or p_meses < 0 or p_anos < 0 then
    raise exception 'prazo_negativo';
  end if;
  if p_dias = 0 and p_meses = 0 and p_anos = 0 then
    raise exception 'prazo_vazio';
  end if;
  update profiles
     set acesso_ate = greatest(coalesce(acesso_ate, now()), now())
                    + make_interval(years => p_anos, months => p_meses, days => p_dias),
         renovada_em = now(),
         renovacoes = renovacoes + 1
   where id = p_aluna and papel = 'aluna'
   returning acesso_ate into v_nova;
  if not found then
    raise exception 'aluna_inexistente';
  end if;
  return v_nova;
end;
$$;

/**
 * A janela "Liberar conteúdo", salva de uma vez.
 *
 * Guarda só o nível mais alto: módulo de produto marcado inteiro não
 * vira linha, aula de módulo marcado inteiro também não. Aula avulsa
 * com data marcada continua — é cronograma, não liberação — a menos
 * que nada acima dela continue marcado.
 */
create or replace function salvar_liberacao(
  p_aluna uuid, p_produtos uuid[], p_modulos uuid[], p_aulas uuid[]
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_produtos uuid[] := coalesce(p_produtos, '{}');
  v_modulos  uuid[];
  v_aulas    uuid[];
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;

  select coalesce(array_agg(m.id), '{}') into v_modulos
  from modulos m
  where m.id = any(coalesce(p_modulos, '{}'))
    and (m.produto_id is null or not m.produto_id = any(v_produtos));

  select coalesce(array_agg(a.id), '{}') into v_aulas
  from aulas a
  join modulos m on m.id = a.modulo_id
  where a.id = any(coalesce(p_aulas, '{}'))
    and not m.id = any(v_modulos)
    and (m.produto_id is null or not m.produto_id = any(v_produtos));

  delete from acessos
   where aluna_id = p_aluna and escopo = 'produto' and not produto_id = any(v_produtos);
  insert into acessos (aluna_id, escopo, produto_id, concedido_por)
  select p_aluna, 'produto', p.id, auth.uid()
  from produtos p where p.id = any(v_produtos)
  on conflict (aluna_id, produto_id) where escopo = 'produto' do nothing;

  delete from acessos
   where aluna_id = p_aluna and escopo = 'modulo' and not modulo_id = any(v_modulos);
  insert into acessos (aluna_id, escopo, modulo_id, concedido_por)
  select p_aluna, 'modulo', m.id, auth.uid()
  from modulos m where m.id = any(v_modulos)
  on conflict (aluna_id, modulo_id) where escopo = 'modulo' do nothing;

  -- Aula avulsa: fica a marcada, e a de data marcada que ainda tem algo
  -- acima dela liberado.
  delete from acessos ac
   where ac.aluna_id = p_aluna and ac.escopo = 'aula'
     and not ac.aula_id = any(v_aulas)
     and not (
       ac.abre_em is not null
       and exists (
         select 1 from aulas a join modulos m on m.id = a.modulo_id
         where a.id = ac.aula_id
           and (m.id = any(v_modulos) or m.produto_id = any(v_produtos))
       )
     );
  insert into acessos (aluna_id, escopo, aula_id, concedido_por)
  select p_aluna, 'aula', a.id, auth.uid()
  from aulas a where a.id = any(v_aulas)
  on conflict (aluna_id, aula_id) where escopo = 'aula' do nothing;

  return (select count(*)::integer from aberturas_da_aluna(p_aluna));
end;
$$;

revoke execute on function salvar_liberacao(uuid, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function salvar_liberacao(uuid, uuid[], uuid[], uuid[]) to authenticated;

/**
 * A janela "Cronograma", salva de uma vez.
 *
 * `p_modulos`/`p_dias`: dias depois da entrada, por módulo. Módulo fora
 * da lista volta à liberação normal.
 *
 * `p_aulas`/`p_datas`: data fixa por aula (nulo tira a data). Marcar
 * data numa aula que ela não tinha também libera a aula — abrindo na
 * data.
 */
create or replace function salvar_cronograma(
  p_aluna uuid,
  p_modulos uuid[], p_dias integer[],
  p_aulas uuid[], p_datas date[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  i integer;
  v_coberta boolean;
begin
  if not eh_equipe() then raise exception 'sem_permissao'; end if;
  if not eh_aluna(p_aluna) then raise exception 'alvo_nao_e_aluna'; end if;
  if coalesce(array_length(p_modulos, 1), 0) <> coalesce(array_length(p_dias, 1), 0)
     or coalesce(array_length(p_aulas, 1), 0) <> coalesce(array_length(p_datas, 1), 0) then
    raise exception 'listas_desencontradas';
  end if;
  if exists (select 1 from unnest(coalesce(p_dias, '{}')) d where d is null or d < 0 or d > 3650) then
    raise exception 'dias_invalidos';
  end if;

  delete from cronograma_modulo where aluna_id = p_aluna;
  insert into cronograma_modulo (aluna_id, modulo_id, dias)
  select p_aluna, x.m, x.d
  from unnest(coalesce(p_modulos, '{}'), coalesce(p_dias, '{}')) as x(m, d)
  join modulos mo on mo.id = x.m;

  for i in 1 .. coalesce(array_length(p_aulas, 1), 0) loop
    if p_datas[i] is not null then
      insert into acessos (aluna_id, escopo, aula_id, abre_em, concedido_por)
      values (p_aluna, 'aula', p_aulas[i],
              p_datas[i]::timestamp at time zone 'America/Sao_Paulo', auth.uid())
      on conflict (aluna_id, aula_id) where escopo = 'aula'
      do update set abre_em = excluded.abre_em;
    else
      -- Sem data: se algo acima libera, a linha avulsa sobra e sai; se
      -- não, ela é a liberação, e só perde a data.
      select exists (
        select 1 from aulas a
        join modulos m on m.id = a.modulo_id
        left join produtos pr on pr.id = m.produto_id
        join acessos ac on ac.aluna_id = p_aluna
         and (   (ac.escopo = 'modulo'    and ac.modulo_id    = m.id)
              or (ac.escopo = 'produto'   and ac.produto_id   = m.produto_id)
              or (ac.escopo = 'categoria' and ac.categoria_id = pr.categoria_id)
              or (ac.escopo = 'acervo'    and m.produto_id is not null))
        where a.id = p_aulas[i]
      ) into v_coberta;
      if v_coberta then
        delete from acessos
         where aluna_id = p_aluna and escopo = 'aula' and aula_id = p_aulas[i];
      else
        update acessos set abre_em = null
         where aluna_id = p_aluna and escopo = 'aula' and aula_id = p_aulas[i];
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function salvar_cronograma(uuid, uuid[], integer[], uuid[], date[]) from public, anon;
grant execute on function salvar_cronograma(uuid, uuid[], integer[], uuid[], date[]) to authenticated;

-- O cronograma antigo, "uma aula a cada N dias", passa a valer para toda
-- a equipe, como o resto da aba Alunas.
create or replace function public.gerar_cronograma_de_aulas(
  p_aluna uuid,
  p_aulas uuid[],
  p_intervalo integer default 5,
  p_inicio timestamp with time zone default now()
)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_total integer;
begin
  if not eh_equipe() then
    raise exception 'sem_permissao';
  end if;
  if p_intervalo < 0 or p_intervalo > 365 then
    raise exception 'intervalo_invalido';
  end if;
  if not eh_aluna(p_aluna) then
    raise exception 'aluna_inexistente';
  end if;
  delete from acessos where aluna_id = p_aluna and escopo = 'aula';
  insert into acessos (aluna_id, escopo, aula_id, abre_em, concedido_por)
  select p_aluna, 'aula', ordenadas.id,
         case when p_intervalo = 0 then null
              else p_inicio + make_interval(days => (ordenadas.posicao * p_intervalo)::int)
         end,
         auth.uid()
  from (
    select a.id,
           (row_number() over (order by m.ordem, a.ordem, a.numero) - 1) as posicao
    from aulas a
    join modulos m on m.id = a.modulo_id
    where a.id = any(p_aulas) and a.publicado
  ) as ordenadas;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. O QUE O PAINEL CHAMA — CONTEÚDO
-- ---------------------------------------------------------------------

/** Liga e desliga a "liberada para todas". Liberar tira o bloqueio. */
create or replace function definir_liberada_geral(p_aula uuid, p_liberada boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  update aulas
     set liberada_geral = p_liberada,
         bloqueado_geral = case when p_liberada then false else bloqueado_geral end
   where id = p_aula;
  if not found then raise exception 'aula_inexistente'; end if;
end;
$$;

/** Bloqueia ou desbloqueia a aula. Bloquear tira a liberação geral. */
create or replace function definir_bloqueio_aula(p_aula uuid, p_bloqueada boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  update aulas
     set bloqueado_geral = p_bloqueada,
         liberada_geral = case when p_bloqueada then false else liberada_geral end
   where id = p_aula;
  if not found then raise exception 'aula_inexistente'; end if;
end;
$$;

/**
 * Remove o produto com tudo o que tem dentro. O `on delete restrict`
 * de `modulos.produto_id` continua lá para que ninguém apague um
 * produto sem querer; aqui é querer, depois de escrever REMOVER.
 */
create or replace function remover_produto(p_produto uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not eh_admin() then raise exception 'sem_permissao'; end if;
  delete from modulos where produto_id = p_produto;
  delete from produtos where id = p_produto;
  if not found then raise exception 'produto_inexistente'; end if;
  update configuracoes set produto_jornada = null where produto_jornada = p_produto;
end;
$$;

revoke execute on function definir_liberada_geral(uuid, boolean) from public, anon;
grant execute on function definir_liberada_geral(uuid, boolean) to authenticated;
revoke execute on function definir_bloqueio_aula(uuid, boolean) from public, anon;
grant execute on function definir_bloqueio_aula(uuid, boolean) to authenticated;
revoke execute on function remover_produto(uuid) from public, anon;
grant execute on function remover_produto(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. EQUIPE
-- ---------------------------------------------------------------------

/**
 * Quem pode mexer em quem:
 *   - o dono, em todo mundo menos nele mesmo (o próprio código ele troca);
 *   - o administrador, só no suporte (e no próprio código);
 *   - o suporte, em ninguém da equipe.
 */
create or replace function pode_gerir(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when eh_dono() then exists (
      select 1 from profiles where id = p_id and papel in ('admin', 'suporte'))
    when eh_admin() then exists (
      select 1 from profiles where id = p_id and papel = 'suporte')
    else false
  end;
$$;

revoke execute on function pode_gerir(uuid) from public, anon;
grant execute on function pode_gerir(uuid) to authenticated;

create or replace function equipe_do_painel()
returns table (
  id uuid, nome text, login text, papel papel_usuario,
  status status_conta, codigo text,
  criada_em timestamptz, ultimo_acesso_em timestamptz,
  sou_eu boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.login, p.papel, p.status,
         case when eh_dono() or (p.papel = 'suporte' and eh_admin()) then c.codigo end,
         p.criada_em, p.ultimo_acesso_em,
         p.id = auth.uid()
  from profiles p
  left join credenciais c on c.aluna_id = p.id
  where eh_admin()
    and p.papel in ('dono', 'admin', 'suporte')
  order by case p.papel
             when 'dono' then 0 when 'admin' then 1 else 2
           end,
           p.nome;
$$;

create or replace function public.remover_colaborador(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_id = auth.uid() then raise exception 'nao_remove_a_si_mesmo'; end if;
  if not pode_gerir(p_id) then raise exception 'sem_permissao'; end if;
  delete from profiles where id = p_id and papel in ('admin', 'suporte');
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
end;
$$;

create or replace function public.bloquear_colaborador(p_id uuid, p_status status_conta)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_id = auth.uid() then raise exception 'nao_bloqueia_a_si_mesmo'; end if;
  if not pode_gerir(p_id) then raise exception 'sem_permissao'; end if;
  update profiles set status = p_status
   where id = p_id and papel in ('admin', 'suporte');
  if not found then raise exception 'colaborador_nao_encontrado'; end if;
end;
$$;

-- Trocar o código de alguém: o próprio, o de quem se gerencia, e o de
-- qualquer aluna para toda a equipe.
create or replace function mudar_codigo(p_id uuid, p_codigo text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not (
       p_id = auth.uid()
    or pode_gerir(p_id)
    or (eh_equipe() and eh_aluna(p_id))
  ) then
    return false;
  end if;
  if p_codigo !~ '^[0-9]{4,6}$' then
    return false;
  end if;
  update credenciais
     set codigo = p_codigo,
         codigo_definido_em = now(),
         tentativas_erradas = 0,
         travada_ate = null
   where aluna_id = p_id;
  return found;
end;
$$;

/** "Trocar código": o banco sorteia, grava e devolve. O antigo morre na hora. */
create or replace function trocar_codigo(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_codigo text;
begin
  loop
    v_codigo := lpad((1000 + floor(random() * 9000))::int::text, 4, '0');
    exit when not exists (
      select 1 from credenciais where aluna_id = p_id and codigo = v_codigo);
  end loop;
  if not mudar_codigo(p_id, v_codigo) then
    raise exception 'sem_permissao';
  end if;
  return v_codigo;
end;
$$;

revoke execute on function trocar_codigo(uuid) from public, anon;
grant execute on function trocar_codigo(uuid) to authenticated;

-- A credencial de alguém da equipe: o dono lê todas; o administrador,
-- a do suporte. A da aluna, toda a equipe — como antes.
drop policy if exists credenciais_leitura on credenciais;
create policy credenciais_leitura on credenciais
  for select using (
    eh_dono()
    or (eh_equipe() and eh_aluna(aluna_id))
    or (eh_admin() and exists (
          select 1 from profiles p where p.id = aluna_id and p.papel = 'suporte'))
  );
