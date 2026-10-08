-- Painel Financeiro (0038): só dono e admin alcançam financeiro_dados.
-- Para no primeiro erro: cada bloco levanta exceção quando a regra quebra.
\set ON_ERROR_STOP on
\set QUIET on

\echo '--- financeiro: admin lê e grava ---'
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into financeiro_dados (chave, valor) values ('painel-custos', '[]');
update financeiro_dados set valor = '[{"nome":"x"}]' where chave = 'painel-custos';
do $$ begin
  if (select count(*) from financeiro_dados) <> 1 then raise exception 'admin deveria ver 1 linha'; end if;
  if (select atualizado_por from financeiro_dados where chave = 'painel-custos') <> auth.uid() then raise exception 'carimbo de autor errado'; end if;
  if (select count(*) from financeiro_eu()) <> 1 then raise exception 'financeiro_eu deveria devolver o admin'; end if;
end $$;
reset role;

\echo '--- financeiro: aluna não lê, não grava, não se identifica ---'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from financeiro_dados) <> 0 then raise exception 'aluna leu o financeiro'; end if;
  if (select count(*) from financeiro_eu()) <> 0 then raise exception 'financeiro_eu respondeu para aluna'; end if;
  begin
    insert into financeiro_dados (chave, valor) values ('painel-intrusa', '1');
    raise exception 'aluna gravou no financeiro';
  exception when insufficient_privilege then null;
  end;
  update financeiro_dados set valor = 'x';
  delete from financeiro_dados;
end $$;
reset role;
do $$ begin
  if (select valor from financeiro_dados where chave = 'painel-custos') <> '[{"nome":"x"}]' then raise exception 'aluna alterou o financeiro'; end if;
end $$;

\echo '--- financeiro: anon não alcança nada ---'
set role anon;
do $$ begin
  begin
    perform count(*) from financeiro_dados;
    raise exception 'anon leu o financeiro';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from financeiro_eu();
    raise exception 'anon chamou financeiro_eu';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo '--- financeiro: chave fora do formato é recusada ---'
do $$ begin
  begin
    insert into financeiro_dados (chave, valor) values ('outra-coisa', '1');
    raise exception 'aceitou chave fora do formato';
  exception when check_violation then null;
  end;
end $$;

\echo 'financeiro: OK'
