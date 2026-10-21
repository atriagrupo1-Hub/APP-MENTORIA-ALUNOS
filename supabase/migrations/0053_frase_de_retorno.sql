-- =====================================================================
-- 0053 — Frase de retorno do Início
--
-- A frase que a aluna vê no Início quando volta ("Que bom ter você de
-- volta…"). Editada em Configurações gerais, no painel.
-- O ponto do vídeo continua em `progresso` (posicao_segundos,
-- atualizada_em, concluida_em), gravado por salvar_posicao().
-- =====================================================================

alter table configuracoes add column if not exists frase_retorno text not null
  default 'Que bom ter você de volta. Continue de onde parou e siga avançando na sua jornada.';
