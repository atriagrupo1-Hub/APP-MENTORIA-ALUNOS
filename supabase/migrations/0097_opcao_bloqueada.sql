-- Opções do e-book (0097): além de ativa (publicado) e desativada (não publicado),
-- a opção pode ficar bloqueada — a aluna vê o botão com cadeado e o aviso escrito pela equipe.
alter table public.conteudos add column if not exists bloqueado boolean not null default false;
alter table public.conteudos add column if not exists aviso_bloqueio text;

-- Quem decide é o banco: opção bloqueada (e o que vive dentro dela) não chega à aluna.
-- Ela só recebe o botão (nome, tipo, cor e aviso) pela função opcoes_bloqueadas().
create or replace function public.conteudo_trancado(p_conteudo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conteudos k left join conteudos p on p.id = k.pai_id
    where k.id = p_conteudo and (k.bloqueado or coalesce(p.bloqueado, false) or (k.pai_id is not null and not coalesce(p.publicado, false)))
  );
$$;

create or replace function public.pode_ver_conteudo(p_conteudo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select eh_equipe() or exists (
    select 1 from conteudos k
    where k.id = p_conteudo
      and k.publicado
      and not conteudo_trancado(k.id)
      and case
            when k.aula_id     is not null then pode_ver_aula(k.aula_id)
            when k.presente_id is not null then pode_ver_presente(k.presente_id)
            when k.modulo_id   is not null then pode_ver_modulo(k.modulo_id)
            else pode_ver_produto(k.produto_id)
          end
  );
$$;

drop policy if exists catalogo_conteudos_leitura on public.conteudos;
create policy catalogo_conteudos_leitura on public.conteudos for select using (
  eh_equipe() or (publicado and not conteudo_trancado(id) and
    case
      when aula_id is not null then pode_ver_aula(aula_id)
      when presente_id is not null then pode_ver_presente(presente_id)
      when modulo_id is not null then pode_ver_modulo(modulo_id)
      else pode_ver_produto(produto_id)
    end)
);

create or replace function public.opcoes_bloqueadas()
returns table(id uuid, aula_id uuid, presente_id uuid, modulo_id uuid, produto_id uuid, tipo text, titulo text, cor text, ordem int, aviso text)
language sql stable security definer set search_path = public as $$
  select k.id, k.aula_id, k.presente_id, k.modulo_id, k.produto_id, k.tipo::text, k.titulo, k.cor, k.ordem, k.aviso_bloqueio
  from conteudos k
  where k.opcao and k.publicado and k.bloqueado and k.pai_id is null
    and case
          when k.aula_id is not null then pode_ver_aula(k.aula_id)
          when k.presente_id is not null then pode_ver_presente(k.presente_id)
          when k.modulo_id is not null then pode_ver_modulo(k.modulo_id)
          else pode_ver_produto(k.produto_id)
        end;
$$;
revoke all on function public.opcoes_bloqueadas() from public, anon;
grant execute on function public.opcoes_bloqueadas() to authenticated;
