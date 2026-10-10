-- O banco do painel da maquete (migrations 0039 e 0040).
--
-- Diferente dos arquivos anteriores, este não pede leitura: cada prova
-- confere sozinha e para tudo na primeira que falhar. No fim, se chegou
-- lá, escreve TUDO CERTO.

\set QUIET on
\set ON_ERROR_STOP on

\echo ''
\echo '=========================================================='
\echo 'PAINEL DA MAQUETE'
\echo '=========================================================='

reset role;

create or replace function public.confere(p_ok boolean, p_nome text)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FALHOU: %', p_nome;
  end if;
  raise notice 'ok  %', p_nome;
end;
$$;

-- Espera que o bloco falhe. `p_sql` roda com o papel de quem chamou.
create or replace function public.recusa(p_sql text, p_nome text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok  % (recusado: %)', p_nome, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: % — passou sem recusa', p_nome;
end;
$$;

grant execute on function public.confere(boolean, text) to authenticated;
grant execute on function public.recusa(text, text) to authenticated;

-- Equipe completa: dono (1111), administrador (5555), suporte (4444).
-- A semente cria a 1111 depois das migrations, então ela não passou pela
-- troca de `admin` para `dono` da 0022.
update profiles set papel = 'dono' where id = '11111111-1111-1111-1111-111111111111';
insert into auth.users (id) values
  ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555');
insert into profiles (id, nome, login, papel) values
  ('44444444-4444-4444-4444-444444444444', 'Joana Suporte', 'joana', 'suporte'),
  ('55555555-5555-5555-5555-555555555555', 'Paula Admin', 'paula', 'admin');
insert into credenciais (aluna_id, codigo) values
  ('44444444-4444-4444-4444-444444444444', '5577'),
  ('55555555-5555-5555-5555-555555555555', '6688');

-- Ana começa sem nada, entrando hoje e com acesso por um ano.
delete from acessos where aluna_id = '33333333-3333-3333-3333-333333333333';
update profiles
   set entrada = (now() at time zone 'America/Sao_Paulo')::date,
       acesso_ate = now() + interval '1 year', status = 'ativa'
 where id = '33333333-3333-3333-3333-333333333333';

\set dono    '''11111111-1111-1111-1111-111111111111'''
\set maria   '''22222222-2222-2222-2222-222222222222'''
\set ana     '''33333333-3333-3333-3333-333333333333'''
\set suporte '''44444444-4444-4444-4444-444444444444'''
\set admin   '''55555555-5555-5555-5555-555555555555'''

select id as mentoria from produtos
 where id = (select produto_jornada from configuracoes limit 1) \gset
select id as m1 from modulos where produto_id = :'mentoria' and numero = 1 \gset
select id as m2 from modulos where produto_id = :'mentoria' and numero = 2 \gset
select id as m3 from modulos where produto_id = :'mentoria' and numero = 3 \gset
select id as a1_1 from aulas where modulo_id = :'m1' and numero = 1 \gset
select id as a1_2 from aulas where modulo_id = :'m1' and numero = 2 \gset
select id as a2_1 from aulas where modulo_id = :'m2' and numero = 1 \gset
select id as a3_1 from aulas where modulo_id = :'m3' and numero = 1 \gset
select categoria_id as cat_mentoria from produtos where id = :'mentoria' \gset

-- Só os avisos aparecem: o resultado das consultas vai fora.
\o /dev/null

\echo ''
\echo '--- numeração pela posição'

select confere(inicio = 0, 'a Mentoria começa no Módulo 0')
  from produtos where id = :'mentoria';

-- Um módulo novo no meio empurra os de baixo uma casa.
insert into modulos (produto_id, titulo, ordem) values (:'mentoria', 'NOVO NO MEIO', 1);
update modulos set ordem = ordem + 1
 where produto_id = :'mentoria' and ordem >= 1 and titulo <> 'NOVO NO MEIO';
select confere(numero = 1, 'o módulo novo na posição 2 é o Módulo 1')
  from modulos where titulo = 'NOVO NO MEIO';
select confere(numero = 2, 'o antigo Módulo 1 virou Módulo 2, com o mesmo id')
  from modulos where id = :'m1';
delete from modulos where titulo = 'NOVO NO MEIO';
update modulos set ordem = ordem - 1 where produto_id = :'mentoria' and ordem >= 2;
select confere(numero = 1, 'removido o novo, o Módulo 1 volta a ser 1')
  from modulos where id = :'m1';
select confere(
  array_agg(numero order by ordem) = array[0,1,2,3,4,5,6,7,8,9,10]::smallint[],
  'os 11 módulos seguem de 0 a 10')
  from modulos where produto_id = :'mentoria';

-- Aulas: trocar a ordem troca o número, não a identidade.
update aulas set ordem = case when id = :'a1_1' then 1 else 0 end
 where id in (:'a1_1', :'a1_2');
select confere(numero = 2, 'a primeira aula descida virou a 2')
  from aulas where id = :'a1_1';
update aulas set ordem = case when id = :'a1_1' then 0 else 1 end
 where id in (:'a1_1', :'a1_2');
select confere(numero = 1, 'e subida de volta é a 1 de novo')
  from aulas where id = :'a1_1';

-- Outro produto começa no 1.
insert into produtos (categoria_id, titulo) select categoria_id, 'Outro' from produtos where id = :'mentoria';
insert into modulos (produto_id, titulo, ordem)
  select id, 'PRIMEIRO', 0 from produtos where titulo = 'Outro';
select confere(numero = 1, 'em outro produto o primeiro módulo é o 1')
  from modulos where titulo = 'PRIMEIRO';

\echo ''
\echo '--- categoria com produto não sai'

set role authenticated;
set request.jwt.claim.sub = :dono;
select recusa(
  format('delete from categorias where id = %L', :'cat_mentoria'),
  'remover a categoria que tem a Mentoria');

\echo ''
\echo '--- liberação em três níveis'

set request.jwt.claim.sub = :suporte;

select confere(
  salvar_liberacao(:ana, array[:'mentoria']::uuid[], array[:'m1']::uuid[], array[:'a2_1']::uuid[])
    = (select count(*) from aulas a join modulos m on m.id = a.modulo_id where m.produto_id = :'mentoria'),
  'curso inteiro libera todas as aulas da Mentoria');
select confere(
  (select count(*) from acessos where aluna_id = :ana) = 1
  and (select escopo::text from acessos where aluna_id = :ana) = 'produto',
  'e guarda só o nível mais alto: uma linha, do produto');

select salvar_liberacao(:ana, '{}', array[:'m1', :'m2']::uuid[], array[:'a2_1', :'a3_1']::uuid[]);
select confere(
  (select count(*) from acessos where aluna_id = :ana and escopo = 'modulo') = 2
  and (select count(*) from acessos where aluna_id = :ana and escopo = 'aula') = 1
  and (select count(*) from acessos where aluna_id = :ana and escopo = 'produto') = 0,
  'dois módulos e uma aula avulsa: a aula do Módulo 2 não vira linha');

set request.jwt.claim.sub = :ana;
select confere(
  (select count(*) from minhas_aulas())
  = (select count(*) from aulas where modulo_id in (:'m1', :'m2')) + 1,
  'a Ana vê os Módulos 1 e 2 inteiros e a primeira do 3');
select confere(not pode_ver_aula(
  (select id from aulas where modulo_id = :'m3' and numero = 2)),
  'e não vê a segunda do Módulo 3');

\echo ''
\echo '--- cronograma por módulo, em dias depois da entrada'

set request.jwt.claim.sub = :suporte;
select salvar_cronograma(:ana, array[:'m2']::uuid[], array[10], '{}', '{}');

set request.jwt.claim.sub = :ana;
select confere(not pode_ver_aula(:'a2_1'), 'Módulo 2 com 10 dias: fechado no dia da entrada');
select confere(atribuidas > 0 and abertas = 0 and proxima_abertura is not null,
  'mas aparece para ela, com a data de abertura')
  from meus_modulos() where modulo_id = :'m2';
select confere(pode_ver_aula(:'a1_1'), 'o Módulo 1, sem cronograma, segue aberto');

reset role;
update profiles set entrada = entrada - 11 where id = :ana;
set role authenticated;
set request.jwt.claim.sub = :ana;
select confere(pode_ver_aula(:'a2_1'), '11 dias depois da entrada, o Módulo 2 abriu');

\echo ''
\echo '--- data fixa por aula'

set request.jwt.claim.sub = :suporte;
select salvar_cronograma(:ana, '{}', '{}', array[:'a1_2']::uuid[],
                         array[(now() + interval '5 days')::date]);
set request.jwt.claim.sub = :ana;
select confere(not pode_ver_aula(:'a1_2'), 'a aula com data daqui a 5 dias está fechada');
select confere(pode_ver_aula(:'a1_1'), 'a vizinha, no mesmo módulo, segue aberta');
select confere((select count(*) from minhas_aberturas() where aula_id = :'a1_2') = 1,
  'e ela sabe quando abre');

set request.jwt.claim.sub = :suporte;
select salvar_liberacao(:ana, '{}', array[:'m1', :'m2']::uuid[], array[:'a3_1']::uuid[]);
select confere(
  (select abre_em is not null from acessos where aluna_id = :ana and aula_id = :'a1_2'),
  'salvar a liberação de novo não apaga a data marcada');

select salvar_cronograma(:ana, '{}', '{}', array[:'a1_2']::uuid[], array[null]::date[]);
select confere(
  not exists (select 1 from acessos where aluna_id = :ana and aula_id = :'a1_2'),
  'tirar a data de aula coberta pelo módulo apaga a linha avulsa');
set request.jwt.claim.sub = :ana;
select confere(pode_ver_aula(:'a1_2'), 'e a aula abre');

\echo ''
\echo '--- aula liberada para todas'

set request.jwt.claim.sub = :maria;
select confere(not pode_ver_aula(:'a3_1'), 'a Maria não tem o Módulo 3');

set request.jwt.claim.sub = :suporte;
select recusa(format('select definir_liberada_geral(%L, true)', :'a3_1'),
  'o suporte não libera aula para todas');

set request.jwt.claim.sub = :admin;
select definir_liberada_geral(:'a3_1', true);
set request.jwt.claim.sub = :maria;
select confere(pode_ver_aula(:'a3_1'), 'liberada para todas, a Maria vê');
select confere(exists (select 1 from meus_modulos() where modulo_id = :'m3'),
  'e o Módulo 3 aparece para ela');

reset role;
insert into auth.users (id) values ('66666666-6666-6666-6666-666666666666');
insert into profiles (id, nome, login, papel)
  values ('66666666-6666-6666-6666-666666666666', 'Nova', 'nova', 'aluna');
set role authenticated;
set request.jwt.claim.sub = '66666666-6666-6666-6666-666666666666';
select confere(pode_ver_aula(:'a3_1'), 'quem entrou depois também vê');
select confere((select count(*) from minhas_aulas()) = 1, 'e só essa');

set request.jwt.claim.sub = :admin;
select definir_bloqueio_aula(:'a3_1', true);
select confere(not liberada_geral and bloqueado_geral, 'bloquear tira a liberação geral')
  from aulas where id = :'a3_1';
set request.jwt.claim.sub = :ana;
select confere(not pode_ver_aula(:'a3_1'), 'bloqueada, nem a Ana, que tinha a aula avulsa, vê');
set request.jwt.claim.sub = :admin;
select definir_bloqueio_aula(:'a3_1', false);

\echo ''
\echo '--- comentários para moderar'

\set nova '''66666666-6666-6666-6666-666666666666'''
set request.jwt.claim.sub = :suporte;
select salvar_liberacao(:nova, '{}', '{}', array[:'a1_1']::uuid[]);

set request.jwt.claim.sub = :ana;
insert into comentarios (aula_id, autora_id, texto, posicao_segundos, nome_visivel)
  values (:'a1_1', :ana, 'Comentario da Ana para moderar', 10, false);
select confere(
  (select status::text from meus_comentarios(:'a1_1') where texto like 'Comentario da Ana%') = 'pendente',
  'comentário de aluna nasce para moderar');

set request.jwt.claim.sub = :nova;
select confere(pode_ver_aula(:'a1_1'), 'a Nova tem a mesma aula');
select confere(
  not exists (select 1 from comentarios_da_aula(:'a1_1') where texto like 'Comentario da Ana%'),
  'e não vê o comentário enquanto ele espera');

set request.jwt.claim.sub = :suporte;
select id as com_ana from comentarios_para_moderacao(:'a1_1')
 where texto like 'Comentario da Ana%' \gset
select confere((select autora_nome from comentarios_para_moderacao(:'a1_1') where id = :'com_ana') = 'Ana',
  'a equipe vê o nome real da autora');
select responder_comentario(:'com_ana', 'Que bom, Ana.');
select responder_comentario(:'com_ana', 'Que bom ter você aqui, Ana.');
select confere(
  (select count(*) from comentarios_para_moderacao(:'a1_1') where resposta_a = :'com_ana') = 1,
  'responder duas vezes edita, não duplica');
select confere(
  (select status::text from comentarios_para_moderacao(:'a1_1') where id = :'com_ana') = 'publicado',
  'responder publica o comentário');

set request.jwt.claim.sub = :nova;
select confere(
  exists (select 1 from comentarios_da_aula(:'a1_1') where id = :'com_ana' and autora_nome is null),
  'publicado, a Nova vê — e a Ana, que escolheu ficar anônima, aparece sem nome');
select confere(
  exists (select 1 from comentarios_da_aula(:'a1_1') where texto = 'Que bom ter você aqui, Ana.'),
  'e a resposta da equipe aparece');

set request.jwt.claim.sub = :suporte;
select moderar_comentario(:'com_ana', 'oculto');
set request.jwt.claim.sub = :nova;
select confere(
  not exists (select 1 from comentarios_da_aula(:'a1_1') where id = :'com_ana'),
  'o suporte oculta, e some para as alunas');

set request.jwt.claim.sub = :dono;
insert into comentarios (aula_id, autora_id, texto) values (:'a1_1', :dono, 'Recado da equipe');
select confere(
  (select status::text from comentarios_para_moderacao(:'a1_1') where texto = 'Recado da equipe') = 'publicado',
  'comentário da equipe nasce publicado');

set request.jwt.claim.sub = :ana;
select recusa(
  format('insert into comentarios (aula_id, autora_id, texto, status) values (%L, %L, %L, %L)',
         :'a1_1', :ana, 'tentando pular a fila', 'publicado'),
  'a aluna não escolhe o próprio status');

\echo ''
\echo '--- alunas: ficha, código e validade'

set request.jwt.claim.sub = :suporte;
select confere(
  (select codigo from alunas_do_painel() where id = :maria) = '1234',
  'o suporte vê o código da aluna');
select salvar_ficha_aluna(:maria, 'Maria das Graças', 'maria', '4821',
  '2026-09-01', '2027-09-01');
select confere(
  (select codigo = '4821' and entrada = '2026-09-01' and validade = '2027-09-01'
     from alunas_do_painel() where id = :maria),
  'e salva nome, código, entrada e validade');
select recusa(
  format('select salvar_ficha_aluna(%L, %L, %L, %L, %L, %L)',
         :ana, 'Ana', 'maria', '1111', '2026-01-01', '2027-01-01'),
  'login repetido');
select recusa(
  format('select salvar_ficha_aluna(%L, %L, %L, %L, %L, %L)',
         :ana, 'Ana', 'ana', '12a4', '2026-01-01', '2027-01-01'),
  'código que não é de 4 números');

select confere(length(trocar_codigo(:maria)) = 4, 'o suporte troca o código da aluna');

-- Validade vencida ontem: perde o acesso.
select salvar_ficha_aluna(:ana, 'Ana', 'ana', '5678',
  (now() at time zone 'America/Sao_Paulo')::date - 30,
  (now() at time zone 'America/Sao_Paulo')::date - 1);
set request.jwt.claim.sub = :ana;
select confere(not conta_ativa(), 'validade de ontem: Vencida');
set request.jwt.claim.sub = :suporte;
select renovar_acesso(:ana, 0, 0, 1);
select confere(
  (select validade from alunas_do_painel() where id = :ana)
    >= (now() at time zone 'America/Sao_Paulo')::date + 364,
  'renovar conta um ano a partir de hoje, quando já venceu');
set request.jwt.claim.sub = :ana;
select confere(conta_ativa(), 'e ela volta a entrar');

set request.jwt.claim.sub = :ana;
select confere((select count(*) from alunas_do_painel()) = 0, 'aluna não lê a lista de alunas');

\echo ''
\echo '--- equipe'

set request.jwt.claim.sub = :suporte;
select confere((select count(*) from equipe_do_painel()) = 0, 'o suporte não lê a equipe');
select recusa(format('select trocar_codigo(%L)', :admin), 'o suporte não troca código da equipe');
select recusa(format('select bloquear_colaborador(%L, %L)', :admin, 'bloqueada'),
  'o suporte não bloqueia ninguém da equipe');

set request.jwt.claim.sub = :admin;
select confere(
  (select codigo from equipe_do_painel() where id = :dono) is null
  and (select codigo from equipe_do_painel() where id = :admin) is null
  and (select codigo from equipe_do_painel() where id = :suporte) = '5577',
  'o administrador só vê o código do suporte');
select confere(
  not exists (select 1 from credenciais where aluna_id = :dono),
  'nem lendo a tabela direto ele chega ao código do dono');
select recusa(format('select trocar_codigo(%L)', :dono), 'o administrador não troca o código do dono');
select recusa(format('select bloquear_colaborador(%L, %L)', :dono, 'bloqueada'),
  'o administrador não bloqueia o dono');
select recusa(format('select remover_colaborador(%L)', :dono), 'nem remove');
select bloquear_colaborador(:suporte, 'bloqueada');
select confere(
  (select status::text from equipe_do_painel() where id = :suporte) = 'bloqueada',
  'o administrador bloqueia o suporte');
select bloquear_colaborador(:suporte, 'ativa');
select confere(length(trocar_codigo(:suporte)) = 4, 'e troca o código dele');

set request.jwt.claim.sub = :dono;
select confere(
  (select count(*) from equipe_do_painel() where codigo is not null) = 3,
  'o dono vê o código de todo mundo');
select confere(length(trocar_codigo(:admin)) = 4, 'e troca o do administrador');
select recusa(format('select bloquear_colaborador(%L, %L)', :dono, 'bloqueada'),
  'o dono não se bloqueia');
reset role;
select confere(
  not exists (
    select 1 from profiles where papel = 'dono' and status <> 'ativa'),
  'o dono continua ativo');

\echo ''
\echo '--- produto removido leva o que tem dentro'

select id as outro from produtos where titulo = 'Outro' \gset
set role authenticated;
set request.jwt.claim.sub = :suporte;
select recusa(format('select remover_produto(%L)', :'outro'), 'o suporte não remove produto');
set request.jwt.claim.sub = :admin;
select remover_produto(:'outro');
reset role;
select confere(not exists (select 1 from modulos where titulo = 'PRIMEIRO'),
  'o módulo do produto removido também saiu');

reset role;
drop function public.confere(boolean, text);
drop function public.recusa(text, text);

\o
\echo ''
\echo 'TUDO CERTO'
