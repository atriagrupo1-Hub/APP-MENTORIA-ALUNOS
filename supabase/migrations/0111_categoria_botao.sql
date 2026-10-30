-- Texto do botão do card de cada categoria (0111); vazio = "Ver categoria".
alter table public.categorias_aba add column if not exists botao_texto text;
alter table public.categorias_aba drop constraint if exists categorias_aba_botao_texto_tamanho;
alter table public.categorias_aba add constraint categorias_aba_botao_texto_tamanho check (botao_texto is null or char_length(botao_texto) <= 30);
