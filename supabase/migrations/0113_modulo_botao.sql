-- Texto do botão do card do módulo (ex.: "Ver aulas"). Vazio = "Ver aulas".
alter table public.modulos add column if not exists botao_texto text;
alter table public.modulos drop constraint if exists modulos_botao_texto_tam;
alter table public.modulos add constraint modulos_botao_texto_tam check (botao_texto is null or char_length(botao_texto) <= 30);
