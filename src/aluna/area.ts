// @ts-nocheck
/*
 * A área da aluna: a maquete aprovada ("Área de Membros AION - maquete.html")
 * ligada ao banco, sem React — o mesmo caminho que o painel seguiu.
 *
 * O desenho, os textos e o comportamento são os da maquete. O que muda é
 * de onde vêm as coisas: catálogo, liberação, progresso, vídeo e
 * comentários vêm do Supabase, que é a única autoridade. No aparelho
 * ficam só preferências da própria aluna (tema, tamanho da letra, foto e
 * cor do círculo) — nada que libere ou bloqueie conteúdo.
 */
import "./area.css";
import { supabase } from "../data/supabase";
import * as api from "../data/api";
import { aplicarAparencia, carregarFonte } from "../data/aparencia";
import { popNotif, SINO } from "../data/notif";
import { cssDaAula, cssDaNotif, cssDaTela, cssDoInicio, cssDoPerfil, cssVisual, limparEstilo, partesMenu } from "../data/estilo";

export function montar(raiz: HTMLElement) {
  raiz.innerHTML = `<div id="app"></div><div id="camada"></div>`;
  // Prévia dentro do painel (Configurações): só para olhar e rolar, sem clicar.
  // O painel manda o que está sendo editado (ainda sem salvar) e a tela redesenha.
  const PREVIA = new URLSearchParams(location.search).has("previa");
  const PREVIA_PAINEL = PREVIA && window.parent !== window;
  if (PREVIA) {
    document.documentElement.classList.add("modo-previa");
    // Um erro na prévia nunca pode deixar o app de dentro travado: redesenha e segue.
    window.addEventListener("message", (ev) => { try { tratarPrevia(ev); } catch (e) { console.error("prévia", e); try { render(); } catch { /* */ } } });
    const tratarPrevia = (ev) => {
      if (ev.origin !== location.origin || !D || !D.inicio) return;
      const m = ev.data || {};
      // As outras abas de Configurações: o que está sendo editado entra por cima do salvo, e a tela vai para onde se mexe.
      if (m.tipo === "previa-cfg") {
        const I = D.inicio;
        PREV_EST = m.estilos && typeof m.estilos === "object" ? m.estilos : { cat: {}, mod: {} };
        // Mexendo nos cards das aulas de um módulo: a lista dele fica aberta na prévia.
        for (const [id, e] of Object.entries(PREV_EST.mod || {})) { const k = MODS().findIndex((x) => x.id === id); if (k >= 0 && e && e.aulas) S.verAulas = { ...(S.verAulas || {}), [k]: true }; }
        if (m.telas) I.telas = { ...(I.telas || {}), ...m.telas };
        if (m.vers) I.vers = { ...(I.vers || {}), ...m.vers };
        if (m.perfil) I.perfil = { ...(I.perfil || {}), ...m.perfil };
        if (m.notif) I.notif = m.notif;
        if (m.menu) I.menu = m.menu;
        if (m.apar) { APAR = m.apar; aplicarAparencia(m.apar, (c) => (c && (c.startsWith("data:") || c.startsWith("blob:")) ? c : api.urlDaCapa(c) || "")); }
        PREV_AULA = "estiloAula" in m ? limparEstilo(m.estiloAula) : undefined;
        PREV_INICIO = "estiloInicio" in m ? limparEstilo(m.estiloInicio) : undefined;
        PREV_PERFIL = "estiloPerfil" in m ? limparEstilo(m.estiloPerfil) : undefined;
        PREV_NOTIF = "estiloNotif" in m ? limparEstilo(m.estiloNotif) : undefined;
        if (m.ir === "aula-exemplo") {
          // Configurações → Aulas: uma aula de exemplo (a primeira com vídeo), e o celular vai até a parte que está sendo mexida.
          if (S.tela !== "aula") { S.previaIr = m.ir; camada.innerHTML = ""; const k = Math.max(0, MODS().findIndex((x) => x.aulas.length)); if (MODS()[k]) acao("aula", { m: k, i: 0 }); }
          if (m.abaAula && S.abaAula !== m.abaAula) S.abaAula = m.abaAula;
        } else if (m.ir === "cursos-exemplo") {
          // Configurações → Cursos: abre uma categoria que tenha curso (não e-book) liberado, para ver o card.
          if (S.previaIr !== m.ir) { S.previaIr = m.ir; camada.innerHTML = ""; const ci = CATS().findIndex((c) => c.cursos.some((x) => x.itens.length && !ehEbook(x) && cursoLiberado(x))); if (ci >= 0) acao("categoria", { v: ci }); setTimeout(() => { const cc = document.querySelector(".cur-card"); if (cc) cc.scrollIntoView({ block: "center" }); }, 60); }
        } else if (m.ir && m.ir !== S.previaIr) { S.previaIr = m.ir; camada.innerHTML = ""; acao("ir", { v: m.ir }); }
        render();
        if (m.foco && m.foco !== S.previaFoco) { S.previaFoco = m.foco; const alvo = document.querySelector(m.foco); if (alvo) alvo.scrollIntoView({ block: "center" }); }
        camada.innerHTML = m.pop && I.notif ? popNotif(I.notif) : camada.querySelector(".fundo-folha") ? camada.innerHTML : "";
        return;
      }
      if (m.tipo !== "previa-inicio") return;
      const I = D.inicio;
      if (S.tela !== "inicio") { S.previaIr = "inicio"; camada.innerHTML = ""; acao("ir", { v: "inicio" }); }
      PREV_AULA = undefined; PREV_PERFIL = undefined; PREV_NOTIF = undefined;
      PREV_INICIO = "estiloInicio" in m ? limparEstilo(m.estiloInicio) : undefined;
      if (!I._destOrig) I._destOrig = I.destaques || [];
      I.marca = { titulo: m.titulo || "", sub: m.sub || "", logo: m.marcaLogo || "" };
      if (m.topo) I.topo = m.topo;
      I.fraseRetorno = m.frase || "";
      if (typeof m.saudacao === "string") I.saudacao = m.saudacao;
      if (typeof m.comece === "string") I.comece = m.comece;
      I.banner = { tipo: m.banner || "card", imagem: m.imagem || "", video: m.video || "" };
      I.estilo = m.estilo || "padrao";
      if (m.divisor) I.divisor = m.divisor;
      I.destaques = m.banner === "card" ? I._destOrig : [];
      render();
      if (m.irBanner) { const alvo = document.querySelector(".pa-banner, [aria-labelledby^='h-dest-']"); if (alvo) alvo.scrollIntoView({ block: "center", behavior: "smooth" }); else scrollTo({ top: 0, behavior: "smooth" }); }
      else if (m.foco && m.foco !== S.previaFoco) { S.previaFoco = m.foco; const alvo = document.querySelector(m.foco); if (alvo) alvo.scrollIntoView({ block: "center" }); }
    };
  }
  // Estilos sendo editados no painel (prévia), por cima dos salvos: { cat: {id: estilo}, mod: {id: estilo} }.
  let PREV_EST = { cat: {}, mod: {} };
  // Estilo da tela da aula sendo editado no painel (undefined = vale o salvo).
  let PREV_AULA = undefined;
  let PREV_INICIO = undefined;
  let PREV_PERFIL = undefined;
  let PREV_NOTIF = undefined;
  let estiloAulaEl = null;
  function aplicarEstiloAula() {
    const css = cssDaAula(PREV_AULA !== undefined ? PREV_AULA : limparEstilo(D && D.inicio && D.inicio.estiloAula))
      + "\n" + cssDoInicio(PREV_INICIO !== undefined ? PREV_INICIO : limparEstilo(D && D.inicio && D.inicio.estiloInicio))
      + "\n" + cssDaTela(partesMenu(MENU().botoes), PREV_INICIO !== undefined ? PREV_INICIO : limparEstilo(D && D.inicio && D.inicio.estiloInicio))
      + "\n" + cssDoPerfil(PREV_PERFIL !== undefined ? PREV_PERFIL : limparEstilo(D && D.inicio && D.inicio.estiloPerfil))
      + "\n" + cssDaNotif(PREV_NOTIF !== undefined ? PREV_NOTIF : limparEstilo(D && D.inicio && D.inicio.estiloNotif));
    if (!estiloAulaEl) { if (!css) return; estiloAulaEl = document.createElement("style"); estiloAulaEl.id = "estilo-aula"; document.head.append(estiloAulaEl); }
    if (estiloAulaEl.textContent !== css) { estiloAulaEl.textContent = css; for (const m of css.matchAll(/font-family:'([^']+)'/g)) carregarFonte(m[1]); }
  }
  const estCat = (curso) => { const p = PREV_EST.cat || {}; return curso.catAbaId && curso.catAbaId in p ? limparEstilo(p[curso.catAbaId]) : curso.estilo; };
  const estMod = (md) => { const p = PREV_EST.mod || {}; return md.id in p ? limparEstilo(p[md.id]) : md.estilo; };
  /** Atributo style com o estilo escolhido no painel (vazio = visual padrão). */
  const est = (e, parte, tipo, extra = "") => { const css = cssVisual(e && e[parte], tipo); return css || extra ? ` style="${[extra, css].filter(Boolean).join(";")}"` : ""; };
  // Aparência do painel (tema, cores, fontes, imagens) — vale também na tela de entrada.
  let APAR = null, APAR_GERAL = false;
  void api.aparenciaDoApp().then((a) => {
    if (APAR_GERAL) return; // a versão geral já pôs a aparência dela
    APAR = a;
    if (a && a.tema === "claro" && !ler("aion-tema", "")) { S.tema = "claro"; }
    aplicarAparencia(a, (c) => api.urlDaCapa(c) || "");
    render();
  }).catch(() => {});
  const app = raiz.querySelector("#app") as HTMLElement;
  const camada = raiz.querySelector("#camada") as HTMLElement;

  /* ---------- utilidades da maquete ---------- */
  const HOJE = new Date();
  const dataCurta = (d) => { d = new Date(d); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); };
  const h = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const p = (n, um, varios) => n + " " + (n === 1 ? um : varios);
  const capaUrl = (caminho) => (caminho ? api.urlDaCapa(caminho) || "" : "");
  const img = (src, alt) => (src ? `<img src="${h(src)}" alt="${h(alt)}" loading="lazy" onerror="this.remove()" />` : "");
  const titulo = (t) => { t = String(t || ""); return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t; };
  const CORES_MOD = ["#e6b85a", "#ff5a4f", "#4ea6ff", "#b47cff", "#8ec5ff", "#b5d66b", "#f5a64a", "#4f8cff", "#ff6fa3", "#f0b45c", "#e6b85a"];
  const CORES_CAT = ["#d4b170", "#6fcb94", "#d99a6c", "#8fb2e8", "#b9a0e8"];
  const CORES_NOME = [["#f2b01e", "Dourado"], ["#ffe000", "Amarelo"], ["#ff6a00", "Laranja"], ["#ff1f8f", "Rosa"], ["#0057ff", "Azul"], ["#000000", "Preto"], ["#ffffff", "Branco"]];
  const CORES_OUTRAS = ["#e07a9a", "#5aa0e6", "#4fbf86", "#a98be6", "#d4a94e", "#e6955a", "#5fc0c0"];
  const corDe = (txt) => { let n = 0; for (const c of String(txt || "")) n = (n * 31 + c.charCodeAt(0)) >>> 0; return CORES_OUTRAS[n % CORES_OUTRAS.length]; };
  const TAM = [17, 18.5, 20, 21.5];
  const NOMES_TAM = ["Normal", "Grande", "Maior", "Máxima"];
  const quandoTxt = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return "há " + Math.max(1, Math.round(s / 60)) + " min";
    if (s < 86400) return "há " + Math.round(s / 3600) + (Math.round(s / 3600) === 1 ? " hora" : " horas");
    const d = Math.round(s / 86400); return "há " + d + (d === 1 ? " dia" : " dias");
  };
  const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

  // Número do suporte no WhatsApp, só dígitos com o país (ex.: 5511999990000).
  const SUPORTE_WHATS = "";

  /* ---------- preferências do aparelho ---------- */
  const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : v; } catch { return padrao; } };
  const gravar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

  /* ---------- estado ---------- */
  const ini = () => ({
    entrou: false, carregando: true, nome: "", tela: "inicio", mod: 0, aula: 0, presente: null,
    origemMod: "inicio", rolagemOrigem: 0, comsFechado: ler("aion-coms-fechado", "0") === "1", comTodos: {}, respTodas: {}, corNome: ler("aion-cor-nome", "#f2b01e"),
    velocidade: "Normal", letra: Math.min(3, Math.max(0, parseInt(ler("aion-letra", "0"), 10) || 0)), tema: ler("aion-tema", "escuro") === "claro" ? "claro" : "escuro",
    meus: {}, rascunho: "", tocando: false, abaAula: null, fim: {}, modFim: {}, mudo: false,
    foto: "", fotoOrig: null, coms: {}, videos: {},
  });
  let S = ini();
  let D = null; // dados vindos do banco
  // Versão geral (0103): aluna sem a mentoria. Sem Módulos e sem "Sua mentoria"; o Início mostra os conteúdos dela.
  let GERAL = false;

  /* ---------- dados ---------- */
  async function carregar() {
    // Tudo de uma vez: a pergunta dos presentes sai assim que o catálogo chega,
    // sem esperar o resto.
    // Versão do app (0103): na prévia do painel vem do painel; para a aluna, o banco decide pelos acessos dela.
    const pVersao = PREVIA_PAINEL ? Promise.resolve(new URLSearchParams(location.search).get("versao") === "geral" ? "geral" : "mentoria") : api.minhaVersao().catch(() => "mentoria");
    const pCat = api.carregarCatalogo();
    const pProd = pCat.then((c) => api.produtosLiberados(c.produtos.filter((x) => x.id !== c.produtoJornada && !x.modulos.length).map((x) => x.id))).catch(() => new Set());
    const [perfil, cat, libs, abert, prodLib, inicio] = await Promise.all([api.meuPerfil(), pCat, api.minhasAulas(), api.minhasAberturas().catch(() => new Map()), pProd, pVersao.then((v) => api.dadosDoInicio(v === "geral")).catch(() => null)]);
    GERAL = (await pVersao) === "geral";
    // A versão geral pode ter a sua própria aparência (Configurações → Versão geral → Aparência).
    if (GERAL && inicio && inicio.aparencia) { APAR_GERAL = true; APAR = inicio.aparencia; aplicarAparencia(APAR, (c) => api.urlDaCapa(c) || ""); }
    const prog = new Map(libs.map((l) => [l.aulaId, l]));
    const jornada = cat.produtoJornada;
    // Categoria Desativada no painel: some daqui inteira. Bloqueada aparece, com cadeado.
    const catOculta = new Set(cat.categorias.filter((c) => c.publicado === false).map((c) => c.id));
    const jornadaOculta = (() => { const pj = cat.produtos.find((x) => x.id === jornada); return !!(pj && catOculta.has(pj.categoriaId)); })();
    const mods = cat.modulos
      .filter((m) => !GERAL && !jornadaOculta && (jornada ? m.produtoId === jornada : true))
      .sort((a, b) => a.ordem - b.ordem || a.numero - b.numero)
      .map((m, k) => {
        const vivo = cat.aoVivo[m.id];
        return {
          id: m.id, num: m.semNumero ? "" : Number.isInteger(m.numero) ? m.numero : k, rot: (m.rotulo || "").trim() || "Módulo", titulo: m.titulo, intro: m.intro || "", aviso: (m.avisoMaterial || "").trim(), capaH: fotoOuSite(m.capaHorizontalPath || ""),
          capa: fotoOuSite(m.capaPath || `modulo-${m.numero}.webp`), cor: /^#[0-9a-f]{6}$/i.test(m.cor || "") ? m.cor : CORES_MOD[k % CORES_MOD.length], estilo: limparEstilo(m.estilo),
          vivo: vivo ? { data: vivo.dataHora || null, texto: (vivo.quandoTexto || "").trim() } : null,
          aulas: m.aulas.filter((a) => a.publicado !== false).sort((a, b) => a.ordem - b.ordem || a.numero - b.numero).map((a, i) => ({
            id: a.id, num: a.semNumero ? "" : Number.isInteger(a.numero) ? a.numero : i + 1, rot: (a.rotulo || "").trim() || "Aula", bloq: !!a.bloqueadoGeral, titulo: a.titulo, texto: a.texto || "", resumo: a.resumo || "", exercicio: a.exercicio || "", capa: fotoOuSite(a.capaPath || `modulo-${m.numero}-aula-${i + 1}.webp`), ...ebookDe(a),
          })),
        };
      });
    // Presentes: as categorias que não são a da jornada, cada uma com seus produtos.
    const prodJ = cat.produtos.find((x) => x.id === jornada);
    const cats = cat.categorias
      .filter((c) => !prodJ || c.id !== prodJ.categoriaId || c.produtos.some((x) => x.id !== jornada && x.publicado !== false))
      .filter((c) => c.publicado !== false)
      .map((c) => ({
        id: c.id, nome: c.titulo, bloqueada: c.bloqueadaGeral,
        cursos: c.produtos.filter((x) => x.id !== jornada && x.publicado !== false).sort((a, b) => (a.catOrdem ?? 1e6) - (b.catOrdem ?? 1e6) || a.ordem - b.ordem).map((x) => ({
          id: x.id, nome: x.titulo, icone: x.catIcone || "", cor: x.catCor || "", catAbaId: x.catAbaId || "", estilo: limparEstilo(x.catEstilo), descricao: x.descricao || "", capa: fotoOuSite(x.capaPath || ""), conteudos: x.conteudos || [],
          liberadoDireto: prodLib.has(x.id),
          itens: x.modulos.slice().sort((a, b) => a.ordem - b.ordem).flatMap((m) => m.aulas.filter((a) => a.publicado !== false).sort((a, b) => a.ordem - b.ordem)).map((a) => ({ id: a.id, mod: a.moduloId, bloq: !!a.bloqueadoGeral, criado: a.criadoEm || "", titulo: a.titulo, texto: a.texto || "", exercicio: a.exercicio || "", capa: fotoOuSite(a.capaPath), ...ebookDe(a) })),
        })),
      }));
    const pj = cat.produtos.find((x) => x.id === jornada);
    MIDIA.clear();
    for (const m of cat.modulos.concat(cat.produtos.flatMap((x) => x.modulos || []))) for (const a of m.aulas) MIDIA.set(a.id, { tipo: a.tipo || "video", arquivo: a.arquivoPath || "" });
    // Abas do menu (0075): cada categoria publicada, menos a da mentoria (Início e Módulos).
    const abas = cat.categorias.filter((c) => c.publicado !== false && (!prodJ || c.id !== prodJ.categoriaId)).map((c) => ({ id: c.id, titulo: c.titulo, icone: c.icone || "presentes" }));
    D = { perfil, mods, cats, prog, abert, user: perfil?.id, inicio, abas, jornada: { rotulo: pj?.rotuloInicio || "", nome: pj?.nomeCurto || "" } };
    S.nome = perfil?.nome || "";
    // A foto vem do banco (a equipe pode ter colocado pelo painel). Uma
    // foto antiga, salva só neste aparelho, sobe uma vez e sai daqui.
    const fotoBanco = await api.minhaFoto().catch(() => undefined);
    const kF = "aion-foto-" + (perfil?.id || ""), kO = "aion-foto-orig-" + (perfil?.id || "");
    if (fotoBanco) {
      S.foto = fotoBanco.foto;
      S.fotoOrig = fotoBanco.original && fotoBanco.ajuste ? Object.assign({ src: fotoBanco.original }, fotoBanco.ajuste) : null;
    } else if (fotoBanco === null && ler(kF, "")) {
      S.foto = ler(kF, "");
      try { S.fotoOrig = JSON.parse(ler(kO, "null")); } catch { S.fotoOrig = null; }
      const o = S.fotoOrig;
      void api.salvarMinhaFoto(S.foto, o ? o.src : null, o ? { w: o.w, h: o.h, z: o.z, x: o.x, y: o.y } : null).then(() => { gravar(kF, null); gravar(kO, null); }).catch(() => {});
    } else { S.foto = ""; S.fotoOrig = null; }
    // A cor do Perfil vem do banco (aparece nos comentários para todas).
    // Uma cor escolhida antes, só neste aparelho, sobe uma vez.
    const corBanco = await api.minhaCor().catch(() => undefined);
    if (corBanco) { S.corNome = corBanco; gravar("aion-cor-nome", corBanco); }
    else if (corBanco === null && ler("aion-cor-nome", "")) void api.salvarMinhaCor(S.corNome).catch(() => {});
  }

  const MODS = () => (D ? D.mods : []);
  /**
   * E-book (0068): os conteúdos da aula se dividem em extras comuns e em
   * opções (botões a mais na tela do e-book), cada uma com os seus extras.
   */
  function ebookDe(a) {
    const cs = a.conteudos || [];
    const opcoes = cs.filter((c) => c.opcao).sort((x, y) => x.ordem - y.ordem).map((o) => Object.assign({}, o, { extras: cs.filter((x) => x.paiId === o.id) }));
    return { conteudos: cs.filter((c) => !c.opcao && !c.paiId), opcoes, botao: (a.botaoEbook || "").trim(), botaoCor: a.botaoEbookCor || "", tipoMidia: a.tipo || "video" };
  }
  /** Tipo e arquivo de cada aula (vídeo, áudio ou PDF), vindos do banco (0067). */
  const MIDIA = new Map();
  // Aula em PDF (e-book): abre no leitor; abrir conclui a aula no banco.
  async function lerPdfAula(aulaId) {
    const md = MIDIA.get(aulaId); if (!md || !md.arquivo) { aviso("Este e-book será adicionado em breve."); return; }
    const u = await api.enderecoDoArquivo("materiais", md.arquivo).catch(() => null);
    if (!u) { aviso("Não conseguimos abrir este e-book agora. Tente de novo."); return; }
    const tit = (S.tela === "presente" ? conteudoAtual()?.titulo : MODS()[S.mod]?.aulas[S.aula]?.titulo) || "E-book";
    abrirPdf(u, tit, (md.arquivo.split("/").pop() || "ebook.pdf").replace(/^\d+-/, ""));
    const l = D && D.prog.get(aulaId); if (l) l.concluida = true;
    ultimaConclusao = api.marcarConcluida(aulaId, true).catch(() => {});
  }
  /** Número da aula escolhido no painel (0063); sem ele, a posição. */
  const nA = (md, i) => (md && md.aulas[i] && md.aulas[i].num != null ? md.aulas[i].num : i + 1);
  /** "Aula 1", "Episódio 2"…: nome e número que a equipe escolheu para a aula (0064). */
  const lA = (md, i) => ((md && md.aulas[i] && md.aulas[i].rot) || "Aula") + " " + nA(md, i);
  const agora = () => Date.now();
  // Na prévia do painel (conta da equipe, que o banco já deixa ver tudo) o app aparece como para a aluna com as aulas liberadas.
  const aulaAdmin = (id) => { if (PREVIA_PAINEL && D) return true; if (!D || !D.prog.has(id)) return false; const ab = D.abert.get(id); return !ab || new Date(ab).getTime() <= agora(); };
  const aberturaDe = (id) => { const ab = D && D.abert.get(id); return ab && new Date(ab).getTime() > agora() ? ab : null; };
  const feitaId = (id) => !!(D && D.prog.get(id)?.concluida);
  const feita = (m, a) => feitaId(MODS()[m].aulas[a].id);
  const posicaoId = (id) => { const l = D && D.prog.get(id); if (!l || !l.duracaoSegundos) return 0; return Math.min(1, (l.posicaoSegundos || 0) / l.duracaoSegundos); };
  const posicao = (m, a) => posicaoId(MODS()[m].aulas[a].id);
  // Dentro do módulo, a aula abre quando a anterior foi concluída (0054).
  // Em sequência: a anterior que conta é a última não bloqueada pela equipe (igual ao banco, 0069).
  const seqOk = (m, a) => { const as = MODS()[m].aulas; for (let k = a - 1; k >= 0; k--) if (!as[k].bloq) return feita(m, k); return true; };
  const feitasMod = (m) => MODS()[m].aulas.filter((_, a) => feita(m, a)).length;
  const moduloAdmin = (m) => { const md = MODS()[m]; return !md.aulas.length || md.aulas.some((x) => aulaAdmin(x.id)); };
  const modConcluido = (m) => { const md = MODS()[m]; return !md.aulas.length || feitasMod(m) === md.aulas.length; };
  // Liberado pelo cadastro da aluna (datas e bloqueios do painel); dentro do módulo, ainda em sequência (seqOk).
  const liberado = (m) => moduloAdmin(m);
  const abre = (m) => { const ds = MODS()[m].aulas.map((x) => aberturaDe(x.id)).filter(Boolean).sort(); return ds[0] || null; };
  const total = () => MODS().reduce((s, x) => s + x.aulas.length, 0);
  /*
   * "Continue de onde parou" (Início da aluna que volta), nesta ordem:
   * 1) a última aula começada e não terminada (pela data em que parou);
   * 2) a próxima aula liberada depois da última concluída, na ordem do curso;
   * 3) nada: ela terminou tudo o que está liberado (o Início mostra a data
   *    da próxima liberação). Aula bloqueada nunca entra. Tudo vem do banco.
   */
  function continuar() {
    if (!D) return null;
    const ordem = [];
    MODS().forEach((md, m) => md.aulas.forEach((x, a) => { if (aulaAdmin(x.id) && seqOk(m, a)) ordem.push({ m, a, id: x.id }); }));
    let melhor = null;
    for (const o of ordem) {
      const l = D.prog.get(o.id);
      if (!l || l.concluida || !(l.atualizadaEm || (l.posicaoSegundos || 0) > 0)) continue;
      if (!melhor || (l.atualizadaEm || "") > melhor.t) melhor = { o, t: l.atualizadaEm || "" };
    }
    if (melhor) return { m: melhor.o.m, a: melhor.o.a };
    let ultima = -1;
    ordem.forEach((o, k) => { if (feitaId(o.id)) ultima = k; });
    const depois = ordem.slice(ultima + 1).find((o) => !feitaId(o.id)) || ordem.find((o) => !feitaId(o.id));
    return depois ? { m: depois.m, a: depois.a } : null;
  }
  function estadoAula(m, a) {
    const id = MODS()[m].aulas[a].id;
    if (!liberado(m)) return { cls: "fechado", txt: "Libera em breve", fech: true };
    if (!aulaAdmin(id)) return { cls: "fechado", txt: "Libera em breve", fech: true };
    if (!seqOk(m, a)) return { cls: "fechado", txt: "Conclua a " + lA(MODS()[m], a - 1) + " para liberar", fech: true, seq: true };
    if (feita(m, a)) return { cls: "ok", txt: "✓ Concluída" };
    if (posicao(m, a) > 0) return { cls: "andando", txt: "Em andamento" };
    return { cls: "livre", txt: "Disponível" };
  }
  function estadoMod(m) {
    const t = MODS()[m].aulas.length;
    if (!liberado(m)) return { cls: "fechado", txt: "Libera em breve", fech: true };
    const n = feitasMod(m);
    if (t && n === t) return { cls: "ok", txt: "✓ Módulo concluído" };
    if (n > 0) return { cls: "andando", txt: n + " de " + t + " aulas feitas" };
    return { cls: "livre", txt: "Disponível · " + p(t, "aula", "aulas") };
  }
  // A aluna não vê datas de liberação: o que está trancado diz só "Libera em breve".
  const msgModFechado = () => "Libera em breve";
  // O aviso dentro da página do módulo bloqueado.
  const avisoModFechado = () => "Libera em breve.";
  const dataVivo = (v) => { if (v.data) { const d = new Date(v.data); return dataCurta(d) + " às " + String(d.getHours()).padStart(2, "0") + "h" + (d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""); } return v.texto || "data a confirmar"; };

  /* ---------- ícones (da maquete) ---------- */
  const ICONES = {
    meus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.6C10.4 5.4 7.9 4.8 4 4.8v13c3.9 0 6.4.6 8 1.8 1.6-1.2 4.1-1.8 8-1.8v-13c-3.9 0-6.4.6-8 1.8z"/><path d="M12 6.6v13"/></svg>',
    novos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.2l2.5 5.1 5.6.8-4 3.9 1 5.5-5.1-2.7-5.1 2.7 1-5.5-4-3.9 5.6-.8z"/></svg>',
    resumo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
    exercicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17M11 6h9M11 12h9M11 18h9"/></svg>',
    mais: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5.5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="18.5" r="1.8"/></svg>',
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    modulos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="18" height="6" rx="1.5"/></svg>',
    presentes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13"/><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8zm0 0c2-4 6-4 6-1.5S15 8 12 8z"/></svg>',
    perfil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/></svg>',
    curtido: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
    pausa: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    engrenagem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" stroke-linecap="round"/></svg>',
    telaCheia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
    livro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 5.5c3-1.3 6-1.3 9 .5v13c-3-1.8-6-1.8-9-.5zM21 5.5c-3-1.3-6-1.3-9 .5v13c3-1.8 6-1.8 9-.5z"/></svg>',
    material: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>',
    balao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 5h16v11H9l-4 3.5V16H4z"/></svg>',
    enviar: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 11.2L20 4.5l-6.7 16.5-2.3-7.1z"/></svg>',
    seta_esq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H5M11 5l-7 7 7 7"/></svg>',
    chev_esq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    chev_dir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>',
    cadeado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    refazer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>',
    trofeu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M9 20h6M10 17h4"/></svg>',
    coroa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17L3 7l5 4 4-6 4 6 5-4-1 10z"/><path d="M4 20h16"/></svg>',
  };
  /*
   * Abas do app (0075): Início e Módulos (a mentoria), uma aba para cada
   * "aba" do painel (Presentes…, com as categorias dela) e Perfil.
   */
  const ABAS = () => (D && D.abas) || null;
  const abaAtual = () => { const l = ABAS(); if (!l || !l.length) return null; return l.find((a) => a.id === S.aba) || l.find((a) => /presente/i.test(a.titulo)) || l[0]; };
  // Versão geral (0103): Início, Meus Cursos, Novos e Perfil, como no desenho.
  const NAVL_BASE = () => { const l = ABAS(); if (GERAL) return [["inicio", "Início"], ["meus", "Meus Cursos", "meus"], ["novos", "Novos", "novos"], ["perfil", "Perfil"]]; return [["inicio", "Início"], ["modulos", "Módulos"], ...(l ? l.map((a) => ["aba:" + a.id, a.titulo, a.icone]) : [["presentes", "Presentes"]]), ["perfil", "Perfil"]]; };
  /** Menu do app como o painel deixou (Configurações → Menu inferior): ordem, nome, ícone, cor, visível e links extras. */
  const MENU = () => (D && D.inicio && D.inicio.menu) || { botoes: null, estilo: "padrao", cores: null, tamanho: "medio" };
  const NAVL = () => {
    const base = NAVL_BASE(), cfg = MENU().botoes;
    if (!cfg) return base;
    const usados = new Set(), out = [];
    for (const b of cfg) {
      if (b.url) { if (b.visivel !== false) out.push(["link:" + b.url, b.rotulo, b.icone || "mais", b.cor]); continue; }
      const x = base.find((y) => y[0] === b.id); if (!x) continue;
      usados.add(b.id);
      if (b.visivel !== false) out.push([x[0], b.rotulo || x[1], b.icone || x[2], b.cor]);
    }
    return out.concat(base.filter((x) => !usados.has(x[0])));
  };
  const icNav = (id, ic) => ICONES[ic] || ICONES[id] || ICONES.presentes;
  function navBase(n) {
    const M = MENU(), l = NAVL(), c = M.cores || {};
    const vars = [["--nb-fundo", c.fundo], ["--nb-inativo", c.inativo], ["--nb-ativo", c.ativo], ["--nb-texto", c.texto]].filter(([, v]) => v && /^#[0-9a-f]{6}$/i.test(v)).map(([k, v]) => k + ":" + v).join(";");
    return `<nav class="nav-base nb-${h(M.estilo || "padrao")} nb-${h(M.tamanho || "medio")}${M.cores ? " nb-cores" : ""}" aria-label="Principal" style="grid-template-columns:repeat(${l.length},1fr);${vars}">${l.map(([id, t, ic, cor]) => {
      const estilo = cor && /^#[0-9a-f]{6}$/i.test(cor) ? ` style="--nb-ativo:${cor}"` : "";
      return id.startsWith("link:") ? `<a class="nb-link" href="${h(id.slice(5))}" target="_blank" rel="noopener"${estilo}>${icNav(id, ic)}${h(t)}</a>` : `<button data-a="ir" data-v="${id}" ${n === id ? 'aria-current="page"' : ""}${estilo}>${icNav(id, ic)}${h(t)}</button>`;
    }).join("")}</nav>`;
  }
  const navPres = () => { const a = abaAtual(); return a ? "aba:" + a.id : "presentes"; };
  const navAtual = () => { const t = ({ modulo: S.origemMod || "inicio", aula: S.origemMod || "inicio", presente: "presentes", opcao: "presentes", categoria: "presentes", cursoPres: "presentes", leitor: "presentes", jornada: (S.jornadaDe && S.jornadaDe.tela) || "perfil" })[S.tela] || S.tela; return t === "presentes" ? navPres() : t; };
  const NOME_ORIGEM = { inicio: "Início", modulos: "Módulos", perfil: "Perfil", presentes: "Presentes" };
  const avTopo = () => (S.foto ? `<img src="${S.foto}" alt="" />` : h((S.nome || "?").trim().charAt(0).toUpperCase()));
  const avCom = (nome, cor, foto, pq) => foto
    ? `<span class="av av-c av-foto${pq ? " pq" : ""}" style="--c:${cor}" aria-hidden="true"><img src="${h(foto)}" alt="" onerror="this.remove()" /></span>`
    : `<span class="av av-c${pq ? " pq" : ""}" style="--c:${cor}" aria-hidden="true">${h(String(nome || "?").trim().charAt(0).toUpperCase())}</span>`;
  const controleLetra = () => `<div class="tamanho"><button data-a="letra-menos" aria-label="Diminuir a letra" ${S.letra <= 0 ? "disabled" : ""}>A−</button><span aria-live="polite"><b>Aa</b>${NOMES_TAM[S.letra]}</span><button data-a="letra-mais" aria-label="Aumentar a letra" ${S.letra >= TAM.length - 1 ? "disabled" : ""}>A+</button></div>`;
  const cabMp = (voltar, rotulo) => `
    <header class="mp-cab">
      <button class="mp-voltar" ${voltar} aria-label="Voltar para ${h(rotulo)}"><span aria-hidden="true">‹</span>Voltar</button>
      <button class="mp-marca" data-a="ir" data-v="inicio" aria-label="Ir para o início">${marcaTopo()}</button>
      <button class="av-topo${S.foto ? " com-foto" : ""}" data-a="perfil-av" aria-label="Abrir o seu perfil" style="--c:${S.corNome}">${avTopo()}</button>
    </header>`;

  /* ---------- desenho ---------- */
  function render() {
    const cfgAntes = app.querySelector(".config-corpo");
    const cfgTopo = cfgAntes ? cfgAntes.scrollTop : null;
    const pagTopo = window.scrollY;
    aplicarEstiloAula();
    try { renderReal(); if (GERAL && S.tela === "inicio") ligarCarrossel(); } finally {
      const cfg = app.querySelector(".config");
      if (cfg && cfgTopo !== null) { cfg.classList.add("sem-anim"); const c = cfg.querySelector(".config-corpo"); if (c) c.scrollTop = cfgTopo; window.scrollTo(0, pagTopo); }
      encaixarVideo();
    }
  }
  function renderReal() {
    if (!Number.isInteger(S.letra) || S.letra < 0 || S.letra >= TAM.length) S.letra = 0;
    document.documentElement.style.fontSize = TAM[S.letra] + "px";
    document.documentElement.setAttribute("data-tema", S.tema === "claro" ? "claro" : "escuro");
    if (S.carregando) { document.body.classList.add("sem-nav"); app.innerHTML = `<div class="entrada"><div class="ent-col"><p class="apoio" style="text-align:center">Carregando…</p></div></div>`; return; }
    if (!S.entrou && S.saiu) { document.body.classList.add("sem-nav"); app.innerHTML = telaSaiu(); return; }
    if (!S.entrou) { document.body.classList.add("sem-nav"); app.innerHTML = telaEntrada(); return; }
    document.body.classList.remove("sem-nav");
    const telas = { meus: telaMeus, novos: telaNovos, inicio: telaInicio, modulos: telaModulos, modulo: telaModulo, aula: telaAula, presentes: telaPresentes, categoria: telaCategoria, cursoPres: telaCursoPres, presente: telaPresente, opcao: telaOpcao, perfil: telaPerfil, jornada: telaJornada, leitor: telaLeitor };
    if (!telas[S.tela]) S.tela = "inicio";
    const n = navAtual();
    app.innerHTML = `
      ${S.tela === "aula" || S.tela === "modulo" || S.tela === "presente" || S.tela === "opcao" || S.tela === "leitor" || S.tela === "cursoPres" ? "" : topoApp(n)}
      <main>${telas[S.tela]()}</main>
      ${S.tela === "leitor" ? "" : navBase(n)}`;
  }

  function telaEntrada() {
    return `
    <div class="entrada"><div class="ent-col">
      <div class="ent-marca">
        <span class="ent-logo">
          <img src="/marca-aion.png" alt="AIŌN" onerror="this.remove()" />
          <span class="ent-logo-txt serif" aria-hidden="true">AIŌN</span>
        </span>
        <p class="ent-sobre">Mentoria</p>
        <p class="ent-nome serif">CAMINHO DO DESBLOQUEIO</p>
        <p class="ent-nome serif">PARA BÊNÇÃOS ILIMITADAS</p>
      </div>
      ${S.bloqueado ? `
      <div class="ent-cartao ent-bloq" role="alert">
        <span class="ent-bloq-ic" aria-hidden="true">${ICONES.cadeado}</span>
        <h1>Acesso bloqueado</h1>
        <p class="ent-bloq-txt">${h(S.bloqueado)}</p>
        <p class="ent-bloq-txt">Fale com o suporte para desbloquear. É rápido.</p>
        <button class="ent-entrar" data-a="suporte-whats">Falar com o suporte no WhatsApp<span aria-hidden="true">→</span></button>
      </div>` : `
      <form class="ent-cartao" data-f="entrar" novalidate>
        <h1>Bem-vindo(a)</h1>
        <label class="ent-rot" for="nome">Seu nome</label>
        <div class="ent-campo${S.erroCampo === "nome" ? " ent-erro" : ""}">
          <span class="ent-ic" aria-hidden="true"><span class="cab"></span><span class="corpo"></span></span>
          <input id="nome" name="nome" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Digite seu nome" value="${h(S.nomeDigitado || "")}"${S.erroCampo === "nome" ? ' aria-invalid="true" aria-describedby="erro-entrada"' : ""} />
        </div>
        ${S.erroEntrada && S.erroCampo === "nome" ? `<p class="erro ent-erro-txt" id="erro-entrada" role="alert">${h(S.erroEntrada)}</p>` : ""}
        <label class="ent-rot" for="codigo">Seu código</label>
        <div class="ent-campo${S.erroCampo === "codigo" ? " ent-erro" : ""}">
          <input id="codigo" name="codigo" class="ent-cod ent-cod-aberto" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Digite seu código" value="${h(S.codigoDigitado || "")}"${S.erroCampo === "codigo" ? ' aria-invalid="true" aria-describedby="erro-entrada"' : ""} />
        </div>
        ${S.erroEntrada && S.erroCampo !== "nome" ? `<p class="erro ent-erro-txt" id="erro-entrada" role="alert">${h(S.erroEntrada)}</p>` : ""}
        <button class="ent-entrar" ${S.entrando ? "disabled" : ""}>${S.entrando ? "Entrando…" : "Entrar na mentoria"}<span aria-hidden="true">→</span></button>
        <p class="ent-nota" style="margin-top:20px">Acesso reservado às alunas da mentoria.</p>
      </form>`}
      <div class="ent-selos">
        <span><i>✓</i>Acesso protegido</span>
        <span><i>⌘</i>Dados privados</span>
        <span><i>♦</i>Turma verificada</span>
      </div>
    </div></div>`;
  }

  function linhaModulo(m, irModulo) {
    const md = MODS()[m], e = estadoMod(m), n = feitasMod(m), t = md.aulas.length;
    const aberto = !!(S.verAulas || {})[m];
    const COR = md.cor, E = estMod(md);
    const meta = `<p class="mc-meta"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>${t ? p(t, "aula", "aulas") : "Aula será adicionada em breve"}</span></p>`;
    // Formato "capa em cima" (Configurações → Módulos), só na tela Módulos: igual ao card do Início.
    const cima = !irModulo && TELAS().modFormato === "cima";
    const rotIc = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>`;
    if (cima && !e.fech) return `
    <div class="mod-bloco mc mc-cima"${est(E, "card", "card", "--mc:" + COR)}>
      <button class="mc-capa-h"${est(E, "capa", "capa")} data-a="modulo" data-m="${m}" aria-label="Abrir o ${h(md.rot)} ${md.num}">${img(md.capaH || md.capa, "")}</button>
      <div class="mc-info">
        <button class="mc-cab" data-a="modulo" data-m="${m}"><span class="mc-rot">${rotIc}${h(md.rot)} ${md.num}</span><b class="mc-tit serif">${h(titulo(md.titulo))}</b></button>
        ${md.intro ? `<p class="mc-desc">${h(md.intro)}</p>` : ""}
        ${n > 0 ? `<p class="mc-prog"><span class="barra"><i style="width:${(n / t) * 100}%"></i></span>${n === t ? "✓ Concluído" : n + " de " + t + " feitas"}</p>` : ""}
        ${t ? `<button class="ex-botao mc-ver-cheio ver-aulas"${est(E, "botao", "botao")} data-a="ver-aulas" data-m="${m}" aria-expanded="${aberto}">${aberto ? "Esconder aulas" : "Ver aulas (" + t + ")"}</button>` : `<p class="mc-meta">Aula será adicionada em breve</p>`}
      </div>
    ${!t ? "" : `<div class="lista-aulas-mod${aberto ? " aberto" : ""}" id="la-${m}"><div class="la-in">${md.aulas.map((x, i) => { const ea = estadoAula(m, i); return `
      <button class="la-item${ea.fech ? " fechada" : ""}"${est(E, "aulas", "card")} data-a="aula" data-m="${m}" data-i="${i}">
        <span class="la-capa">${img(x.capa, "")}<span class="la-ic">${ea.fech ? '<span class="cadeado"></span>' : feita(m, i) ? "✓" : ""}</span></span>
        <span class="la-info"><b>${h(md.rot)} ${md.num} · ${h(lA(md, i))}</b><span>${h(x.titulo)}</span>${ea.fech ? `<span class="aviso-lib">${ICONES.cadeado}${h(ea.txt)}</span>` : `<em>${feita(m, i) ? "Concluída" : "Disponível"}</em>`}</span>
        ${ea.fech ? "" : `<span class="la-assistir" aria-hidden="true">${ICONES.play}Assistir</span>`}
      </button>`; }).join("")}</div></div>`}
    </div>`;
    if (e.fech) {
      const msg = msgModFechado(m);
      return `
    <div class="mod-bloco mc mc-tranc${cima ? " mc-cima" : ""}"${est(E, "card", "card", "--mc:" + COR)}>
      <button class="mc-top" data-a="modulo" data-m="${m}" aria-label="${h(md.rot)} ${md.num}, ${h(titulo(md.titulo))}. Bloqueado. ${h(msg)}.">
        <span class="${cima ? "mc-capa-h" : "mc-capa"}" aria-hidden="true"${est(E, "capa", "capa")}>${img(cima ? md.capaH || md.capa : md.capa, "")}</span>
        <span class="mc-info" aria-hidden="true">
          <span class="mc-rot">${h(md.rot)} ${md.num}</span>
          <b class="mc-tit serif">${h(titulo(md.titulo))}</b>
          ${meta}
        </span>
        <span class="tranca-veu" aria-hidden="true">
          <span class="tranca-ic">${ICONES.cadeado}</span>
          <span class="tranca-txt"><b>${h(md.rot)} ${md.num} · ${h(titulo(md.titulo))}</b><span>${h(msg)}</span></span>
        </span>
      </button>
    </div>`;
    }
    return `
    <div class="mod-bloco mc"${est(E, "card", "card", "--mc:" + COR)}>
      <div class="mc-top">
        <button class="mc-capa"${est(E, "capa", "capa")} data-a="modulo" data-m="${m}" aria-label="Abrir o ${h(md.rot)} ${md.num}">${img(md.capa, "")}</button>
        <div class="mc-info">
          <button class="mc-cab" data-a="modulo" data-m="${m}"><span class="mc-rot">${h(md.rot)} ${md.num}</span><b class="mc-tit serif">${h(titulo(md.titulo))}</b></button>
          ${meta}
          ${n > 0 ? `<p class="mc-prog"><span class="barra"><i style="width:${(n / t) * 100}%"></i></span>${n === t ? "✓ Concluído" : n + " de " + t + " feitas"}</p>` : ""}
          ${irModulo
            ? `<button class="ex-botao mc-ver-grande"${est(E, "botao", "botao")} data-a="modulo" data-m="${m}">Ver aulas</button>`
            : t ? `<button class="mc-ver ver-aulas"${est(E, "botao", "botao")} data-a="ver-aulas" data-m="${m}" aria-expanded="${aberto}">${aberto ? "Esconder aulas" : "Ver aulas (" + t + ")"}<span aria-hidden="true">${aberto ? "⌃" : "⌄"}</span></button>` : ""}
        </div>
      </div>
    ${irModulo || !t ? "" : `<div class="lista-aulas-mod${aberto ? " aberto" : ""}" id="la-${m}"><div class="la-in">${md.aulas.map((x, i) => { const ea = estadoAula(m, i); return `
      <button class="la-item${ea.fech ? " fechada" : ""}"${est(E, "aulas", "card")} data-a="aula" data-m="${m}" data-i="${i}">
        <span class="la-capa">${img(x.capa, "")}<span class="la-ic">${ea.fech ? '<span class="cadeado"></span>' : feita(m, i) ? "✓" : ""}</span></span>
        <span class="la-info"><b>${h(md.rot)} ${md.num} · ${h(lA(md, i))}</b><span>${h(x.titulo)}</span>${ea.fech ? `<span class="aviso-lib">${ICONES.cadeado}${h(ea.txt)}</span>` : `<em>${feita(m, i) ? "Concluída" : "Disponível"}</em>`}</span>
        ${ea.fech ? "" : `<span class="la-assistir" aria-hidden="true">${ICONES.play}Assistir</span>`}
      </button>`; }).join("")}</div></div>`}
    </div>`;
  }

  /** Saudação do topo do Início (Configurações → Início): {nome} vira o primeiro nome da aluna. */
  const saudacaoIni = (primeiro) => {
    const t = (D && D.inicio && D.inicio.saudacao) ?? "Bem-vindo(a), {nome}";
    if (!t.trim()) return "";
    const i = t.indexOf("{nome}");
    if (i < 0) return `<span class="pa-saud">${h(t)}</span>`;
    const antes = t.slice(0, i).trimEnd(), depois = t.slice(i + 6);
    return `${antes ? `<span class="pa-saud">${h(antes)}</span> ` : ""}${h(primeiro)}${h(depois)}`;
  };
  /** Banner do Início escolhido no painel (Configurações → Início): imagem ou vídeo. */
  function bannerInicio() {
    const b = (D && D.inicio && D.inicio.banner) || {};
    if (b.tipo === "imagem" && b.imagem) return `<figure class="pa-banner">${img(b.imagem, "")}</figure>`;
    // Na prévia do painel, a opção escolhida sem conteúdo ainda aparece como um espaço reservado.
    if (PREVIA && (b.tipo === "imagem" || b.tipo === "video") && !(b.tipo === "imagem" ? b.imagem : b.video)) return `<figure class="pa-banner pa-banner-vazio"><span>${b.tipo === "imagem" ? "Imagem do banner<small>Envie a imagem no painel</small>" : "Vídeo de boas-vindas<small>Cole o link do vídeo no painel</small>"}</span></figure>`;
    if (b.tipo === "video" && b.video) return `<figure class="pa-banner pa-banner-video"><iframe src="https://iframe.videodelivery.net/${h(b.video)}" title="Vídeo de boas-vindas" loading="lazy" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe></figure>`;
    return "";
  }
  /** "Comece por aqui" (Configurações → Início); vazio não aparece. */
  const comeceTxt = () => { const c = D && D.inicio && D.inicio.comece; return typeof c === "string" ? c.trim() : "Comece por aqui"; };
  const estiloOla = () => { const e = D && D.inicio && D.inicio.estilo; return e === "moldura" || e === "minimalista" ? " pa-ola-" + e : ""; };
  /** Versículo do dia no lugar escolhido no painel (Configurações → Versículos: topo, mensagem ou depois). */
  const versNo = (onde) => { const V = (D && D.inicio && D.inicio.vers) || {}; return (V.posicao || "mensagem") === onde ? versiculoHoje() : ""; };
  function versiculoHoje() {
    // A lista vem do painel (Configurações → Versículos); um por dia, em sequência.
    const V = (D && D.inicio && D.inicio.vers) || {};
    if (V.exibir === false) return "";
    const vs = (D && D.inicio && D.inicio.versiculos) || [];
    if (!vs.length) return "";
    const dia = Math.floor((HOJE - new Date(HOJE.getFullYear(), 0, 0)) / 864e5);
    const [txt, ref] = vs[dia % vs.length];
    return `
          <figure class="vers v-${h(V.estilo || "caixa")} v-fundo-${h(V.fundo || "escuro")} v-${h(V.fonte || "serifa")} v-${h(V.tamanho || "medio")}${V.cores ? " v-cores" : ""}" aria-label="${h((typeof V.titulo === "string" ? V.titulo : "Versículo de hoje").trim() || "Mensagem de destaque")}"${V.cores ? ` style="${["texto", "borda", "fundo"].filter((k) => /^#[0-9a-f]{6}$/i.test(V.cores[k] || "")).map((k) => "--v-" + k + ":" + V.cores[k]).join(";")}"` : ""}>
            ${(typeof V.titulo === "string" ? V.titulo : "Versículo de hoje").trim() ? `<p class="vers-rot"><span aria-hidden="true"></span>${h((typeof V.titulo === "string" ? V.titulo : "Versículo de hoje").trim())}<span aria-hidden="true"></span></p>` : ""}
            <blockquote class="vers-txt serif">“${h(txt)}”</blockquote>
            ${V.referencia === false ? "" : `<figcaption class="vers-ref">${h(ref)}</figcaption>`}
          </figure>`;
  }

  // Destaques do Início (painel → Categorias / Layout → Destaques do Início).
  const COR_DESTAQUE = { violeta: "mestres", verde: "pres", azul: "doc", vermelho: "vivo", turquesa: "desc", dourado: "" };
  const ICONE_DESTAQUE = {
    lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/></svg>',
    estrela: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3.2"/></svg>',
    presente: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13"/><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8zm0 0c2-4 6-4 6-1.5S15 8 12 8z"/></svg>',
    filme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>',
    livro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/></svg>',
    som: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0"/></svg>',
  };
  const fotoOuSite = (c) => (c ? (c.startsWith("/") ? c : capaUrl(c)) : "");
  function cartoesDestaque() {
    const ds = (D && D.inicio && D.inicio.destaques) || [];
    return ds.map((d, i) => {
      const ci = d.destino === "categoria" && d.categoriaId ? CATS().findIndex((c) => c.id === d.categoriaId) : -1;
      const alvo = d.destino === "presentes" ? `data-a="ir" data-v="presentes"`
        : ci >= 0 ? `data-a="categoria" data-v="${ci}"` : `data-a="ir-cat" data-v="${h(d.categoriaNome || d.rotulo)}"`;
      const cls = COR_DESTAQUE[d.cor] ?? "";
      // Destino ainda não liberado para ela: o cartão fica trancado, igual ao da aba Presentes, e não leva a lugar nenhum.
      const nomeAlvo = String(d.categoriaNome || d.rotulo || "").toLowerCase();
      const pr = PRESENTES().find((x) => x.curso.nome.toLowerCase() === nomeAlvo);
      const trancado = d.destino === "presentes" ? !PRESENTES().some((x) => cursoLiberado(x.curso))
        : ci >= 0 ? !catAberta(CATS()[ci]) : !(pr && cursoLiberado(pr.curso));
      if (trancado) return `
      <section class="ex-card ex-banner pres-banner-card pres-fech ${cls}" aria-labelledby="h-dest-${i}">
        <button class="pres-fech-alvo" data-a="dest-fechado" aria-label="${h(d.titulo)}. Bloqueado, ainda não liberado.">
          <span class="pres-fech-area" aria-hidden="true">
            <span class="ex-img ex-img-banner cat-fech-fosco">${img(fotoOuSite(d.imagem), "")}</span>
            <span class="cat-fech-veu"><span class="cat-fech-cad">${ICONES.cadeado}</span><span class="cat-fech-chama">Em breve, só para você</span></span>
          </span>
          <span class="ex-info">
            <span class="ex-rot">${ICONE_DESTAQUE[d.icone] || ""}${h(d.rotulo)}</span>
            <span class="pres-fech-tit serif" id="h-dest-${i}">${h(d.titulo)}</span>
            ${d.descricao ? `<span class="ex-desc cat-fech-fosco">${h(d.descricao)}</span>` : ""}
            <span class="ex-botao cat-fech-fosco">${h(d.botao)}</span>
          </span>
        </button>
      </section>`;
      return `
      <section class="ex-card ${cls} ex-banner" aria-labelledby="h-dest-${i}">
        <button class="ex-img ex-img-banner" ${alvo} aria-label="${h(d.botao)}">${img(fotoOuSite(d.imagem), d.titulo)}</button>
        <div class="ex-info">
          <p class="ex-rot">${ICONE_DESTAQUE[d.icone] || ""}${h(d.rotulo)}</p>
          <h2 class="serif" id="h-dest-${i}">${h(d.titulo)}</h2>
          ${d.descricao ? `<p class="ex-desc">${h(d.descricao)}</p>` : ""}
          <button class="ex-botao${cls === "mestres" ? " mestres-botao" : ""}" ${alvo}>${h(d.botao)}</button>
        </div>
      </section>`;
    }).join("");
  }
  // "Mentoria" / "Área de Alunos": painel → Configurações gerais.
  /*
   * Topo do app (0105), igual em todas as telas e nas duas versões: à esquerda a foto,
   * a saudação (editável no painel) e o nome da aluna (do cadastro); no meio a marca
   * (texto com cor e fonte próprias, ou logo); à direita a busca e os avisos.
   */
  function topoApp(n) {
    const T = (D && D.inicio && D.inicio.topo) || {}, N = NOTIF(), aviso = !!(N && N.ativo && !S.notifOn && !PREVIA);
    return `<header class="topo topo-novo"><div class="pagina">
        <button class="av-topo ig-av${S.foto ? " com-foto" : ""}" data-a="perfil-av" aria-label="Abrir o seu perfil" style="--c:${S.corNome}">${avTopo()}</button>
        <div class="ig-ola tp-ola">${saudTopo(T.saudacao)}</div>
        <button class="marca marca-alunos tp-marca" data-a="ir" data-v="inicio" aria-label="Ir para o início">${marcaTopo()}</button>
        <nav class="nav-topo" aria-label="Principal">${NAVL().map(([id, t]) => id.startsWith("link:") ? `<a href="${h(id.slice(5))}" target="_blank" rel="noopener">${h(t)}</a>` : `<button data-a="ir" data-v="${id}" ${n === id ? 'aria-current="page"' : ""}>${h(t)}</button>`).join("")}</nav>
        <div class="ig-bts"><button class="ig-bt" data-a="ig-busca" aria-label="Buscar">${IG.busca}</button><button class="ig-bt" data-a="${aviso ? "notif-ativar" : "perfil-av"}" aria-label="Avisos">${IG.sino}${aviso ? "<i></i>" : ""}</button></div>
      </div></header>`;
  }
  /**
   * Saudação do topo: o nome só entra onde a equipe escreveu {nome} (primeiro nome) ou
   * {nome_completo}. O que vem antes do nome fica pequeno em cima; o nome (e o resto), grande embaixo.
   */
  function saudTopo(txt) {
    const t = String(txt ?? "").trim(); if (!t) return "";
    const completo = (S.nome || "").trim(), primeiro = completo.split(/\s+/)[0] || "";
    const m = t.match(/\{nome(_completo)?\}/);
    if (!m) return `<b class="tp-nome">${h(t)}</b>`;
    const antes = t.slice(0, m.index).trim(), depois = t.slice(m.index + m[0].length);
    const nomeTxt = (m[1] ? completo : primeiro) + depois.replace(/\{nome_completo\}/g, completo).replace(/\{nome\}/g, primeiro);
    return `${antes ? `<span class="tp-saud">${h(antes)}</span>` : ""}<b class="tp-nome">${h(nomeTxt.trim())}</b>`;
  }
  /** Estilo (cor e fonte) do título e do subtítulo da marca, escolhidos no painel. */
  const estiloMarca = (cor, fonte) => { if (fonte) carregarFonte(fonte); const r = []; if (/^#[0-9a-f]{6}$/i.test(cor || "")) r.push("color:" + cor); if (fonte && /^[A-Za-z ]{2,40}$/.test(fonte)) r.push(`font-family:'${fonte}', Georgia, serif`); return r.length ? ` style="${r.join(";")}"` : ""; };
  const marcaTopo = () => { const m = (D && D.inicio && D.inicio.marca) || {}; if (m.logo) return `<img class="marca-logo" src="${h(m.logo)}" alt="${h(m.titulo || "")}" />`; return APAR && APAR.logo ? `<img class="marca-logo" src="${h(api.urlDaCapa(APAR.logo) || "")}" alt="${h(m.titulo || "")}" />` : (() => { const e = ((D && D.inicio && D.inicio.topo) || {}).estilo || {}; return `${m.titulo ? `<b${estiloMarca(e.tituloCor, e.tituloFonte)}>${h(m.titulo)}</b>` : ""}${m.sub ? `<span${estiloMarca(e.subCor, e.subFonte)}>${h(m.sub)}</span>` : ""}`; })(); };
  /*
   * Início da versão geral (0103), no desenho "AION — Tela Inicial": topo com a
   * aluna e a marca, um carrossel de destaques, atalhos para as categorias e uma
   * fileira de cards por categoria (cursos, e-books, frequências…), cada um com
   * o selo do tipo ou "Bloqueado". Tudo vem do banco: o que está liberado para
   * ela abre; o resto aparece trancado e não abre.
   */
  const IG = {
    busca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.2"/><path d="M15.8 15.8L20.5 20.5"/></svg>',
    sino: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.4 10.2a5.6 5.6 0 0111.2 0c0 4 1.4 5.4 1.4 5.4H5c0-.001 1.4-1.4 1.4-5.4z"/><path d="M10.2 18.4a2 2 0 003.6 0"/></svg>',
    seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12h14"/><path d="M13 6.5l5.5 5.5L13 17.5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.4v13.2L19 12z"/></svg>',
    cad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.6" width="14" height="9.4" rx="2.3"/><path d="M8.4 10.6V8a3.6 3.6 0 017.2 0v2.6"/></svg>',
    tudo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.6C10.4 5.4 7.9 4.8 4 4.8v13c3.9 0 6.4.6 8 1.8 1.6-1.2 4.1-1.8 8-1.8v-13c-3.9 0-6.4.6-8 1.8z"/><path d="M12 6.6v13"/></svg>',
  };
  /** O selo, a linha de baixo e a cor de cada card, pelo tipo do curso. */
  function seloIg(c, curso) {
    if (!cursoLiberado(curso)) return { selo: "Bloqueado", sub: "Liberação pela administração", cls: "ig-tr" };
    if (ehEbook(curso)) return { selo: "E-book", sub: "Leitura completa", cls: "ig-ouro" };
    const n = curso.itens.length, t = tipoDoCurso(c, curso);
    if (n && curso.itens.every((x) => x.tipoMidia === "pdf")) return { selo: "E-books", sub: p(n, "e-book", "e-books"), cls: "ig-ouro" };
    if (t === "freq") return { selo: "Playlist", sub: p(n, "faixa", "faixas"), cls: "ig-azul" };
    if (t === "mestres" || t === "video") return { selo: "Vídeos", sub: p(n, "vídeo", "vídeos"), cls: "ig-ouro" };
    return { selo: "Curso", sub: p(n, "aula", "aulas"), cls: "ig-ouro" };
  }
  function cardIg(x) {
    const { c, ci, i, curso } = x, key = ci + "-" + i, sl = seloIg(c, curso), livre = sl.cls !== "ig-tr";
    const acao = livre && ehEbook(curso) ? `data-a="ebook" data-v="${key}"` : `data-a="curso-pres" data-v="${key}"`;
    return `<button class="ig-card ${sl.cls}" ${acao} aria-label="${h(curso.nome)}${livre ? "" : " (bloqueado)"}"${est(estCat(curso), "card", "card")}>
        ${curso.capa ? `<span class="ig-card-img">${img(curso.capa, "")}</span>` : ""}<span class="ig-card-veu" aria-hidden="true"></span>
        <span class="ig-card-in"><span class="ig-selo">${h(sl.selo)}</span><span class="ig-card-tit">${h(curso.nome)}</span>
          <span class="ig-card-pe"><span>${h(sl.sub)}</span><i aria-hidden="true">${livre ? IG.play : IG.cad}</i></span></span>
      </button>`;
  }
  /** Os slides do carrossel: os destaques do Início (painel); sem destaques, os cursos liberados. */
  function slidesIg() {
    const ds = (D && D.inicio && D.inicio.destaques) || [];
    if (ds.length) return ds.slice(0, 8).map((d) => {
      const ci = d.destino === "categoria" && d.categoriaId ? CATS().findIndex((c) => c.id === d.categoriaId) : -1;
      const alvo = d.destino === "presentes" ? `data-a="ir" data-v="presentes"` : ci >= 0 ? `data-a="categoria" data-v="${ci}"` : `data-a="ir-cat" data-v="${h(d.categoriaNome || d.rotulo)}"`;
      return { rot: d.rotulo || "Destaque", tit: d.titulo, desc: d.descricao, bt: d.botao || "Acessar agora", img: fotoOuSite(d.imagem), alvo };
    });
    return PRESENTES().filter((x) => cursoLiberado(x.curso)).slice(0, 5).map((x) => ({ rot: "Destaque", tit: x.curso.nome, desc: x.curso.descricao, bt: "Acessar agora", img: x.curso.capa,
      alvo: ehEbook(x.curso) ? `data-a="ebook" data-v="${x.ci}-${x.i}"` : `data-a="curso-pres" data-v="${x.ci}-${x.i}"` }));
  }
  /** Card de um conteúdo (aula, áudio, e-book) dentro da fileira da categoria. */
  function itemIg(x, t, j) {
    const { c, ci, i, curso } = x, livre = cursoLiberado(curso) && aulaAdmin(t.id), freq = tipoDoCurso(c, curso) === "freq";
    const sl = !livre ? { selo: "Bloqueado", sub: "Liberação pela administração", cls: "ig-tr" }
      : t.tipoMidia === "pdf" ? { selo: "E-book", sub: "Leitura completa", cls: "ig-ouro" }
      : freq ? { selo: "Áudio", sub: feitaId(t.id) ? "Ouvido" : "Ouvir", cls: "ig-azul" }
      : { selo: "Vídeo", sub: feitaId(t.id) ? "Assistido" : "Assistir", cls: "ig-ouro" };
    return `<button class="ig-card ${sl.cls}" data-a="presente" data-v="${ci}-${i}-${j}" aria-label="${h(t.titulo)}${livre ? "" : " (bloqueado)"}"${est(estCat(curso), "card", "card")}>
        ${t.capa || curso.capa ? `<span class="ig-card-img">${img(t.capa || curso.capa, "")}</span>` : ""}<span class="ig-card-veu" aria-hidden="true"></span>
        <span class="ig-card-in"><span class="ig-selo">${h(sl.selo)}</span><span class="ig-card-tit">${h(t.titulo)}</span>
          <span class="ig-card-pe"><span>${h(sl.sub)}</span><i aria-hidden="true">${livre ? IG.play : IG.cad}</i></span></span>
      </button>`;
  }
  function telaInicioGeral() {
    const primeiro = (S.nome || "").trim();
    const m = (D && D.inicio && D.inicio.marca) || {};
    const n = NOTIF(), sinoAviso = !!(n && n.ativo && !S.notifOn && !PREVIA);
    const slides = slidesIg(), lista = PRESENTES();
    // Os liberados para ela primeiro; os trancados depois.
    const filas = lista.filter((x) => cursoLiberado(x.curso)).concat(lista.filter((x) => !cursoLiberado(x.curso)));
    const dois = (k) => String(k).padStart(2, "0");
    return `
    <div class="ig">
      ${slides.length ? `
      <section class="ig-hero" aria-label="Destaques">
        <div class="ig-trilho" data-ig-trilho>${slides.map((sd, k) => `
          <button class="ig-slide" ${sd.alvo} aria-label="${h(sd.tit)}">
            ${sd.img ? `<span class="ig-slide-img">${img(sd.img, "")}</span>` : ""}<span class="ig-slide-veu" aria-hidden="true"></span>
            <span class="ig-slide-in"><span class="ig-rot">${h(sd.rot)}</span><span class="ig-tit">${h(sd.tit)}</span><span class="ig-linha" aria-hidden="true"></span>
              ${sd.desc ? `<span class="ig-desc">${h(sd.desc)}</span>` : ""}<span style="flex:1"></span>
              <span class="ig-cta"><span>${h(sd.bt)}</span>${IG.seta}</span></span>
            <span class="ig-cont"><b>${dois(k + 1)}</b> / ${dois(slides.length)}</span>
          </button>`).join("")}</div>
        ${slides.length > 1 ? `<div class="ig-pontos">${slides.map((_, k) => `<button data-a="ig-slide" data-v="${k}" aria-label="Destaque ${k + 1}"${k === 0 ? ' class="on"' : ""}></button>`).join("")}</div>` : ""}
      </section>` : ""}
      ${filas.length > 1 ? `<div class="ig-atalhos">
        <button data-a="ir" data-v="presentes"><i>${IG.tudo}</i><span>Tudo</span></button>
        ${filas.map((x) => `<button ${ehEbook(x.curso) ? `data-a="ebook"` : `data-a="curso-pres"`} data-v="${x.ci}-${x.i}"><i>${icPresente(x.c, x.curso) || IG.tudo}</i><span>${h(x.curso.nome)}</span></button>`).join("")}
      </div>` : ""}
      ${versNo("topo")}${versNo("mensagem")}
      ${filas.map((x) => { const abre = ehEbook(x.curso) ? `data-a="ebook" data-v="${x.ci}-${x.i}"` : `data-a="curso-pres" data-v="${x.ci}-${x.i}"`; return `
      <section class="ig-fila" aria-label="${h(x.curso.nome)}">
        <div class="ig-fila-cab"><div><h2>${h(x.curso.nome)}</h2>${x.curso.descricao ? `<p>${h(x.curso.descricao)}</p>` : ""}</div>
          <button class="ig-ver" ${abre}>Ver todos${IG.seta}</button></div>
        <div class="ig-cards">${x.curso.itens.length ? x.curso.itens.map((t, j) => itemIg(x, t, j)).join("") : cardIg(x)}</div>
      </section>`; }).join("")}
      ${versNo("depois")}
      ${!filas.length ? `<div class="vazio" style="margin:22px 16px">Em breve, conteúdos para você.</div>` : ""}
    </div>`;
  }
  /** Cabeçalho das telas da versão geral (Meus Cursos, Novos). */
  const cabIg = (tit, sub) => `<div class="ig-topo ig-topo-tela"><div class="ig-ola"><b class="ig-tela-tit">${h(tit)}</b>${sub ? `<span>${h(sub)}</span>` : ""}</div></div>`;
  /** Meus Cursos (versão geral): só o que está liberado para ela. */
  function telaMeus() {
    const meus = PRESENTES().filter((x) => cursoLiberado(x.curso));
    return `<div class="ig">${cabIg("Meus Cursos", meus.length ? p(meus.length, "conteúdo liberado", "conteúdos liberados") : "")}
      ${meus.length ? `<div class="ig-grade">${meus.map(cardIg).join("")}</div>` : `<div class="vazio" style="margin:22px 16px">Nenhum conteúdo liberado ainda. Assim que liberar, ele aparece aqui.</div>`}</div>`;
  }
  /** Novos (versão geral): os conteúdos que entraram por último, os mais novos primeiro. */
  function telaNovos() {
    const todos = PRESENTES().flatMap((x) => x.curso.itens.map((t, j) => ({ x, t, j })));
    const novos = todos.filter((o) => o.t.criado).sort((a, b) => b.t.criado.localeCompare(a.t.criado)).slice(0, 30);
    return `<div class="ig">${cabIg("Novos", "Os conteúdos que chegaram por último")}
      ${novos.length ? `<div class="ig-grade">${novos.map((o) => itemIg(o.x, o.t, o.j)).join("")}</div>` : `<div class="vazio" style="margin:22px 16px">Em breve, novidades para você.</div>`}</div>`;
  }
  /** Busca do topo (versão geral): procura nos cursos e nos conteúdos pelo nome. */
  function abrirBuscaIg() {
    folha(`<h2 class="serif" style="margin:0 0 10px">Buscar</h2><input class="ig-busca-in" type="search" placeholder="Nome do curso, e-book ou conteúdo" autocomplete="off" aria-label="Buscar" /><div class="ig-busca-res"></div>`);
    const inp = camada.querySelector(".ig-busca-in"), res = camada.querySelector(".ig-busca-res");
    const norm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const achar = () => {
      const q = norm(inp.value.trim()); if (q.length < 2) { res.innerHTML = ""; return; }
      const out = [];
      MODS().forEach((md, mi) => md.aulas.forEach((au, ai) => { if (norm(au.titulo).includes(q)) out.push(`<button data-a="aula" data-m="${mi}" data-i="${ai}"><b>${h(au.titulo)}</b><em>${h(md.rot)} ${md.num}</em></button>`); }));
      for (const x of PRESENTES()) {
        if (norm(x.curso.nome).includes(q)) out.push(`<button ${ehEbook(x.curso) ? 'data-a="ebook"' : 'data-a="curso-pres"'} data-v="${x.ci}-${x.i}"><b>${h(x.curso.nome)}</b><em>${h(x.c.nome)}</em></button>`);
        x.curso.itens.forEach((t, j) => { if (norm(t.titulo).includes(q)) out.push(`<button data-a="presente" data-v="${x.ci}-${x.i}-${j}"><b>${h(t.titulo)}</b><em>${h(x.curso.nome)}</em></button>`); });
      }
      res.innerHTML = out.slice(0, 30).join("") || `<p class="apoio">Nada encontrado.</p>`;
    };
    inp.addEventListener("input", achar); inp.focus();
  }
  /** Carrossel do Início geral: os pontinhos e o "01 / 05" seguem o deslize; passa sozinho a cada 6 s. */
  let igTimer = 0;
  function ligarCarrossel() {
    clearInterval(igTimer);
    const tr = app.querySelector("[data-ig-trilho]"); if (!tr) return;
    const pts = [...app.querySelectorAll(".ig-pontos button")];
    const atual = () => Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth));
    tr.addEventListener("scroll", () => { const k = atual(); pts.forEach((b, j) => b.classList.toggle("on", j === k)); }, { passive: true });
    if (pts.length > 1 && !PREVIA) igTimer = setInterval(() => { if (!document.body.contains(tr)) { clearInterval(igTimer); return; } const k = (atual() + 1) % pts.length; tr.scrollTo({ left: k * tr.clientWidth, behavior: "smooth" }); }, 6000);
  }
  function telaInicio() {
    if (GERAL) return telaInicioGeral();
    // Primeiro acesso: nenhuma aula concluída nem começada (o progresso vem do banco).
    // Uma linha de progresso existe quando a aula foi começada (tem data de atualização).
    const primeiraVez = !D || ![...D.prog.values()].some((l) => l.concluida || (l.posicaoSegundos || 0) > 0 || !!l.atualizadaEm);
    const c = continuar();
    const primeiro = (S.nome || "").split(" ")[0];
    let heroi = "";
    if (c) {
      const md = MODS()[c.m], ps = posicao(c.m, c.a);
      const lc = D.prog.get(md.aulas[c.a].id); const comecou = !!(lc && !lc.concluida && (lc.atualizadaEm || (lc.posicaoSegundos || 0) > 0));
      heroi = `
      <section class="heroi" aria-labelledby="h-cont">
        <button class="capa" data-a="aula" data-m="${c.m}" data-i="${c.a}" data-tocar="1" style="border:0;padding:0;width:100%" aria-label="Continuar assistindo a aula">${img(md.aulas[c.a].capa, "")}<span class="play-capa"></span></button>
        <div class="corpo">
          <p class="onde-parou onde-parou-ini">${h(md.rot)} ${md.num} · ${h(lA(md, c.a))}</p>
          <h2 class="serif" id="h-cont">${h(md.aulas[c.a].titulo)}</h2>
          ${comecou ? `<div class="barra"><i style="width:${ps * 100}%"></i></div><p class="apoio">Em andamento</p>` : ""}
          <button class="botao largo" data-a="aula" data-m="${c.m}" data-i="${c.a}" data-tocar="1"><span class="ic-play"></span>Continuar assistindo</button>
        </div>
      </section>`;
    } else { heroi = `<div class="vazio" style="margin-top:22px">Você terminou todas as aulas liberadas. A próxima será liberada em breve.</div>`; }
    const cardsExtra = cartoesDestaque();
    const jr = (D && D.jornada) || {};
    const cabMentoria = `
          <div class="mt-cab">
            ${jr.rotulo ? `<p class="mt-rot">${h(jr.rotulo)}</p>` : ""}
            ${jr.nome ? `<h2 class="mt-tit serif">${h(jr.nome)}</h2>` : ""}
          </div>`;
    if (primeiraVez && MODS().length) {
      const m0 = MODS()[0];
      return `
      <div class="pa">
        <section class="pa-ola${estiloOla()}">
          ${versNo("topo")}
          ${saudacaoIni(primeiro) ? `<h1 class="pa-nome serif">${saudacaoIni(primeiro)}</h1>` : ""}
          ${versNo("mensagem")}
        </section>
        ${bannerInicio()}
        <section class="mt-bloco" aria-labelledby="h-comece">
          ${cabMentoria}
          ${comeceTxt() ? `<p class="pa-rot mt-passo" id="h-comece">${h(comeceTxt())}</p>` : ""}
          <section class="ex-card ex-banner mh-card" aria-labelledby="h-m0">
            <button class="ex-img ex-img-banner" data-a="modulo" data-m="0" aria-label="Abrir o ${h(m0.rot)} ${m0.num}">${img(m0.capaH, m0.rot + " " + m0.num + " — " + titulo(m0.titulo))}</button>
            <div class="ex-info">
              <p class="ex-rot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>${h(m0.rot)} ${m0.num}</p>
              <h2 class="serif" id="h-m0">${h(titulo(m0.titulo))}</h2>
              <p class="ex-desc">${h(m0.intro)}</p>
              <button class="ex-botao" data-a="modulo" data-m="0">Ver aulas</button>
            </div>
          </section>
        </section>
        ${versNo("depois")}
        ${divisorIni()}
        ${cardsExtra}
      </div>`;
    }
    return `
    <div class="pa">
      <section class="pa-ola${estiloOla()}">
        ${versNo("topo")}
        ${saudacaoIni(primeiro) ? `<h1 class="pa-nome serif">${saudacaoIni(primeiro)}</h1>` : ""}
        ${D && D.inicio && D.inicio.fraseRetorno ? `<p class="pa-intro">${h(D.inicio.fraseRetorno)}</p>` : ""}
        ${versNo("mensagem")}
      </section>
      ${bannerInicio()}
      <section class="mt-bloco" aria-labelledby="h-cont-rot">
        ${cabMentoria}
        <p class="pa-rot mt-passo" id="h-cont-rot">Continue de onde parou</p>
        ${heroi}
      </section>
      ${versNo("depois")}
      ${divisorIni()}
      ${cardsExtra}
    </div>`;
  }

  /** A divisória "Também para você" (Configurações → Início). */
  function divisorIni() {
    const d = (D && D.inicio && D.inicio.divisor) || { exibir: true, texto: "Também para você", cor: "", linha: "" };
    if (!d.exibir) return "";
    const ok = (c) => /^#[0-9a-f]{6}$/i.test(c || "");
    const st = (ok(d.linha) ? `--mt-linha:${d.linha}8c;` : "") + (ok(d.cor) ? `--mt-cor:${d.cor};` : "");
    const fo = d.fonte && /^[A-Za-z ]{2,40}$/.test(d.fonte) ? d.fonte : ""; if (fo) carregarFonte(fo);
    return `<div class="mt-divisor" role="separator"${st ? ` style="${st}"` : ""}><span${fo ? ` style="font-family:'${fo}', Georgia, serif"` : ""}>${h(d.texto || "Também para você")}</span></div>`;
  }
  /** Como o painel configurou as telas (Configurações → Módulos e Presentes). */
  const TELAS = () => (D && D.inicio && D.inicio.telas) || {};
  function telaModulos() {
    const t = TELAS();
    return `
    <div class="pagina">
      ${(t.modTitulo ?? "Todos os módulos") ? `<h1 class="todos-mod serif tit-${h(t.modTitEstilo || "padrao")}">${h(t.modTitulo ?? "Todos os módulos")}</h1>` : ""}
      <div class="grade-mod gm-modulos gm-${h(t.modLayout || "padrao")} gm-${h(t.modTamanho || "medio")}${t.modFormato === "cima" ? " gm-cima" : ""}${t.modProgresso === false ? " sem-prog" : ""}">${MODS().map((_, m) => linhaModulo(m)).join("") || `<div class="vazio">Os módulos aparecem aqui assim que forem liberados.</div>`}</div>
    </div>`;
  }

  function telaModulo() {
    const m = S.mod, md = MODS()[m];
    if (!md) { S.tela = "modulos"; return telaModulos(); }
    const n = feitasMod(m), t = md.aulas.length;
    const c = md.aulas.findIndex((_, a) => !feita(m, a));
    const pct = t ? Math.round((n / t) * 100) : 0;
    const COR = md.cor, E = estMod(md);
    const cardAula = (a) => {
      const e = estadoAula(m, a), ps = posicao(m, a), feitaA = feita(m, a);
      return `
        <button class="la-item${e.fech ? " fechada" : ""}${a === c ? " atual" : ""}"${est(E, "aulas", "card")} data-a="aula" data-m="${m}" data-i="${a}">
          <span class="la-capa">${img(md.aulas[a].capa, "")}<span class="la-ic">${e.fech ? '<span class="cadeado"></span>' : feitaA ? "✓" : ""}</span>${ps > 0 && !feitaA ? `<span class="mp-visto"><i style="width:${ps * 100}%"></i></span>` : ""}</span>
          <span class="la-info"><b>${h(md.rot)} ${md.num} · ${h(lA(md, a))}</b><span>${h(md.aulas[a].titulo)}</span>${e.fech ? `<span class="aviso-lib">${ICONES.cadeado}${h(e.txt)}</span>` : `<em>${feitaA ? "Concluída" : "Disponível"}</em>`}</span>
          ${e.fech ? "" : `<span class="la-assistir" aria-hidden="true">${ICONES.play}Assistir</span>`}
        </button>`;
    };
    const proxFech = m < MODS().length - 1 && !liberado(m + 1);
    return `
    ${cabMp(`data-a="voltar-mod"`, NOME_ORIGEM[S.origemMod] || "Início")}
    <div class="mp mv" style="--mc:${COR}">
      <section class="mv-topo" aria-labelledby="h-mod">
        <span class="mv-capa-mod"${est(E, "capa", "capa")}>${img(md.capa, md.rot + " " + md.num + " — " + titulo(md.titulo))}</span>
        <div class="mv-txt">
          <p class="mv-rot">${h(md.rot)} ${md.num}<span aria-hidden="true"></span></p>
          <h1 class="serif mv-tit" id="h-mod">${h(md.titulo)}</h1>
          <span class="mv-linha" aria-hidden="true"></span>
          <p class="mv-desc">${h(md.intro)}</p>
        </div>
      </section>
      <div class="mv-ind"${md.vivo ? "" : ' style="grid-template-columns:1fr"'}>
        <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5.5c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/></svg><span><b>${p(t, "aula", "aulas")}</b><em>neste módulo</em></span></div>
        ${md.vivo ? `<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/></svg><span><b>1 aula ao vivo</b><em>${h(dataVivo(md.vivo))}</em></span></div>` : ""}
      </div>
      <section class="mv-prog" aria-label="Progresso do módulo">
        <div class="mv-prog-topo"><span>Progresso do módulo</span><b>${pct}%</b></div>
        <div class="barra"><i style="width:${pct}%"></i></div>
        <p>${n} de ${p(t, "aula concluída", "aulas concluídas")}</p>
      </section>
      ${!liberado(m) ? `<div class="mp-fechado"><span class="cadeado"></span>${h(avisoModFechado(m))}</div>` : ""}
      <section class="mv-aulas" aria-labelledby="h-aulas">
        <div class="mv-aulas-topo"><h2 id="h-aulas">Aulas do módulo</h2><span>${p(t, "aula", "aulas")}</span></div>
        <div class="mv-lista">${t ? md.aulas.map((_, a) => cardAula(a)).join("") : `<div class="vazio">Aula será adicionada em breve.</div>`}</div>
      </section>
      <div class="mv-entre">
        <button data-a="modulo" data-m="${m - 1}" ${m === 0 ? "disabled" : ""}>${ICONES.chev_esq}Módulo anterior</button>
        <button data-a="modulo" data-m="${m + 1}" ${m === MODS().length - 1 ? "disabled" : ""}${proxFech ? ' class="tranc"' : ""}>${proxFech ? ICONES.cadeado : ""}Próximo módulo${ICONES.chev_dir}</button>
      </div>
    </div>`;
  }

  /* ---------- o player (vídeo de verdade, nos controles da maquete) ---------- */
  let VID = null; // o <video> da aula aberta; sobrevive aos redesenhos
  let VID_ID = null; // de qual aula ele é
  let hlsAtual = null;
  let ultimaGravacao = 0;
  let renovou = false;
  function pararVideo() {
    if (VID) { try { gravarPosicao(true); VID.pause(); } catch { /* */ } }
    if (hlsAtual) { try { hlsAtual.destroy(); } catch { /* */ } hlsAtual = null; }
    VID = null; VID_ID = null; S.tocando = false;
  }
  const parar = () => { if (VID) VID.pause(); S.tocando = false; };
  function gravarPosicao(agoraJa) {
    if (!VID || !VID_ID || !Number.isFinite(VID.duration)) return;
    const t = VID.currentTime;
    if (!agoraJa && Math.abs(t - ultimaGravacao) < 15) return;
    ultimaGravacao = t;
    const l = D.prog.get(VID_ID); if (l) { l.posicaoSegundos = t; l.duracaoSegundos = l.duracaoSegundos || VID.duration; l.atualizadaEm = new Date().toISOString(); }
    void api.salvarPosicao(VID_ID, t).catch(() => {});
  }
  async function pedirVideo(aulaId) {
    if (S.videos[aulaId] !== undefined) return S.videos[aulaId];
    // Aula em áudio ou PDF (0067): o arquivo sai do depósito fechado, com link assinado.
    const md = MIDIA.get(aulaId);
    // Opção do e-book em vídeo: o banco confere o acesso pelo conteúdo.
    if (md && md.conteudo && md.tipo === "video") {
      try { const v = await api.videoDoConteudo(aulaId); S.videos[aulaId] = v && v.ref ? v.ref : ""; } catch { S.videos[aulaId] = null; }
      return S.videos[aulaId];
    }
    if (md && md.tipo !== "video") {
      if (!md.arquivo) S.videos[aulaId] = "";
      else if (md.tipo === "audio") { const u = await api.enderecoDoArquivo("audios", md.arquivo, 14400).catch(() => null); S.videos[aulaId] = u ? "audio:" + u : null; }
      else S.videos[aulaId] = "pdf:" + md.arquivo;
      return S.videos[aulaId];
    }
    try { const v = await api.videoDaAula(aulaId); S.videos[aulaId] = v && v.ref ? v.ref : ""; }
    catch { S.videos[aulaId] = null; }
    return S.videos[aulaId];
  }
  // `comecar`: já baixa o vídeo. Sem ele, só o índice (o manifesto) — a
  // aula aberta fica pronta para tocar no toque, sem gastar dados à toa.
  let hlsEsperando = false;
  const inicioDe = (aulaId) => { const l = D.prog.get(aulaId); const ini = l && !l.concluida ? l.posicaoSegundos || 0 : 0; const dur = l && l.duracaoSegundos; return ini > 0 && (!dur || ini < dur - 15) ? ini : 0; };
  function ligarFonte(ref, comecar) {
    const url = `https://videodelivery.net/${ref}/manifest/video.m3u8`;
    const v = VID, id = VID_ID;
    if (v.canPlayType("application/vnd.apple.mpegurl")) { v.preload = comecar ? "auto" : "metadata"; v.src = url; return; }
    hlsEsperando = !comecar;
    void import("hls.js").then(({ default: Hls }) => {
      if (VID !== v) return;
      if (!Hls.isSupported()) { v.src = url; return; }
      const hls = new Hls({ enableWorker: true, autoStartLoad: false, startFragPrefetch: true, maxBufferLength: 20 }); hlsAtual = hls;
      hls.on(Hls.Events.ERROR, (_e, dados) => { if (dados.fatal) void renovarVideo(); });
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!hlsEsperando && hlsAtual === hls) hls.startLoad(inicioDe(id) || -1); });
      hls.loadSource(url); hls.attachMedia(v);
    });
  }
  function comecarCarga() {
    if (!hlsEsperando) return; hlsEsperando = false;
    if (hlsAtual && hlsAtual.levels && hlsAtual.levels.length) hlsAtual.startLoad(VID && VID.currentTime ? VID.currentTime : inicioDe(VID_ID) || -1);
  }
  async function renovarVideo() {
    if (renovou || !VID_ID) { aviso("Não conseguimos carregar este vídeo agora. Tente de novo."); return; }
    renovou = true; const id = VID_ID; const t = VID ? VID.currentTime : 0;
    delete S.videos[id]; const ref = await pedirVideo(id);
    if (!ref || !VID) return;
    if (hlsAtual) { try { hlsAtual.destroy(); } catch { /* */ } hlsAtual = null; }
    ligarFonte(ref, true); VID.addEventListener("loadedmetadata", () => { VID.currentTime = t; void VID.play().catch(() => {}); }, { once: true });
  }
  async function tocar(aulaId) {
    // Já preparado ao abrir a aula: toca na hora, dentro do toque.
    if (VID && VID_ID === aulaId) { comecarCarga(); S.tocando = true; atualizarControles(); await VID.play().catch(() => { S.tocando = false; atualizarControles(); }); return; }
    const ref = await pedirVideo(aulaId);
    if (!ref) { render(); if (ref === null) aviso("Não conseguimos carregar este vídeo agora. Tente de novo."); return; }
    if (String(ref).startsWith("pdf:")) { void lerPdfAula(aulaId); return; }
    criarVideo(aulaId, ref, true);
    S.tocando = true;
    render();
    void VID.play().catch(() => { S.tocando = false; atualizarControles(); });
  }
  // Ao abrir a aula: o vídeo nasce parado, com o índice carregado.
  function prepararVideo(aulaId, ref) {
    if (!ref || String(ref).startsWith("pdf:") || (VID && VID_ID === aulaId)) return;
    criarVideo(aulaId, ref, false);
    encaixarVideo();
  }
  function criarVideo(aulaId, ref, comecar) {
    pararVideo();
    renovou = false;
    const ehAudio = String(ref).startsWith("audio:");
    VID = document.createElement(ehAudio ? "audio" : "video"); VID_ID = aulaId;
    VID.setAttribute("playsinline", ""); VID.className = "aula-video";
    // Áudio: a capa fica parada na tela; o tocador não aparece.
    VID.style.cssText = ehAudio ? "display:none" : "position:absolute;inset:0;width:100%;height:100%;background:#000;z-index:1";
    VID.playbackRate = VELS[S.velocidade] || 1;
    VID.muted = !!S.mudo;
    // Preparado e ainda parado, fica escondido: a capa da aula aparece por baixo.
    if (!comecar) VID.style.visibility = "hidden";
    const l = D.prog.get(aulaId);
    VID.addEventListener("loadedmetadata", () => {
      if (l && !l.duracaoSegundos && Number.isFinite(VID.duration)) { l.duracaoSegundos = VID.duration; void api.registrarDuracao(aulaId, VID.duration).catch(() => {}); }
      const ini = inicioDe(aulaId);
      if (ini > 0 && ini < VID.duration - 15 && VID.currentTime < 1) VID.currentTime = ini;
      VID.playbackRate = VELS[S.velocidade] || 1;
    }, { once: true });
    VID.addEventListener("play", () => { VID.style.visibility = ""; S.tocando = true; atualizarControles(); });
    VID.addEventListener("pause", () => { S.tocando = false; gravarPosicao(true); atualizarControles(); });
    VID.addEventListener("timeupdate", () => { gravarPosicao(false); atualizarControles(); });
    VID.addEventListener("ended", () => {
      S.tocando = false;
      // Terminou o vídeo: a aula fica concluída sozinha. Primeiro a posição
      // final chega ao banco, que só aceita a conclusão de quem chegou ao fim.
      const fimEm = Number.isFinite(VID.duration) ? VID.duration : VID.currentTime;
      const lx = D.prog.get(aulaId); if (lx) { lx.concluida = true; lx.posicaoSegundos = fimEm; }
      ultimaGravacao = fimEm;
      ultimaConclusao = api.salvarPosicao(aulaId, fimEm).then(() => api.marcarConcluida(aulaId, true)).catch(() => {});
      const k = chaveAtual(); S.fim[k] = 1; render();
    });
    VID.addEventListener("error", () => void renovarVideo());
    if (ehAudio) { VID.preload = comecar ? "auto" : "metadata"; VID.src = String(ref).slice(6); hlsEsperando = false; }
    else ligarFonte(ref, comecar);
  }
  const VELS = { "0,5x": 0.5, "0,75x": 0.75, Normal: 1, "1,25x": 1.25, "1,5x": 1.5, "1,75x": 1.75, "2x": 2 };
  // A conclusão gravada no banco antes de pedir o vídeo seguinte (o banco libera em sequência).
  let ultimaConclusao = Promise.resolve();
  const chaveAtual = () => (S.tela === "opcao" ? "o-" + (S.opcaoAberta && S.opcaoAberta.id) : S.tela === "presente" ? "p-" + S.presente : S.mod + "-" + S.aula);
  function encaixarVideo() {
    if (!VID) return;
    const slot = app.querySelector(".player[data-aula]");
    if (!slot || slot.dataset.aula !== VID_ID) { const vai = VID; pararVideo(); vai.remove(); return; }
    if (VID.parentNode !== slot) slot.appendChild(VID);
    atualizarControles();
  }
  function atualizarControles() {
    const pl = app.querySelector(".player[data-aula]"); if (!pl || !VID) return;
    const d = Number.isFinite(VID.duration) ? VID.duration : 0, t = VID.currentTime || 0, f = d ? t / d : 0;
    const tr = pl.querySelector(".trilha i"), bo = pl.querySelector(".trilha b"), tx = pl.querySelector(".tempo-txt");
    if (tr) tr.style.width = f * 100 + "%"; if (bo) bo.style.left = f * 100 + "%";
    if (tx) tx.textContent = mmss(t) + " / " + mmss(d);
    const pb = pl.querySelector('.ctrl-linha [data-a="tocar"]'); if (pb) { pb.innerHTML = VID.paused ? ICONES.play : ICONES.pausa; pb.setAttribute("aria-label", VID.paused ? "Assistir" : "Pausar"); }
    const pc = pl.querySelector(".play-centro"); if (pc) pc.style.display = VID.paused && !S.fim[chaveAtual()] ? "" : "none";
    const ctr = pl.querySelector(".controles"); if (ctr) ctr.style.zIndex = "3";
  }
  function playerHtml(aulaId, capa, livre, o) {
    o = o || {};
    const ref = S.videos[aulaId];
    const k = chaveAtual(), fimAqui = !!S.fim[k];
    const l = D.prog.get(aulaId), dur = l && l.duracaoSegundos ? l.duracaoSegundos : 0, ps = l && dur ? (l.posicaoSegundos || 0) / dur : 0;
    if (!livre) return `<div class="player" data-aula="${aulaId}">${img(capa, "")}<span class="veu"></span></div>`;
    if (ref && String(ref).startsWith("pdf:")) return `<div class="player" data-aula="${aulaId}">${img(capa, "")}<span class="veu"></span><div class="fim-sobre" role="status"><span class="fim-ic">${ICONES.livro || ICONES.play}</span><p class="fim-rot">${h(o.titulo || "E-book")}</p><button class="fim-botao" data-a="ler-pdf-aula">Ler o e-book</button></div></div>`;
    const ehAudio = ref && String(ref).startsWith("audio:");
    if (ref === "") return `<div class="player" data-aula="${aulaId}">${img(capa, "")}<span class="veu"></span><div class="fim-sobre" role="status"><span class="fim-ic">${ICONES.play}</span><p class="fim-rot">${h(o.emBreve || "Aula será adicionada em breve")}</p></div></div>`;
    return `
          <div class="player" data-aula="${aulaId}">
            ${img(capa, "")}<span class="veu"></span>
            ${fimAqui ? "" : `<button class="play-centro" data-a="tocar" aria-label="${ps > 0 && !(l && l.concluida) ? "Continuar de " + mmss(ps * dur) : h((o.tocar || "Assistir") + " " + (o.titulo || ""))}" style="z-index:2"></button>`}
            ${S.mudo ? `<button class="selo-mudo" data-a="volume" style="z-index:3" aria-label="Vídeo sem som. Tocar para ligar o som">${ICONES.mudo}Sem som</button>` : ""}
            <div class="controles" style="z-index:3">
              <div class="trilha" data-a="buscar"><i style="width:${ps * 100}%"></i><b style="left:${ps * 100}%"></b></div>
              <div class="ctrl-linha">
                <button data-a="tocar" aria-label="${S.tocando ? "Pausar" : h(o.tocar || "Assistir")}">${S.tocando ? ICONES.pausa : ICONES.play}</button>
                <span class="tempo-txt">${mmss(ps * dur)} / ${mmss(dur)}</span>
                <span style="flex:1"></span>
                <button data-a="volume" aria-pressed="${!!S.mudo}" aria-label="${S.mudo ? "Ligar o som" : "Tirar o som"}">${S.mudo ? ICONES.mudo : ICONES.volume}</button>
                <button data-a="velocidade" aria-label="Velocidade${S.velocidade === "Normal" ? "" : ": " + S.velocidade}">${ICONES.engrenagem}</button>
                ${ehAudio ? "" : `<button data-a="tela-cheia" aria-label="Tela cheia">${ICONES.telaCheia}</button>`}
              </div>
            </div>
            ${fimAqui ? `<div class="fim-sobre" role="status" style="z-index:4">
              <span class="fim-ic">${ICONES.check}</span>
              <p class="fim-rot">${h(o.ultima ? o.fimUltimo : o.fim)}</p>
              ${o.ultima ? "" : `<button class="fim-botao" data-a="seguinte">${h(o.proxBotao)}</button>`}
              <button class="fim-de-novo" data-a="de-novo">${ICONES.refazer}${h(o.deNovo || "Assistir novamente")}</button>
            </div>` : ""}
          </div>`;
  }

  /*
   * Os textos de cada tipo de conteúdo. A tela é uma só (aula da mentoria,
   * frequência, Mestres espirituais, documentário e lançamento); só
   * mudam as palavras.
   */
  const ROT = {
    aula: { ant: "Aula anterior", prox: "Próxima aula", sobre: "Sobre a aula", comentar: "Comentar na aula", lista: "Próximas aulas deste módulo", navAnt: "Módulo anterior", navProx: "Próximo módulo", tocar: "Assistir", item: "a Aula", instr: "Instruções da aula", pdf: "PDF da aula", fim: "Aula concluída", fimUltimo: "Módulo concluído", proxBotao: "Assistir próxima aula", deNovo: "Assistir novamente", emBreve: "Aula será adicionada em breve" },
    freq: { ant: "Frequência anterior", prox: "Próxima frequência", sobre: "Sobre a frequência", comentar: "Comentar na frequência", lista: "Próximas frequências deste curso", navAnt: "Curso anterior", navProx: "Próximo curso", tocar: "Ouvir", item: "a Frequência", instr: "Como ouvir", pdf: "PDF da frequência", fim: "Frequência concluída", fimUltimo: "Curso concluído", proxBotao: "Ouvir próxima frequência", deNovo: "Ouvir novamente", emBreve: "Frequência será adicionada em breve" },
    mestres: { ant: "Vídeo anterior", prox: "Próximo vídeo", sobre: "Sobre o vídeo", comentar: "Comentar no vídeo", lista: "Próximos vídeos deste volume", navAnt: "Volume anterior", navProx: "Próximo volume", tocar: "Assistir", item: "o Vídeo", instr: "Instruções", pdf: "PDF do vídeo", fim: "Vídeo concluído", fimUltimo: "Volume concluído", proxBotao: "Assistir próximo vídeo", deNovo: "Assistir novamente", emBreve: "Vídeo será adicionado em breve" },
    video: { ant: "Vídeo anterior", prox: "Próximo vídeo", sobre: "Sobre o vídeo", comentar: "Comentar no vídeo", lista: "Próximos vídeos", navAnt: "Curso anterior", navProx: "Próximo curso", tocar: "Assistir", item: "o Vídeo", instr: "Instruções", pdf: "PDF do vídeo", fim: "Vídeo concluído", fimUltimo: "Curso concluído", proxBotao: "Assistir próximo vídeo", deNovo: "Assistir novamente", emBreve: "Vídeo será adicionado em breve" },
  };
  const tipoDaCat = (nome) => (/frequ/i.test(nome || "") ? "freq" : /mestre/i.test(nome || "") ? "mestres" : "video");
  // O tipo sai do nome da categoria ou do curso (ex.: curso "Frequências" dentro de Presentes).
  const tipoDoCurso = (c, curso) => tipoDaCat((c ? c.nome : "") + " " + (curso ? curso.nome : ""));
  const pdfDe = (conteudos) => (conteudos || []).find((x) => x.publicado !== false && (x.arquivoPath || x.url) && (x.tipo === "pdf" || /\.pdf($|\?)/i.test(x.arquivoPath || x.url || "")));
  const ICO_FECHAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const paragrafos = (t) => String(t || "").split(/\n\s*\n/).filter((x) => x.trim()).map((par) => `<p>${h(par).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/\n/g, "<br>")}</p>`).join("");

  // Sobre · Instruções · PDF: começam fechados; um aberto por vez.
  function abasConteudo(o) {
    const pdf = o.pdf, extras = o.extras || [];
    const [instrTit, ...instrResto] = String(o.instr || "").trim().split(/\n/);
    return `
            <div class="abas-aula${pdf ? "" : " dois"}" role="group" aria-label="Mais sobre este conteúdo">
              <button data-a="aba-aula" data-v="sobre" aria-expanded="${S.abaAula === "sobre"}">${ICONES.livro}${h(o.rot.sobre)}</button>
              <button data-a="aba-aula" data-v="instr" aria-expanded="${S.abaAula === "instr"}">${ICONES.exercicio}Instruções</button>
              ${pdf ? `<button data-a="aba-aula" data-v="pdf" aria-expanded="${S.abaAula === "pdf"}">${ICONES.resumo}PDF</button>` : ""}
            </div>
            ${S.abaAula === "sobre" ? `
            <div class="sobre-cartao">
              <span class="sobre-ic">${ICONES.livro}</span>
              <div style="flex:1;min-width:0">
                <p class="aula-id sobre-id">${h(o.idTxt)}</p>
                <h1 class="sobre-titulo">${h(o.titulo)}</h1>
                ${o.sobre ? paragrafos(o.sobre) : `<p>${h(o.sobrePadrao || "O texto será adicionado em breve.")}</p>`}
                ${o.aviso ? `<p class="aviso-material">${ICONES.material}<span>${h(o.aviso)}</span></p>` : ""}
                ${extras.length ? `<div class="opcoes" style="margin-top:12px">${extras.map((x) => `<button data-a="extra" data-id="${x.id}">${ICONES.material}${h(x.titulo || "Material")}</button>`).join("")}</div>` : ""}
                <button class="aba-fechar" data-a="aba-fechar" aria-label="Fechar">Fechar${ICO_FECHAR}</button>
              </div>
            </div>` : ""}
            ${S.abaAula === "pdf" && pdf ? `
            <div class="sobre-cartao">
              <div style="flex:1;min-width:0">
                <h3>${h(o.rot.pdf)}</h3>
                <p>O material em PDF, para ler e acompanhar no seu tempo.</p>
                <button class="botao largo" data-a="pdf-ver" data-id="${pdf.id}" style="margin-top:12px">${ICONES.resumo}<span>Abrir ${h(o.rot.pdf)}</span></button>
                <button class="aba-fechar" data-a="aba-fechar" aria-label="Fechar">Fechar${ICO_FECHAR}</button>
              </div>
            </div>` : ""}
            ${S.abaAula === "instr" ? `
            <div class="ex-cartao">
              <div class="ex-topo"><div style="flex:1;min-width:0">
                <p class="rotulo">${h(o.rot.instr)}</p>
                <h3 class="serif">${h(instrTit || "Instruções serão adicionadas em breve.")}</h3>
              </div></div>
              ${instrResto.join("\n").trim() ? `<div class="ex-texto">${paragrafos(instrResto.join("\n"))}</div>` : ""}
              <button class="aba-fechar" data-a="aba-fechar" aria-label="Fechar">Fechar${ICO_FECHAR}</button>
            </div>` : ""}`;
  }

  // Comentários de um conteúdo (aula ou item de presente): cada um no seu.
  function secaoComs(id, rotComentar) {
    const todos = S.coms[id] || [];
    const pend = todos.filter((x) => x.minha && x.pendente && !x.respostaA);
    const raizes = todos.filter((x) => !x.respostaA && !x.pendente);
    const respsDe = (rid) => todos.filter((x) => x.respostaA === rid && !x.pendente);
    const nomeDe = (x) => (x.ehInstrutor ? "Equipe AION" : x.minha ? (S.nome || "").split(" ")[0] || "Você" : x.autoraNome || "Aluna");
    const corC = (x) => (x.minha ? S.corNome : x.autoraCor || corDe(nomeDe(x)));
    const fotoC = (x) => (x.minha ? S.foto : x.autoraFoto || "");
    return `
            <section class="coms" aria-labelledby="h-com">
              <div class="coms-cab">
                <h2 id="h-com">Comentários (${raizes.length + pend.length})</h2>
                <button class="coms-toggle" data-a="coms-toggle" aria-expanded="${!S.comsFechado}" aria-controls="coms-corpo">${S.comsFechado ? "Abrir" : "Fechar"}<span aria-hidden="true">${S.comsFechado ? "⌄" : "⌃"}</span></button>
              </div>
              ${S.comsFechado ? "" : `<div id="coms-corpo">
              <button class="com-abrir" data-a="abrir-comentar">
                ${avCom(S.nome, S.corNome, S.foto)}
                <span class="com-abrir-txt">${ICONES.balao}${h(rotComentar)}</span>
              </button>
              <p class="com-aviso">A equipe lê cada comentário antes de publicar.</p>
              ${pend.map((x) => `<div class="com">${avCom(S.nome, S.corNome, S.foto)}<div class="com-corpo"><div class="com-topo"><b class="com-nome">${h(nomeDe(x))}</b><span class="quando">${h(quandoTxt(x.criadoEm))}</span></div><p>${h(x.texto)}</p></div></div>`).join("")}
              ${(S.comTodos[id] ? raizes : raizes.slice(0, 2)).map((x) => {
                const rs = respsDe(x.id), todas = !!S.respTodas[x.id], vis = todas ? rs : rs.slice(0, 2);
                const nm = nomeDe(x);
                return `<div class="com">
                ${avCom(nm, corC(x), fotoC(x))}
                <div class="com-corpo">
                  <div class="com-topo"><b class="com-nome">${h(nm)}</b><span class="quando">${h(quandoTxt(x.criadoEm))}</span>${x.minha ? "" : `<button class="com-mais" data-a="com-mais" data-id="${x.id}" aria-label="Opções do comentário">${ICONES.mais}</button>`}</div>
                  <p>${h(x.texto)}</p>
                  <div class="com-acoes">
                    <button data-a="com-curtir" data-id="${x.id}" aria-pressed="${!!x.curti}">${ICONES.curtido}<span>${x.curtidas || 0}</span></button>
                    <button data-a="com-responder" data-v="${h(nm)}" data-id="${x.id}">${ICONES.balao}Responder</button>
                  </div>
                  ${vis.length ? `<div class="resps">${vis.map((r) => { const rn = nomeDe(r); return `<div class="resp">${avCom(rn, corC(r), fotoC(r), true)}<div class="com-corpo"><div class="com-topo"><b class="com-nome">${h(rn)}</b><span class="quando">${h(quandoTxt(r.criadoEm))}</span></div><p>${h(r.texto)}</p></div></div>`; }).join("")}
                    ${rs.length > 2 ? `<button class="ver-mais pq" data-a="resp-ver-mais" data-v="${x.id}">${todas ? "Ver menos respostas" : "Ver mais " + (rs.length - 2) + (rs.length - 2 === 1 ? " resposta" : " respostas")}</button>` : ""}</div>` : ""}
                </div>
              </div>`; }).join("")}
              ${raizes.length > 2 ? `<button class="ver-mais" data-a="com-ver-mais" data-v="${id}">${S.comTodos[id] ? "Ver menos comentários" : "Ver mais comentários (" + (raizes.length - 2) + ")"}</button>` : ""}
              </div>`}
            </section>`;
  }

  /*
   * O conteúdo atual (aula da mentoria ou item de presente), num formato só,
   * para a tela, os comentários e os botões de seguir.
   */
  function conteudoAtual() { return conteudoAtualDe({ tela: S.tela, presente: S.presente, mod: S.mod, aula: S.aula }); }
  function conteudoAtualDe(st) {
    if (!st) return null;
    if (st.tela === "presente") {
      const [ci, i, j] = String(st.presente || "").split("-").map(Number);
      const c = CATS()[ci], curso = c && c.cursos[i], t = curso && curso.itens[j];
      if (!t) return null;
      return { tipo: tipoDoCurso(c, curso), id: t.id, titulo: t.titulo, ci, i, j, curso, cat: c, itens: curso.itens };
    }
    const md = MODS()[st.mod], au = md && md.aulas[st.aula];
    if (!au) return null;
    return { tipo: "aula", id: au.id, titulo: au.titulo, m: st.mod, a: st.aula, md };
  }

  function cabConteudo(rotuloVoltar) {
    return `
      <div class="cab-aula">
        <button class="voltar" data-a="voltar-conteudo" aria-label="Voltar para ${h(rotuloVoltar)}">${ICONES.seta_esq}<span class="v-curto">Voltar</span><span class="v-longo">Voltar para ${h(rotuloVoltar)}</span></button>
        <button class="mp-marca" data-a="ir" data-v="inicio" aria-label="Ir para o início">${marcaTopo()}</button>
        <span class="cab-aula-dir"><button class="cab-aula-av${S.foto ? " com-foto" : ""}" data-a="perfil-av" aria-label="Meu perfil" style="--c:${S.corNome}">${avTopo()}</button></span>
      </div>`;
  }
  const NOME_VOLTA = { inicio: "o Início", modulos: "Módulos", modulo: "o módulo", perfil: "o Perfil", jornada: "a sua jornada", presentes: "Presentes", categoria: "a categoria", cursoPres: "o curso" };

  function telaAula() {
    const m = S.mod, a = S.aula, md = MODS()[m];
    if (!md || !md.aulas[a]) { S.tela = "modulos"; return telaModulos(); }
    const au = md.aulas[a], R = ROT.aula;
    const ultimaDoMod = a + 1 >= md.aulas.length;
    const modFimAqui = !!S.modFim[m] && ultimaDoMod && feita(m, a);
    const pm = m + 1 < MODS().length ? m + 1 : null;
    // A próxima aula só abre quando esta foi concluída (o banco confere o mesmo).
    const botaoProx = !feita(m, a)
      ? `<button class="nav-prox trancado" disabled aria-label="Próxima aula, bloqueada até você concluir esta">${ICONES.cadeado}Próxima aula</button>`
      : ultimaDoMod
        ? (!modFimAqui ? `<button class="nav-prox livre" data-a="finalizar-mod">${ICONES.check}Finalizar módulo</button>`
          : pm === null ? `<button class="nav-prox trancado" disabled>Última aula</button>`
          : liberado(pm) ? `<button class="nav-prox livre" data-a="modulo" data-m="${pm}">Próximo módulo${ICONES.chev_dir}</button>`
          : `<button class="nav-prox trancado" disabled>${ICONES.cadeado}${h(msgModFechado(pm))}</button>`)
        : `<button class="nav-prox livre" data-a="seguinte">Próxima aula${ICONES.chev_dir}</button>`;
    const PM = pm === null ? null : MODS()[pm];
    const cardModFim = pm === null ? `
      <section class="mod-fim" aria-labelledby="h-modfim">
        <span class="mod-fim-ic">${ICONES.coroa}</span>
        <p class="fim-rot" id="h-modfim">Você concluiu toda a jornada!</p>
        <p class="mod-fim-txt">Parabéns! Você chegou ao final da mentoria. Continue aplicando e vivendo essa transformação.</p>
        <button class="mod-fim-sec" data-a="voltar-aula-fim">${ICONES.chev_esq}Voltar à aula anterior</button>
      </section>` : `
      <section class="mod-fim" aria-labelledby="h-modfim">
        <span class="mod-fim-ic">${ICONES.trofeu}</span>
        <p class="fim-rot">Módulo concluído</p>
        <h2 id="h-modfim">Você concluiu o ${h(md.rot)} ${md.num}!</h2>
        <p class="mod-fim-txt">Parabéns por mais um passo na sua jornada de transformação.</p>
        <div class="mod-fim-prox">
          <p class="mod-fim-rot">Seu próximo módulo</p>
          <section class="mp-heroi${liberado(pm) ? "" : " trancado"}">
            <span class="capa">${img(PM.capa, PM.rot + " " + PM.num + " — " + titulo(PM.titulo))}</span>
            ${liberado(pm) ? "" : `<span class="mod-fim-cad">${ICONES.cadeado}</span>`}
          </section>
          <div class="mp-heroi-txt">
            <p class="mp-rot">${h(PM.rot)} ${PM.num}</p>
            <h3 class="serif mod-fim-nome">${h(PM.titulo)}</h3>
            <p class="mp-desc">${h(PM.intro)}</p>
          </div>
          <div class="mp-ind">
            <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 5.5c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/></svg><b>${p(PM.aulas.length, "aula", "aulas")}</b><span>neste módulo</span></div>
            ${PM.vivo ? `<div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/></svg><b>1 aula ao vivo</b><span>${h(dataVivo(PM.vivo))}</span></div>` : ""}
          </div>
          ${liberado(pm)
            ? `<button class="fim-botao largo" data-a="modulo" data-m="${pm}">Ver próximo módulo${ICONES.chev_dir}</button>`
            : `<p class="mod-fim-bloq"><b>Indisponível no momento.</b> ${h(avisoModFechado(pm))}</p>`}
          <button class="mod-fim-sec" data-a="voltar-aula-fim">${ICONES.chev_esq}Voltar à aula anterior</button>
        </div>
      </section>`;
    const pdf = pdfDe(au.conteudos);
    const extras = (au.conteudos || []).filter((x) => x.publicado !== false && x !== pdf);
    const prox = md.aulas.slice(a + 1, a + 4);
    const volta = (S.voltaConteudo && S.voltaConteudo.tela) || "modulo";
    return `
    <div class="pagina" style="padding:0">
      ${cabConteudo(NOME_VOLTA[volta] || "o módulo")}
      <div class="aula-col${modFimAqui ? " mod-fim-on" : ""}">
        <div>
          ${playerHtml(au.id, au.capa, true, Object.assign({ titulo: au.titulo, ultima: ultimaDoMod }, R))}
          <div class="pagina">
            ${modFimAqui ? cardModFim : ""}
            <p class="aula-local"><b>${h(md.rot)} ${md.num} · ${h(lA(md, a))}</b></p>
            <div class="dois-botoes">
              <button class="nav-ant" data-a="anterior" ${m === 0 && a === 0 ? "disabled" : ""}>${ICONES.chev_esq}Aula anterior</button>
              ${botaoProx}
            </div>
            ${abasConteudo({ rot: R, idTxt: md.rot + " " + md.num + " · " + lA(md, a), titulo: au.titulo, sobre: au.texto, aviso: md.aviso, instr: au.exercicio, pdf, extras })}
            ${secaoComs(au.id, R.comentar)}
            ${prox.length ? `
            <section class="prox-aulas" aria-labelledby="h-prox">
              <h2 id="h-prox">${R.lista}</h2>
              ${prox.map((x, j) => { const i = a + 1 + j; const ei = estadoAula(m, i), fech = !!ei.fech; return `
              <button class="prox-card${fech ? " fechada" : ""}" data-a="aula" data-m="${m}" data-i="${i}">
                <span class="capa">${img(x.capa, "")}<span class="prox-play">${fech ? '<span class="cadeado"></span>' : ""}</span></span>
                <span class="prox-info"><b>${h(md.rot)} ${md.num} · ${h(lA(md, i))}</b><span>${h(x.titulo)}</span>${fech ? `<span class="aviso-lib">${ICONES.cadeado}${h(ei.txt)}</span>` : `<em>Disponível</em>`}</span>
                ${fech ? "" : `<span class="la-assistir" aria-hidden="true">${ICONES.play}Assistir</span>`}
              </button>`; }).join("")}
            </section>` : ""}
            <div class="mv-entre aula-entre">
              <button data-a="modulo" data-m="${m - 1}" ${m === 0 ? "disabled" : ""}>${ICONES.chev_esq}Módulo anterior</button>
              <button data-a="modulo" data-m="${m + 1}" ${pm === null ? "disabled" : ""}${pm !== null && !liberado(pm) ? ' class="tranc"' : ""}>${pm !== null && !liberado(pm) ? ICONES.cadeado : ""}Próximo módulo${ICONES.chev_dir}</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------- presentes ---------- */
  const DESC_CAT = { "Mestres espirituais": "Coleção de vídeos gravados e escondidos em VHS, que nunca foram ao ar na internet.", "Lançamentos": "As novidades da mentoria, assim que saem.", "Frequências": "Áudios para ouvir e meditar no seu tempo.", "Ebooks": "Leituras para aprofundar a sua jornada.", "Documentários": "Histórias e conteúdos para assistir com calma." };
  const TIPO_CAT = { "Lançamentos": "Vídeo", "Frequências": "Áudio", "Ebooks": "Leitura", "Documentários": "Documentário", "Mestres espirituais": "Vídeo" };
  const CATS = () => (D ? D.cats : []);
  const ehEbook = (curso) => !curso.itens.length && curso.conteudos.some((x) => x.url || x.arquivoPath);
  const cursoLiberado = (curso) => curso.liberadoDireto || curso.itens.some((x) => aulaAdmin(x.id));
  // Categoria ainda sem curso abre vazia ("Em breve…"): não há nada nela para liberar.
  const catAberta = (c) => !c.bloqueada && (!c.cursos.length || c.cursos.some(cursoLiberado));
  const abreCurso = (curso) => { const ds = curso.itens.map((x) => aberturaDe(x.id)).filter(Boolean).sort(); return ds[0] || null; };
  // Os presentes (Mestres espirituais, Documentários, Frequências, E-books…), cada um num cartão.
  const PRESENTES = () => CATS().flatMap((c, ci) => c.cursos.map((curso, i) => ({ c, ci, i, curso })));
  const icPresente = (c, curso) => curso.icone && ICONE_DESTAQUE[curso.icone] ? ICONE_DESTAQUE[curso.icone] : (/descobert/i.test(curso.nome) ? ICONE_DESTAQUE.lupa : /e-?book/i.test(curso.nome) ? ICONE_DESTAQUE.livro : { mestres: ICONE_DESTAQUE.estrela, freq: ICONE_DESTAQUE.som, video: /document/i.test(curso.nome) ? ICONE_DESTAQUE.filme : ICONE_DESTAQUE.video }[tipoDoCurso(c, curso)]);
  const corPresente = (c, curso) => curso.cor && curso.cor in COR_DESTAQUE ? COR_DESTAQUE[curso.cor] : (/descobert/i.test(curso.nome) ? "desc" : /e-?book/i.test(curso.nome) ? "" : { mestres: "mestres", freq: "pres", video: "doc" }[tipoDoCurso(c, curso)]);
  const botaoPresente = (curso) => (/descobert/i.test(curso.nome) ? "Ver as descobertas" : /e-?book/i.test(curso.nome) ? "Ver e-books" : /frequ/i.test(curso.nome) ? "Ver frequências" : /document/i.test(curso.nome) ? "Ver documentários" : "Ver os vídeos");
  function cartaoPresente({ c, ci, i, curso }) {
    const key = ci + "-" + i, E = estCat(curso);
    if (!cursoLiberado(curso)) return `
        <section class="ex-card ex-banner pres-banner-card pres-fech ${corPresente(c, curso)}"${est(E, "card", "card")} aria-labelledby="h-pr-${key}">
          <button class="pres-fech-alvo" data-a="curso-pres" data-v="${key}" aria-label="${h(curso.nome)}. Bloqueado, ainda não liberado.">
            <span class="pres-fech-area" aria-hidden="true">
              <span class="ex-img ex-img-banner cat-fech-fosco"${est(E, "capa", "capa")}>${img(curso.capa, "")}</span>
              <span class="cat-fech-veu"><span class="cat-fech-cad">${ICONES.cadeado}</span><span class="cat-fech-chama">Em breve, só para você</span></span>
            </span>
            <span class="ex-info">
              <span class="ex-rot">${icPresente(c, curso)}${h(curso.nome)}</span>
              <span class="pres-fech-tit serif" id="h-pr-${key}">${h(curso.nome)}</span>
              <span class="ex-desc cat-fech-fosco">${h(curso.descricao)}</span>
              <span class="ex-botao cat-fech-fosco"${est(E, "botao", "botao")}>${h(botaoPresente(curso))}</span>
            </span>
          </button>
        </section>`;
    const acaoP = ehEbook(curso) ? `data-a="ebook" data-v="${key}"` : `data-a="curso-pres" data-v="${key}"`;
    return `
        <section class="ex-card ex-banner pres-banner-card ${corPresente(c, curso)}"${est(E, "card", "card")} aria-labelledby="h-pr-${key}">
          <button class="ex-img ex-img-banner"${est(E, "capa", "capa")} ${acaoP} aria-label="Abrir ${h(curso.nome)}">${img(curso.capa, "")}</button>
          <div class="ex-info">
            <p class="ex-rot">${icPresente(c, curso)}${h(curso.nome)}</p>
            <h2 class="serif" id="h-pr-${key}">${h(curso.nome)}</h2>
            <p class="ex-desc">${h(curso.descricao)}</p>
            <button class="ex-botao"${est(E, "botao", "botao")} ${acaoP}>${h(botaoPresente(curso))}</button>
          </div>
        </section>`;
  }
  /** Botão de categoria em grade ou lista (Configurações → Presentes → Layout dos botões). */
  function botaoCategoria({ c, ci, i, curso }) {
    const key = ci + "-" + i, fech = !cursoLiberado(curso), E = estCat(curso);
    const acao = fech ? `data-a="curso-pres" data-v="${key}"` : ehEbook(curso) ? `data-a="ebook" data-v="${key}"` : `data-a="curso-pres" data-v="${key}"`;
    return `<button class="pb-item ${corPresente(c, curso)}${fech ? " fech" : ""}"${est(E, "botao", "botao")} ${acao} aria-label="${h(curso.nome)}${fech ? ". Bloqueado, ainda não liberado." : ""}">
        <span class="pb-img">${img(curso.capa, "")}</span>
        <span class="pb-nome">${icPresente(c, curso)}<b class="serif">${h(curso.nome)}</b></span>
        ${fech ? `<span class="pb-cad">${ICONES.cadeado}</span>` : `<span class="pb-seta" aria-hidden="true">›</span>`}
      </button>`;
  }
  function telaPresentes() {
    const aba = abaAtual();
    const lista = PRESENTES().filter((x) => !aba || x.c.id === aba.id);
    // A configuração vale para a tela do botão Presentes (o primeiro botão com o ícone de presente).
    const t = TELAS(), ehPres = !aba || aba.icone === "presentes";
    const layout = ehPres ? t.presLayout || "grandes" : "grandes";
    const titulo = ehPres && typeof t.presTitulo === "string" ? t.presTitulo : aba ? aba.titulo : "Presentes";
    if (layout !== "grandes") return `
    <div class="pagina">
      ${titulo ? `<h1 class="todos-mod serif tit-${h(t.presTitEstilo || "padrao")}">${h(titulo)}</h1>` : ""}
      ${lista.length ? `<div class="pb-grade pb-${h(layout)} pb-est-${h(t.presEstilo || "padrao")}">${lista.map(botaoCategoria).join("")}</div>` : `<div class="vazio">${aba && !/presente/i.test(aba.titulo) ? "Em breve, novidades para você." : "Em breve, presentes para você."}</div>`}
    </div>`;
    return `
    <div class="pagina">
      ${titulo ? `<h1 class="todos-mod serif${ehPres ? " tit-" + h(t.presTitEstilo || "padrao") : ""}">${h(titulo)}</h1>` : ""}
      ${lista.length ? `<div class="mods-abas pres-abas" aria-label="Presentes">${lista.map((x) => `<button${est(estCat(x.curso), "botao", "botao")} data-a="curso-pres" data-v="${x.ci}-${x.i}"><span>${h(x.curso.nome)}</span><span class="pres-aba-seta" aria-hidden="true">›</span></button>`).join("")}</div>` : ""}
      <div class="cat-grade${ehPres ? " pg-est-" + h(t.presEstilo || "padrao") : ""}">${lista.map(cartaoPresente).join("") || `<div class="vazio">${aba && !/presente/i.test(aba.titulo) ? "Em breve, novidades para você." : "Em breve, presentes para você."}</div>`}</div>
    </div>`;
  }
  function telaCategoria() {
    const c = S.cat < 0 && S.catVazia ? { nome: S.catVazia, cursos: [] } : CATS()[S.cat];
    if (!c) { S.tela = "presentes"; return telaPresentes(); }
    if (c.id) S.aba = c.id;
    const ci = S.cat;
    return `
    <div class="pagina">
      <div class="barra-aula"><button class="voltar voltar-btn" data-a="ir" data-v="presentes" aria-label="Voltar para Presentes">${ICONES.seta_esq}Voltar</button></div>
      <h1 class="todos-mod serif">${h(c.nome)}</h1>
      <p class="apoio" style="margin-top:-6px">${h(DESC_CAT[c.nome] || "")}</p>
      ${c.cursos.length ? `<div class="grade-mod">${c.cursos.map((x, i) => cartaoCurso(ci, i, x, c.nome)).join("")}</div>` : `<div class="vazio">Em breve, conteúdos nesta categoria.</div>`}
    </div>`;
  }
  function cartaoCurso(ci, i, curso, cat) {
    const COR = CORES_CAT[ci % CORES_CAT.length];
    const key = ci + "-" + i;
    const ebook = ehEbook(curso);
    const freq = cat === "Frequências";
    const tipo = (TIPO_CAT[cat] || "conteúdo").toLowerCase();
    const plural = ebook ? "Leitura" : freq ? p(curso.itens.length, "frequência", "frequências") : curso.itens.length ? p(curso.itens.length, tipo, tipo + "s") : "Será adicionado em breve";
    const meta = `<p class="mc-meta"><span>${ebook ? ICONES.livro : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/></svg>`}${h(plural)}</span></p>`;
    if (!cursoLiberado(curso)) {
      // Igual ao print: imagem embaçada com o cadeado nítido e "Em breve, só para você"; não abre.
      const tp = tipoDoCurso({ nome: cat }, curso);
      const cls = { mestres: "mestres", freq: "pres", video: "doc" }[tp];
      const ic = { mestres: ICONE_DESTAQUE.estrela, freq: ICONE_DESTAQUE.som, video: ICONE_DESTAQUE.video }[tp];
      const chama = "Em breve, só para você";
      return `
    <section class="ex-card ex-banner pres-banner-card pres-fech ${cls}" aria-labelledby="h-cur-${key}">
      <button class="pres-fech-alvo" data-a="curso-pres" data-v="${key}" aria-label="${h(curso.nome)}. Bloqueado, ainda não liberado.">
        <span class="pres-fech-area" aria-hidden="true">
          <span class="ex-img ex-img-banner cat-fech-fosco">${img(curso.capa, "")}</span>
          <span class="cat-fech-veu"><span class="cat-fech-cad">${ICONES.cadeado}</span><span class="cat-fech-chama">${h(chama)}</span></span>
        </span>
        <span class="ex-info">
          <span class="ex-rot">${ic}${h(cat)}</span>
          <span class="pres-fech-tit serif" id="h-cur-${key}">${h(curso.nome)}</span>
          <span class="ex-desc cat-fech-fosco">${h(curso.descricao || "")}</span>
          <span class="ex-botao cat-fech-fosco">${freq ? "Ver frequências" : "Ver os vídeos"}</span>
        </span>
      </button>
    </section>`;
    }
    if (ebook) return `
    <div class="mod-bloco mc" style="--mc:${COR}">
      <div class="mc-top">
        <button class="mc-capa" data-a="ebook" data-v="${key}" aria-label="Abrir ${h(curso.nome)}">${img(curso.capa, "")}</button>
        <div class="mc-info">
          <button class="mc-cab" data-a="ebook" data-v="${key}"><span class="mc-rot">${h(cat)}</span><b class="mc-tit serif">${h(curso.nome)}</b></button>
          ${meta}
          <button class="mc-ver ver-aulas" data-a="ebook" data-v="${key}">Ver ebook<span aria-hidden="true">›</span></button>
        </div>
      </div>
    </div>`;
    // Card do curso (Configurações → Cursos): capa deitada, texto em cima, nome, descrição, progresso e o botão que abre o curso.
    if (curso.itens.length) {
      const T = TELAS(), rot = (typeof T.curRotulo === "string" ? T.curRotulo : "Curso completo").trim(), bt = (typeof T.curBotao === "string" ? T.curBotao : "Ver curso").trim() || "Ver curso";
      const feitos = curso.itens.filter((x) => feitaId(x.id)).length, pct = Math.round((feitos / curso.itens.length) * 100);
      return `
    <article class="cur-card" style="--mc:${COR}">
      <button class="cur-capa" data-a="curso-pres" data-v="${key}" aria-label="Abrir ${h(curso.nome)}">${img(curso.capa, "")}</button>
      <div class="cur-info">
        ${rot ? `<p class="cur-rot"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.3v5.4l4.6-2.7z"/></svg>${h(rot)}</p>` : ""}
        <button class="cur-cab" data-a="curso-pres" data-v="${key}"><b class="cur-tit serif">${h(curso.nome)}</b></button>
        ${curso.descricao ? `<p class="cur-desc">${h(curso.descricao)}</p>` : ""}
        <div class="cur-prog" aria-label="${pct}% concluído"><span><i style="width:${pct}%"></i></span><em>${pct}%</em></div>
        <button class="cur-bt" data-a="curso-pres" data-v="${key}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5V19c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13.5"/></svg><b>${h(bt)}</b><i aria-hidden="true">›</i></button>
      </div>
    </article>`;
    }
    const aberto = !!(S.verCurso || {})[key];
    return `
    <div class="mod-bloco mc" style="--mc:${COR}">
      <div class="mc-top">
        <button class="mc-capa" data-a="curso-pres" data-v="${key}" aria-label="Abrir ${h(curso.nome)}">${img(curso.capa, "")}</button>
        <div class="mc-info">
          <button class="mc-cab" data-a="curso-pres" data-v="${key}"><span class="mc-rot">${h(cat)}</span><b class="mc-tit serif">${h(curso.nome)}</b></button>
          ${meta}
          ${curso.itens.length ? `<button class="ex-botao mc-ver-grande" data-a="ver-curso" data-v="${key}" aria-expanded="${aberto}" aria-controls="lc-${key}">${aberto ? "Esconder" : freq ? "Ver todas" : "Ver os vídeos"}<span aria-hidden="true" style="margin-left:8px">${aberto ? "⌃" : "⌄"}</span></button>` : ""}
        </div>
      </div>
      ${curso.itens.length ? `<div class="lista-aulas-mod${aberto ? " aberto" : ""}" id="lc-${key}"><div class="la-in">${curso.itens.map((t, j) => itemPresente(ci, i, j, curso, t, freq)).join("")}</div></div>` : ""}
    </div>`;
  }
  function itemPresente(ci, i, j, curso, t, freq) {
    const livre = aulaAdmin(t.id);
    // E-book: cartão com a capa em pé, como no modelo ("Ver ebook").
    if (t.tipoMidia === "pdf") return `
        <div class="mod-bloco mc eb-card${livre ? "" : " fechada"}">
          <div class="mc-top">
            <button class="mc-capa" data-a="presente" data-v="${ci}-${i}-${j}" aria-label="Abrir ${h(t.titulo)}">${img(t.capa || curso.capa, "")}${livre ? "" : '<span class="cadeado"></span>'}</button>
            <div class="mc-info">
              <button class="mc-cab" data-a="presente" data-v="${ci}-${i}-${j}"><span class="mc-rot">${h(curso.nome)}</span><b class="mc-tit serif">${h(t.titulo)}</b></button>
              <span class="mc-meta">${ICONES.livro}Leitura</span>
              ${livre ? `<button class="mc-ver ver-aulas" data-a="presente" data-v="${ci}-${i}-${j}">Ver ebook<span aria-hidden="true">›</span></button>` : `<span class="aviso-lib">${ICONES.cadeado}Libera em breve</span>`}
            </div>
          </div>
        </div>`;
    return `
        <button class="la-item${livre ? "" : " fechada"}" data-a="presente" data-v="${ci}-${i}-${j}">
          <span class="la-capa">${img(t.capa || curso.capa, "")}<span class="la-ic">${livre ? (feitaId(t.id) ? "✓" : "") : '<span class="cadeado"></span>'}</span></span>
          <span class="la-info"><b>${h(curso.nome)} · ${j + 1}</b><span>${h(t.titulo)}</span>${livre ? `<em>${feitaId(t.id) ? "Concluído" : "Disponível"}</em>` : `<span class="aviso-lib">${ICONES.cadeado}Libera em breve</span>`}</span>
          ${livre ? `<span class="la-assistir" aria-hidden="true">${ICONES.play}${freq ? "Ouvir" : "Assistir"}</span>` : ""}
        </button>`;
  }
  /* ---------- e-book: capa, resumo e os botões (PDF + opções) ---------- */
  const textoSobre = (hex) => { const n = parseInt(String(hex).slice(1), 16); if (!Number.isFinite(n)) return "#1a1206"; const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? "#1a1206" : "#fff"; };
  const corBotao = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") && c.toLowerCase() !== "#c9a15c" ? ` style="--bt:${c};--bt-txt:${textoSobre(c)}"` : "");
  const clsBotao = (c, mais) => "botao largo eb-ler" + (corBotao(c) ? " eb-cor" : "") + (mais ? " " + mais : "");
  const IC_ORAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v6M9 6h6"/><path d="M6 21V11l6-2 6 2v10"/><path d="M10 21v-5h4v5"/></svg>';
  const icOpcao = (t) => (t === "video" ? ICONES.play : t === "audio" ? ICONES.volume : t === "pdf" ? ICONES.livro : IC_ORAR);
  function blocoEbook(t, capa, livre, txtFech) {
    return `
      <div class="eb-topo">
        <span class="eb-capa">${img(capa, "")}</span>
        <h1 class="eb-tit serif" style="margin-top:18px">${h(t.titulo)}</h1>
        <p class="eb-desc">${h(t.texto || "Um livro da mentoria para ler no seu tempo. Abra quando quiser, no celular ou no computador.")}</p>
        ${livre ? `
        <button class="${clsBotao(t.botaoCor)}"${corBotao(t.botaoCor)} data-a="ler-pdf-aula">${ICONES.livro}${h(t.botao || "Ler ebook completo")}</button>
        ${(t.opcoes || []).map((o) => `<button class="${clsBotao(o.cor, "eb-ler-2")}${o.bloqueado ? " eb-op-bloq" : ""}"${corBotao(o.cor)} data-a="ebook-opcao" data-id="${o.id}">${o.bloqueado ? ICONES.cadeado : icOpcao(o.tipo)}${h(o.titulo || "Abrir")}</button>`).join("")}
        <p class="eb-dica">O ebook abre aqui mesmo, dentro do aplicativo.</p>` : `<p class="eb-dica eb-fech">${ICONES.cadeado}${h(txtFech || "Libera em breve")}</p>`}
      </div>`;
  }
  // A opção aberta (vídeo ou áudio do e-book): procura no item de presente ou na aula da mentoria.
  function opcaoAberta() {
    const o = S.opcaoAberta; if (!o) return null;
    const c = conteudoAtualDe(o.de);
    const item = c && (c.tipo === "aula" ? c.md.aulas[c.a] : c.curso.itens[c.j]);
    const op = item && (item.opcoes || []).find((x) => x.id === o.id);
    return op ? { op, item, c } : null;
  }
  function telaOpcao() {
    const x = opcaoAberta(); if (!x) return `<div class="pagina"><div class="barra-aula"><button class="voltar voltar-btn" data-a="opcao-voltar">${ICONES.seta_esq}Voltar</button></div><div class="vazio">Este conteúdo não está disponível agora.</div></div>`;
    const { op, item, c } = x;
    const R = Object.assign({}, op.tipo === "audio" ? ROT.freq : ROT.mestres, { item: "", sobre: "Sobre", instr: "Instruções", pdf: "PDF", comentar: "" });
    const capa = op.capaPath ? fotoOuSite(op.capaPath) : item.capa || (c.curso && c.curso.capa);
    const pdf = pdfDe(op.extras); const extras = (op.extras || []).filter((y) => y.publicado !== false && y !== pdf);
    return `
    <div class="pagina" style="padding:0">
      <div class="cab-aula">
        <button class="voltar" data-a="opcao-voltar" aria-label="Voltar ao e-book">${ICONES.seta_esq}<span class="v-curto">Voltar</span><span class="v-longo">Voltar ao e-book</span></button>
        <button class="mp-marca" data-a="ir" data-v="inicio" aria-label="Ir para o início">${marcaTopo()}</button>
        <span class="cab-aula-dir"><button class="cab-aula-av${S.foto ? " com-foto" : ""}" data-a="perfil-av" aria-label="Meu perfil" style="--c:${S.corNome}">${avTopo()}</button></span>
      </div>
      <div class="aula-col">
        <div>
          ${playerHtml(op.id, capa, true, Object.assign({ titulo: op.tituloTela || op.titulo, ultima: true }, R))}
          <div class="pagina">
            ${abasConteudo({ rot: R, idTxt: item.titulo, titulo: op.tituloTela || op.titulo, sobre: op.texto, instr: op.instrucoes, pdf, extras, sobrePadrao: "" })}
          </div>
        </div>
      </div>
    </div>`;
  }
  function telaCursoPres() {
    const [ci, i] = String(S.cursoPres || "").split("-").map(Number);
    const c = CATS()[ci], curso = c && c.cursos[i];
    if (!curso) { S.tela = "presentes"; return telaPresentes(); }
    if (c.id) S.aba = c.id;
    const cat = c.nome, COR = CORES_CAT[ci % CORES_CAT.length], freq = cat === "Frequências";
    const soLeitura = curso.itens.length > 0 && curso.itens.every((t) => t.tipoMidia === "pdf");
    const nomeTipo = freq ? ["frequência", "frequências"] : soLeitura ? ["e-book", "e-books"] : ["vídeo", "vídeos"];
    if (!cursoLiberado(curso)) { S.tela = "categoria"; S.cat = ci; return telaCategoria(); }
    const feitos = curso.itens.filter((t) => feitaId(t.id)).length;
    const pct = curso.itens.length ? Math.round((feitos / curso.itens.length) * 100) : 0;
    const totalC = c.cursos.length;
    return `
    ${cabMp(`data-a="categoria" data-v="${ci}"`, cat)}
    <div class="mp mv" style="--mc:${COR}">
      <section class="mv-topo" aria-labelledby="h-cpt">
        <span class="mv-capa-mod">${img(curso.capa, "")}</span>
        <div class="mv-txt">
          <p class="mv-rot">${h(cat)}<span aria-hidden="true"></span></p>
          <h1 class="serif mv-tit" id="h-cpt">${h(curso.nome)}</h1>
          <span class="mv-linha" aria-hidden="true"></span>
          <p class="mv-desc">${h(curso.descricao || DESC_CAT[cat] || "")}</p>
        </div>
      </section>
      <div class="mv-ind">
        <div>${soLeitura ? ICONES.livro : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/></svg>`}<span><b>${p(curso.itens.length, nomeTipo[0], nomeTipo[1])}</b><em>${cat === "Mestres espirituais" ? "neste volume" : "neste curso"}</em></span></div>
        <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg><span><b>Acesso liberado</b><em>${soLeitura ? "leia quando quiser" : "assista quando quiser"}</em></span></div>
      </div>
      <section class="mv-prog" aria-label="Progresso">
        <div class="mv-prog-topo"><span>${cat === "Mestres espirituais" ? "Progresso do volume" : "Progresso do curso"}</span><b>${pct}%</b></div>
        <div class="barra"><i style="width:${pct}%"></i></div>
        <p>${feitos} de ${p(curso.itens.length, nomeTipo[0] + (freq ? " concluída" : " concluído"), nomeTipo[1] + (freq ? " concluídas" : " concluídos"))}</p>
      </section>
      <section class="mv-aulas" aria-labelledby="h-cp">
        <div class="mv-aulas-topo"><h2 id="h-cp">${freq ? "Frequências deste curso" : cat === "Mestres espirituais" ? "Vídeos deste volume" : "Conteúdos deste curso"}</h2><span>${p(curso.itens.length, nomeTipo[0], nomeTipo[1])}</span></div>
        <div class="mv-lista">${curso.itens.map((t, j) => itemPresente(ci, i, j, curso, t, freq)).join("") || `<div class="vazio">Aula será adicionada em breve.</div>`}</div>
      </section>
      <div class="mv-entre">
        <button data-a="curso-pres" data-v="${ci}-${i - 1}" ${i === 0 ? "disabled" : ""}>${ICONES.chev_esq}${cat === "Mestres espirituais" ? "Volume anterior" : "Curso anterior"}</button>
        <button data-a="curso-pres" data-v="${ci}-${i + 1}" ${i + 1 >= totalC ? "disabled" : ""}>${cat === "Mestres espirituais" ? "Próximo volume" : "Próximo curso"}${ICONES.chev_dir}</button>
      </div>
    </div>`;
  }
  function telaEbook(ci, i, curso) {
    return `
    <div class="pagina eb">
      <div class="barra-aula"><button class="voltar voltar-btn" data-a="categoria" data-v="${ci}" aria-label="Voltar">${ICONES.seta_esq}Voltar</button></div>
      <div class="eb-topo">
        <span class="eb-capa">${img(curso.capa, "")}</span>
        <h1 class="eb-tit serif" style="margin-top:18px">${h(curso.nome)}</h1>
        <p class="eb-desc">${h(curso.descricao || "Um livro da mentoria para ler no seu tempo. Abra quando quiser, no celular ou no computador.")}</p>
        <button class="botao largo eb-ler" data-a="abrir-ebook" data-v="${ci}-${i}">${ICONES.livro}Ler ebook completo</button>
        <button class="botao largo eb-ler eb-ler-2" data-a="abrir-oracoes" data-v="${ci}-${i}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v6M9 6h6"/><path d="M6 21V11l6-2 6 2v10"/><path d="M10 21v-5h4v5"/></svg>Ler apenas as orações</button>
        <p class="eb-dica">O ebook abre aqui mesmo, dentro do aplicativo.</p>
      </div>
    </div>`;
  }
  // Estado de um item de presente: liberado pelo banco e, dentro do curso, em sequência.
  function estadoItem(curso, j, R) {
    const t = curso.itens[j];
    if (!aulaAdmin(t.id)) return { fech: true, txt: "Libera em breve" };
    let k = j - 1; while (k >= 0 && curso.itens[k].mod === t.mod && curso.itens[k].bloq) k--;
    if (k >= 0 && curso.itens[k].mod === t.mod && !feitaId(curso.itens[k].id)) return { fech: true, seq: true, txt: "Conclua " + R.item + " " + (k + 1) + " para liberar" };
    return { fech: false, txt: feitaId(t.id) ? "Concluído" : "Disponível" };
  }
  function telaPresente() {
    const pts = String(S.presente || "").split("-").map(Number);
    const [ci, i, j] = pts;
    const c = CATS()[ci], curso = c && c.cursos[i];
    if (!curso) { S.tela = "presentes"; return telaPresentes(); }
    if (pts.length < 3) return telaEbook(ci, i, curso);
    const t = curso.itens[j];
    if (!t) { S.tela = "presentes"; return telaPresentes(); }
    const R = ROT[tipoDoCurso(c, curso)];
    const est = estadoItem(curso, j, R), livre = !est.fech;
    if (t.tipoMidia === "pdf") {
      const voltaE = (S.voltaConteudo && S.voltaConteudo.tela) || "cursoPres";
      return `
    <div class="pagina" style="padding:0">
      ${cabConteudo(voltaE === "cursoPres" ? curso.nome : NOME_VOLTA[voltaE] || curso.nome)}
      <div class="pagina eb">${blocoEbook(t, t.capa || curso.capa, livre, est.txt)}</div>
    </div>`;
    }
    const ultimo = j + 1 >= curso.itens.length;
    const feito = feitaId(t.id);
    const botaoProx = ultimo
      ? `<button class="nav-prox trancado" disabled>Último deste curso</button>`
      : !feito
        ? `<button class="nav-prox trancado" disabled aria-label="${h(R.prox)}, bloqueado até você concluir este">${ICONES.cadeado}${h(R.prox)}</button>`
        : `<button class="nav-prox livre" data-a="seguinte">${h(R.prox)}${ICONES.chev_dir}</button>`;
    const pdf = pdfDe(t.conteudos);
    const extras = (t.conteudos || []).filter((x) => x.publicado !== false && x !== pdf);
    const prox = curso.itens.slice(j + 1, j + 4);
    const cAnt = c.cursos[i - 1], cProx = c.cursos[i + 1];
    const volta = (S.voltaConteudo && S.voltaConteudo.tela) || "cursoPres";
    return `
    <div class="pagina" style="padding:0">
      ${cabConteudo(volta === "cursoPres" ? curso.nome : NOME_VOLTA[volta] || curso.nome)}
      <div class="aula-col">
        <div>
          ${livre ? playerHtml(t.id, t.capa || curso.capa, true, Object.assign({ titulo: t.titulo, ultima: ultimo }, R)) : `<div class="player">${img(t.capa || curso.capa, "")}<span class="veu"></span><div class="fim-sobre" role="status"><span class="fim-ic">${ICONES.cadeado}</span><p class="fim-rot">${h(est.txt)}</p></div></div>`}
          <div class="pagina">
            <div class="dois-botoes">
              <button class="nav-ant" ${j > 0 ? `data-a="presente" data-v="${ci}-${i}-${j - 1}"` : "disabled"}>${ICONES.chev_esq}${h(R.ant)}</button>
              ${botaoProx}
            </div>
            ${abasConteudo({ rot: R, idTxt: curso.nome + " · " + (j + 1) + " de " + curso.itens.length, titulo: t.titulo, sobre: t.texto, instr: t.exercicio, pdf: livre ? pdf : null, extras: livre ? extras : [], sobrePadrao: "Um presente da mentoria para acompanhar a sua jornada, no seu tempo." })}
            ${livre ? secaoComs(t.id, R.comentar) : ""}
            ${prox.length ? `
            <section class="prox-aulas" aria-labelledby="h-prox">
              <h2 id="h-prox">${h(R.lista)}</h2>
              ${prox.map((x, n) => { const jj = j + 1 + n; const e = estadoItem(curso, jj, R); return `
              <button class="prox-card${e.fech ? " fechada" : ""}" data-a="presente" data-v="${ci}-${i}-${jj}">
                <span class="capa">${img(x.capa || curso.capa, "")}<span class="prox-play">${e.fech ? '<span class="cadeado"></span>' : ""}</span></span>
                <span class="prox-info"><b>${h(curso.nome)} · ${jj + 1}</b><span>${h(x.titulo)}</span>${e.fech ? `<span class="aviso-lib">${ICONES.cadeado}${h(e.txt)}</span>` : `<em>${h(e.txt)}</em>`}</span>
                ${e.fech ? "" : `<span class="la-assistir" aria-hidden="true">${ICONES.play}${h(R.tocar)}</span>`}
              </button>`; }).join("")}
            </section>` : ""}
            <div class="mv-entre aula-entre">
              <button ${cAnt ? `data-a="curso-pres" data-v="${ci}-${i - 1}"` : "disabled"}>${ICONES.chev_esq}${h(R.navAnt)}</button>
              <button ${cProx ? `data-a="curso-pres" data-v="${ci}-${i + 1}"` : "disabled"}${cProx && !cursoLiberado(cProx) ? ' class="tranc"' : ""}>${cProx && !cursoLiberado(cProx) ? ICONES.cadeado : ""}${h(R.navProx)}${ICONES.chev_dir}</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  }
  const ZOOMS = [0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];
  function aplicarZoomLeitor(fr) {
    fr = fr || document.querySelector(".leitor-quadro");
    const z = ZOOMS[S.leitorZoom == null ? 1 : S.leitorZoom];
    const pct = document.querySelector(".leitor-pct"); if (pct) pct.textContent = Math.round(z * 100) + "%";
    const menos = document.querySelector('[data-a="leitor-zoom"][data-v="-1"]'), mais = document.querySelector('[data-a="leitor-zoom"][data-v="1"]');
    if (menos) menos.disabled = (S.leitorZoom ?? 1) <= 0;
    if (mais) mais.disabled = (S.leitorZoom ?? 1) >= ZOOMS.length - 1;
    try {
      const doc = fr && fr.contentDocument; if (!doc || !doc.documentElement) return;
      let st = doc.getElementById("zoom-leitor");
      if (!st) { st = doc.createElement("style"); st.id = "zoom-leitor"; (doc.head || doc.documentElement).appendChild(st); }
      st.textContent = "html{zoom:" + z + "}";
    } catch { /* outro domínio */ }
  }
  window.__zoomLeitor = aplicarZoomLeitor;
  function telaLeitor() {
    const l = S.leitor || {};
    const zi = S.leitorZoom == null ? 1 : S.leitorZoom;
    return `
    <div class="leitor" role="dialog" aria-modal="true" aria-label="${h(l.titulo || "Ebook")}">
      <div class="leitor-cab">
        <button class="voltar" data-a="fechar-leitor" aria-label="Fechar o ebook e voltar">${ICONES.seta_esq}Voltar</button>
        <b class="leitor-tit">${h(l.titulo || "")}</b>
        <div class="leitor-zoom" role="group" aria-label="Tamanho da letra do ebook">
          <button data-a="leitor-zoom" data-v="-1" aria-label="Diminuir a letra" ${zi <= 0 ? "disabled" : ""}>A−</button>
          <span class="leitor-pct" aria-live="polite">${Math.round(ZOOMS[zi] * 100)}%</span>
          <button data-a="leitor-zoom" data-v="1" aria-label="Aumentar a letra" ${zi >= ZOOMS.length - 1 ? "disabled" : ""}>A+</button>
        </div>
      </div>
      <iframe class="leitor-quadro" src="${h(l.href || "")}" title="${h(l.titulo || "Ebook")}" onload="window.__zoomLeitor && window.__zoomLeitor(this)"></iframe>
    </div>`;
  }

  /* ---------- jornada e perfil ---------- */
  function telaJornada() {
    const c = continuar();
    const concl = MODS().reduce((s, md, mi) => s + md.aulas.filter((_, ai) => feita(mi, ai)).length, 0);
    const tot = total(), pctJ = tot ? Math.round((concl / tot) * 100) : 0;
    const modsFeitos = MODS().filter((md, mi) => md.aulas.length && feitasMod(mi) === md.aulas.length).length;
    let onde = "";
    if (c) {
      const md = MODS()[c.m], ps = posicao(c.m, c.a);
      onde = `
      <section class="jn-onde" aria-labelledby="h-onde">
        <p class="pa-rot" id="h-onde-rot">Onde você está</p>
        <button class="jn-onde-card" data-a="aula" data-m="${c.m}" data-i="${c.a}">
          <span class="la-capa">${img(md.aulas[c.a].capa, "")}<span class="la-ic">${ICONES.play}</span></span>
          <span class="la-info"><b>${h(md.rot)} ${md.num} · ${h(lA(md, c.a))}</b><span id="h-onde">${h(md.aulas[c.a].titulo)}</span><em>${ps > 0 ? "Em andamento" : "Ainda não começou"}</em></span>
        </button>
        <button class="botao largo" data-a="aula" data-m="${c.m}" data-i="${c.a}"><span class="ic-play"></span>Continuar assistindo</button>
      </section>`;
    } else onde = `<div class="vazio" style="margin-top:18px">Você concluiu todas as aulas liberadas.</div>`;
    const grupos = MODS().map((md, mi) => {
      const fs = md.aulas.map((t, ai) => [ai, t]).filter(([ai]) => feita(mi, ai));
      if (!fs.length) return "";
      return `
        <div class="jn-grupo">
          <div class="jn-grupo-topo"><b>${h(md.rot)} ${md.num} — ${h(titulo(md.titulo))}</b><span>${fs.length} de ${md.aulas.length}</span></div>
          ${fs.map(([ai, t]) => `
          <button class="la-item" data-a="aula" data-m="${mi}" data-i="${ai}">
            <span class="la-capa">${img(t.capa, "")}<span class="la-ic">✓</span></span>
            <span class="la-info"><b>${h(md.rot)} ${md.num} · ${h(lA(md, ai))}</b><span>${h(t.titulo)}</span><em>Concluída</em></span>
            <span class="la-assistir" aria-hidden="true">${ICONES.play}Rever</span>
          </button>`).join("")}
        </div>`;
    }).join("");
    return `
    <div class="pagina jn">
      <div class="barra-aula"><button class="voltar" data-a="voltar-jornada" aria-label="Voltar para onde você estava">‹ Voltar</button></div>
      <div class="ola"><p>Sua jornada</p><h1 class="serif">Minha jornada</h1></div>
      <section class="jn-resumo" aria-label="Seu progresso">
        <span class="ex-anel" style="--p:${pctJ}"><b>${pctJ}%</b></span>
        <span class="jn-resumo-txt">
          <b>${concl} de ${p(tot, "aula concluída", "aulas concluídas")}</b>
          <span class="barra"><i style="width:${pctJ}%"></i></span>
          <span>${modsFeitos} de ${p(MODS().length, "módulo concluído", "módulos concluídos")}</span>
        </span>
      </section>
      ${onde}
      <section class="secao jn-prog"><div class="secao-topo"><h2 class="serif">Seu progresso por módulo</h2></div>
        <div class="cartao">${MODS().map((md, m) => (liberado(m) ? `<div class="prog-mod"><div><span>${h(md.rot)} ${md.num} · ${h(titulo(md.titulo))}</span><span class="apoio">${feitasMod(m)}/${md.aulas.length}</span></div><div class="barra"><i style="width:${md.aulas.length ? (feitasMod(m) / md.aulas.length) * 100 : 0}%"></i></div></div>` : "")).join("")}
          <p class="apoio" style="margin-top:10px">Os próximos módulos aparecem aqui quando forem liberados.</p></div></section>
      <section class="jn-feitas" aria-labelledby="h-feitas">
        <p class="pa-rot" id="h-feitas">Aulas que você já assistiu</p>
        ${grupos || `<div class="vazio">Você ainda não concluiu nenhuma aula. Quando terminar uma, ela aparece aqui.</div>`}
      </section>
    </div>`;
  }
  function painelConfig() {
    return `
    <div class="config" role="dialog" aria-modal="true" aria-labelledby="h-config">
      <div class="config-cab">
        <button class="mp-voltar" data-a="fechar-config" aria-label="Voltar para o perfil"><span aria-hidden="true">‹</span>Voltar</button>
        <h2 class="serif" id="h-config">Configurações</h2>
      </div>
      <p class="config-nota">Tudo o que você muda aqui é salvo na hora.</p>
      <div class="config-corpo">
      <section class="secao"><div class="secao-topo"><h2 class="serif">Sua foto e sua cor</h2></div>
        <div class="cartao"><p class="apoio">Sua foto aparece nos seus comentários. A cor fica no círculo em volta dela (ou na letra, se você não colocar foto).</p>
          <div class="foto-acoes">${S.foto
            ? `<button class="botao-2" data-a="ajustar-foto">Ajustar</button><button class="botao-2" data-a="escolher-foto">Trocar foto</button><button class="botao-2 foto-remover" data-a="tirar-foto">Remover</button>`
            : '<button class="botao-2" data-a="escolher-foto">Colocar foto</button>'}</div>
          <div class="cores-nome" role="group" aria-label="Cor do círculo">${CORES_NOME.map(([cor, nome]) => `<button data-a="cor-nome" data-v="${cor}" style="--c:${cor}" aria-pressed="${S.corNome === cor}" aria-label="${nome}"><span></span></button>`).join("")}</div>
          <div class="cor-previa">${avCom(S.nome, S.corNome, S.foto)}<b class="com-nome">${h(S.nome)}</b></div>
        </div></section>
      <section class="secao"><div class="secao-topo"><h2 class="serif">Tema</h2></div>
        <div class="cartao"><p class="apoio">Escolha o fundo que fica mais confortável para os seus olhos.</p>
          <div class="segmento" role="group" aria-label="Tema">
            <button data-a="tema" data-v="escuro" aria-pressed="${S.tema !== "claro"}"><span class="tema-bola escuro" aria-hidden="true"></span>Escuro</button>
            <button data-a="tema" data-v="claro" aria-pressed="${S.tema === "claro"}"><span class="tema-bola claro" aria-hidden="true"></span>Claro</button>
          </div>
        </div></section>
      <section class="secao"><div class="secao-topo"><h2 class="serif">Tamanho da letra</h2></div>
        <div class="cartao"><p class="apoio">Escolha o que fica mais confortável para ler.</p>
          ${controleLetra()}
        </div></section>
      <section class="secao"><div class="secao-topo"><h2 class="serif">Ajuda</h2></div>
        <div class="cartao" style="display:grid;gap:10px">
          <button class="botao-2" data-a="instalar" style="justify-content:flex-start">Colocar a mentoria na tela do celular</button>
          <p class="apoio">Dúvidas sobre acesso ou aulas? Fale com a equipe da mentoria pelo seu grupo.</p>
        </div></section>
      </div>
    </div>`;
  }
  function telaSaiu() {
    return `
    <div class="saiu">
      <div class="saiu-caixa">
        <span class="saiu-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg></span>
        <h1 class="serif">Você saiu da mentoria</h1>
        <p>Sua conta foi desconectada deste aparelho. Já pode fechar o aplicativo.</p>
        <button class="saiu-voltar" data-a="entrar-de-novo">Entrar de novo</button>
      </div>
    </div>`;
  }
  /** Ícones e ações dos botões do Perfil (Configurações → Perfil no painel). */
  const IC_PERFIL = {
    configurar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    onde_parei: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    sair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 7V4.5H4.5v15H14V17"/><path d="M20 12H10M16.5 8.5L20 12l-3.5 3.5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/></svg>',
  };
  const ACAO_PERFIL = { configurar: "abrir-config", onde_parei: "jornada", sair: "sair" };
  function perfilConfigurado() {
    const P = (D && D.inicio && D.inicio.perfil) || { titulo: "Seu perfil", saudacao: "{nome_completo}", imagem: "nenhum", texto: "", layout: "padrao", botoes: [] };
    const primeiro = (S.nome || "").trim().split(/\s+/)[0] || "";
    const saud = (P.saudacao ?? "{nome_completo}").replace(/\{nome_completo\}/g, S.nome || "").replace(/\{nome\}/g, primeiro);
    const bts = (P.botoes && P.botoes.length ? P.botoes : [{ id: "configurar", rotulo: "Configurar", visivel: true }, { id: "onde_parei", rotulo: "Onde parei", visivel: true }, { id: "sair", rotulo: "Sair da área de membros", visivel: true }]).filter((b) => b.visivel !== false);
    const foto = P.imagem === "foto" ? `<div class="pf-foto-al"><button class="pf-foto-circ" data-a="escolher-foto" aria-label="Trocar sua foto">${S.foto ? `<img src="${h(S.foto)}" alt="" />` : `<span>${h((S.nome || "?").trim()[0] || "?")}</span>`}<i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></i></button></div>`
      : P.imagem === "icone" ? `<div class="pf-foto-al"><span class="pf-foto-circ pf-icone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/></svg></span></div>` : "";
    return `
      <div class="pf-al pf-al-${h(P.layout || "padrao")}">
        ${(P.titulo ?? "Seu perfil") || saud.trim() ? `<div class="ola">${(P.titulo ?? "Seu perfil") ? `<p>${h(P.titulo ?? "Seu perfil")}</p>` : ""}${saud.trim() ? `<h1 class="serif">${h(saud)}</h1>` : ""}</div>` : ""}
        ${foto}
        <div class="pf-al-bts">${bts.map((b) => {
          const ic = IC_PERFIL[b.id] || IC_PERFIL.link;
          const dentro = `${ic}<span>${h(b.rotulo)}</span><b aria-hidden="true">›</b>`;
          const cor = (b.cor ? "background:" + h(b.cor) + ";" : "") + (b.corTexto ? "color:" + h(b.corTexto) + ";" : ""), st = cor ? ` style="${cor}"` : "";
          if (b.id === "notificacoes") return S.notifOn ? "" : `<div class="np-card"${st}><span class="np-csino">${SINO}</span><span class="np-ctxt"><b>${h(b.rotulo)}</b><em>Desativados. Ative para saber quando liberar.</em></span><button class="np-cbt" data-a="notif-ativar">Ativar</button></div>`;
          return b.url ? `<a class="pf-al-bt" href="${h(b.url)}" target="_blank" rel="noopener"${st}>${dentro}</a>` : ACAO_PERFIL[b.id] ? `<button class="pf-al-bt${b.id === "sair" ? " sair" : ""}" data-a="${ACAO_PERFIL[b.id]}"${st}>${dentro}</button>` : "";
        }).join("")}</div>
        ${P.texto ? `<p class="pf-al-txt">${h(P.texto)}</p>` : ""}
      </div>`;
  }
  function telaPerfil() {
    document.documentElement.classList.toggle("trava-rolagem", !!S.config);
    return `
    <div class="pagina">
      ${S.perfilDe ? `<div class="barra-aula"><button class="voltar" data-a="voltar-perfil" aria-label="Voltar para onde você estava">‹ Voltar</button></div>` : ""}
      ${perfilConfigurado()}
    </div>
    ${S.config ? painelConfig() : ""}`;
  }

  /* ---------- folhas, avisos e foto (da maquete) ---------- */
  let FE = null;
  const FE_V = 240;
  const feBase = () => Math.max(FE_V / FE.w, FE_V / FE.h);
  function feLimitar() { const sc = feBase() * FE.z, mx = Math.max(0, (FE.w * sc - FE_V) / 2), my = Math.max(0, (FE.h * sc - FE_V) / 2); FE.x = Math.max(-mx, Math.min(mx, FE.x)); FE.y = Math.max(-my, Math.min(my, FE.y)); }
  function feDesenhar() {
    const im = camada.querySelector(".fe-img"); if (!im) return;
    feLimitar(); const sc = feBase() * FE.z;
    im.style.width = FE.w * sc + "px"; im.style.height = FE.h * sc + "px";
    im.style.transform = "translate(calc(-50% + " + FE.x + "px), calc(-50% + " + FE.y + "px))";
    const z = camada.querySelector(".fe-zoom"); if (z) z.value = FE.z;
  }
  function abrirEditorFoto(dados) {
    FE = dados;
    folha(`
      <h2 class="serif" style="margin:0 0 4px">Ajuste sua foto</h2>
      <p class="apoio">Arraste a foto para centralizar o rosto. Use a barra para aproximar.</p>
      <div class="fe-quadro" style="--c:${S.corNome}">
        <div class="fe-janela"><img class="fe-img" src="${FE.src}" alt="" draggable="false" /></div>
      </div>
      <div class="fe-zoom-linha"><span aria-hidden="true">−</span><input class="fe-zoom" type="range" min="1" max="3" step="0.01" value="${FE.z}" aria-label="Aproximar a foto" /><span aria-hidden="true">+</span></div>
      <button class="fe-trocar" data-a="escolher-foto">Escolher outra foto</button>
      <div class="folha-botoes"><button class="botao-2" data-a="foto-cancelar">Cancelar</button><button class="botao" data-a="foto-salvar">Salvar foto</button></div>`);
    const jan = camada.querySelector(".fe-janela"), zoom = camada.querySelector(".fe-zoom");
    let arr = null;
    jan.addEventListener("pointerdown", (ev) => { arr = { px: ev.clientX, py: ev.clientY, x: FE.x, y: FE.y }; jan.setPointerCapture(ev.pointerId); });
    jan.addEventListener("pointermove", (ev) => { if (!arr) return; FE.x = arr.x + (ev.clientX - arr.px); FE.y = arr.y + (ev.clientY - arr.py); feDesenhar(); });
    const solta = () => { arr = null; };
    jan.addEventListener("pointerup", solta); jan.addEventListener("pointercancel", solta);
    jan.addEventListener("wheel", (ev) => { ev.preventDefault(); FE.z = Math.max(1, Math.min(3, FE.z - ev.deltaY * 0.002)); feDesenhar(); }, { passive: false });
    zoom.addEventListener("input", () => { FE.z = +zoom.value; feDesenhar(); });
    const im = camada.querySelector(".fe-img");
    if (im.complete) feDesenhar(); else im.onload = feDesenhar;
  }
  function salvarFoto() {
    if (!FE) return;
    const im = camada.querySelector(".fe-img"), t = 320, sc = feBase() * FE.z;
    const c = document.createElement("canvas"); c.width = t; c.height = t;
    const k = t / FE_V, dw = FE.w * sc * k, dh = FE.h * sc * k;
    c.getContext("2d").drawImage(im, t / 2 - dw / 2 + FE.x * k, t / 2 - dh / 2 + FE.y * k, dw, dh);
    S.foto = c.toDataURL("image/jpeg", 0.88);
    S.fotoOrig = { src: FE.src, w: FE.w, h: FE.h, z: FE.z, x: FE.x, y: FE.y };
    const o = S.fotoOrig;
    camada.innerHTML = ""; FE = null;
    void api.salvarMinhaFoto(S.foto, o.src, { w: o.w, h: o.h, z: o.z, x: o.x, y: o.y })
      .then(() => aviso("Foto salva. Ela já aparece no topo e nos seus comentários."))
      .catch(() => aviso("Não conseguimos salvar a foto agora. Tente de novo."));
    render();
  }
  /* ---------- PDF dentro do app (PDF.js: o leitor do iPhone só mostra a 1ª página) ---------- */
  const PDF_ZOOMS = [0.75, 1, 1.25, 1.5, 2, 2.5];
  let pdfDoc = null, pdfZ = 1, pdfUrl = "", pdfNome = "";
  function carregarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((ok, erro) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; ok(window.pdfjsLib); };
      s.onerror = erro; document.head.appendChild(s);
    });
  }
  async function desenharPdf() {
    const box = document.getElementById("pdfPaginas"), pct = document.getElementById("pdfPct");
    if (!box || !pdfDoc) return;
    const doc = pdfDoc, k = PDF_ZOOMS[pdfZ];
    if (pct) pct.textContent = Math.round(k * 100) + "%";
    document.querySelectorAll('[data-a="pdf-zoom"]').forEach((b) => { b.disabled = (+b.dataset.v < 0 && pdfZ <= 0) || (+b.dataset.v > 0 && pdfZ >= PDF_ZOOMS.length - 1); });
    const larg = Math.max(260, box.clientWidth - 24) * k, dpr = Math.min(2, window.devicePixelRatio || 1);
    box.innerHTML = "";
    for (let n = 1; n <= doc.numPages; n++) {
      if (pdfDoc !== doc) return;
      const pg = await doc.getPage(n), v0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: (larg / v0.width) * dpr });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height; c.style.width = vp.width / dpr + "px"; c.style.height = vp.height / dpr + "px";
      c.setAttribute("aria-label", "Página " + n + " de " + doc.numPages);
      box.appendChild(c);
      await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    }
  }
  function abrirPdf(url, tituloPdf, nome) {
    pdfZ = 1; pdfDoc = null; pdfUrl = url; pdfNome = nome; S.pdfY = window.scrollY;
    document.documentElement.classList.add("trava-rolagem");
    camada.innerHTML = `
    <div class="leitor leitor-pdf" role="dialog" aria-modal="true" aria-label="${h(tituloPdf)}">
      <div class="leitor-cab">
        <button class="voltar" data-a="fechar-pdf" aria-label="Fechar o PDF e voltar">${ICONES.seta_esq}Voltar</button>
        <b class="leitor-tit">${h(tituloPdf)}</b>
        <div class="leitor-zoom" role="group" aria-label="Zoom do PDF">
          <button data-a="pdf-zoom" data-v="-1" aria-label="Diminuir">A−</button>
          <span class="leitor-pct" id="pdfPct" aria-live="polite">100%</span>
          <button data-a="pdf-zoom" data-v="1" aria-label="Aumentar">A+</button>
        </div>
      </div>
      <div class="pdf-paginas" id="pdfPaginas"><p class="apoio" style="padding:24px;text-align:center">Carregando o PDF…</p></div>
      <div class="pdf-rodape"><button class="botao largo" data-a="pdf-salvar">Salvar no celular</button></div>
    </div>`;
    carregarPdfJs()
      .then((lib) => lib.getDocument(url).promise)
      .then((doc) => { pdfDoc = doc; return desenharPdf(); })
      .catch(() => { const b = document.getElementById("pdfPaginas"); if (b) b.innerHTML = '<p class="apoio" style="padding:24px;text-align:center">Não foi possível abrir o PDF agora. Tente de novo ou use “Salvar no celular”.</p>'; });
  }
  // O link é assinado e de outro endereço: baixa o arquivo e entrega com o nome certo.
  async function salvarPdf() {
    try {
      const r = await fetch(pdfUrl); if (!r.ok) throw new Error();
      const u = URL.createObjectURL(await r.blob());
      const a = document.createElement("a"); a.href = u; a.download = pdfNome || "material.pdf"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 30000);
    } catch { window.open(pdfUrl, "_blank", "noopener"); }
  }
  function folha(conteudo) { camada.innerHTML = `<div class="fundo-folha" data-a="fechar-folha"><div class="folha" role="dialog" aria-modal="true">${conteudo}</div></div>`; const b = camada.querySelector("button"); if (b) b.focus(); }
  let tAviso;
  function aviso(t) { let el = document.querySelector(".aviso"); if (!el) { el = document.createElement("div"); el.className = "aviso"; el.setAttribute("role", "status"); document.body.appendChild(el); } el.textContent = t; clearTimeout(tAviso); tAviso = setTimeout(() => el.remove(), 3600); }
  const topo = () => window.scrollTo({ top: 0 });

  /* ---------- voltar do aparelho ---------- */
  const foto = () => ({ tela: S.tela, mod: S.mod, aula: S.aula, presente: S.presente, cat: S.cat, cursoPres: S.cursoPres, origemMod: S.origemMod, perfilDe: S.perfilDe, jornadaDe: S.jornadaDe, leitor: S.leitor, config: S.config });
  let ultimaTela = "";
  function marcarHistorico() {
    const chave = JSON.stringify([S.tela, S.mod, S.aula, S.presente, S.cat, S.cursoPres, !!S.config]);
    if (!S.entrou || chave === ultimaTela) return;
    if (ultimaTela) history.pushState({ aion: foto() }, ""); else history.replaceState({ aion: foto() }, "");
    ultimaTela = chave;
  }
  window.addEventListener("popstate", (e) => {
    const f = e.state && e.state.aion; if (!f || !S.entrou) return;
    camada.innerHTML = "";
    if (S.tela === "aula" || S.tela === "presente" || S.tela === "opcao") pararVideo();
    Object.assign(S, f); ultimaTela = JSON.stringify([S.tela, S.mod, S.aula, S.presente, S.cat, S.cursoPres, !!S.config]);
    if (S.tela === "aula") abrirAula(); else if (S.tela === "presente") abrirPresente();
    render();
  });

  async function abrirAula() {
    const au = MODS()[S.mod]?.aulas[S.aula]; if (!au) return;
    const id = au.id;
    void import("hls.js").catch(() => {});
    await ultimaConclusao;
    void pedirVideo(id).then((ref) => {
      if (S.tela !== "aula" || MODS()[S.mod]?.aulas[S.aula]?.id !== id) return;
      render(); prepararVideo(id, ref);
      // "Continuar assistindo" no Início: já toca, do ponto salvo no banco.
      if (S.autoTocar && ref) { S.autoTocar = false; void tocar(id); }
    });
    api.comentariosDaAula(id).then((l) => { S.coms[id] = l; if (S.tela === "aula" && MODS()[S.mod]?.aulas[S.aula]?.id === id) render(); }).catch(() => {});
  }
  async function abrirPresente() {
    const [ci, i, j] = String(S.presente || "").split("-").map(Number);
    const t = CATS()[ci]?.cursos[i]?.itens[j]; if (!t || !aulaAdmin(t.id)) return;
    void import("hls.js").catch(() => {});
    await ultimaConclusao;
    void pedirVideo(t.id).then((ref) => { if (S.tela === "presente" && conteudoAtual()?.id === t.id) { render(); prepararVideo(t.id, ref); } });
    api.comentariosDaAula(t.id).then((l) => { S.coms[t.id] = l; if (S.tela === "presente" && conteudoAtual()?.id === t.id) render(); }).catch(() => {});
  }

  /* ---------- ações ---------- */
  function acao(a, d) {
    switch (a) {
      case "ir": if (String(d.v).startsWith("aba:")) { S.aba = d.v.slice(4); d = { ...d, v: "presentes" }; } else if (d.v === "presentes" && S.tela !== "categoria" && S.tela !== "cursoPres") S.aba = null;
        S.config = false; document.documentElement.classList.remove("trava-rolagem"); pararVideo(); if (S.tela !== d.v || d.v !== "perfil") S.perfilDe = null; S.tela = d.v; topo(); break;
      case "perfil-av": if (S.tela !== "perfil") { pararVideo(); S.perfilDe = { tela: S.tela, mod: S.mod, aula: S.aula, presente: S.presente, y: window.scrollY }; S.tela = "perfil"; topo(); } break;
      case "jornada": pararVideo(); if (S.tela !== "jornada") S.jornadaDe = { tela: S.tela, mod: S.mod, aula: S.aula, presente: S.presente, y: window.scrollY }; S.tela = "jornada"; topo(); break;
      case "voltar-jornada": case "voltar-perfil": {
        const o = a === "voltar-jornada" ? S.jornadaDe : S.perfilDe;
        if (a === "voltar-jornada") S.jornadaDe = null; else S.perfilDe = null;
        if (!o) { S.tela = "inicio"; topo(); break; }
        Object.assign(S, { tela: o.tela, mod: o.mod, aula: o.aula, presente: o.presente });
        if (S.tela === "aula") void abrirAula(); if (S.tela === "presente") void abrirPresente();
        render(); window.scrollTo({ top: o.y || 0 }); return;
      }
      case "modulo": {
        const m = +d.m; if (!MODS()[m]) return; pararVideo();
        if (S.tela !== "modulo" && S.tela !== "aula") { S.origemMod = S.tela; S.rolagemOrigem = window.scrollY; }
        S.mod = m; S.tela = "modulo"; topo(); break;
      }
      case "voltar-conteudo": {
        pararVideo(); const o = S.voltaConteudo; S.voltaConteudo = null;
        if (!o) { if (S.tela === "presente") { const [ci, i] = String(S.presente).split("-"); acao("curso-pres", { v: ci + "-" + i }); } else acao("modulo", { m: S.mod }); return; }
        S.tela = o.tela; if (o.tela === "modulo") S.mod = o.mod; if (o.cat != null) S.cat = o.cat; if (o.cursoPres != null) S.cursoPres = o.cursoPres;
        render(); window.scrollTo({ top: o.y || 0 }); return;
      }
      case "voltar-mod": { pararVideo(); const y = S.rolagemOrigem || 0; S.tela = S.origemMod || "inicio"; render(); window.scrollTo({ top: y }); return; }
      case "aula": {
        const m = +d.m, i = +d.i; if (!MODS()[m] || !MODS()[m].aulas[i]) return;
        const ea = estadoAula(m, i);
        if (ea.fech) { aviso("Esta aula será liberada no momento certo da sua jornada."); return; }
        pararVideo();
        if (S.tela !== "aula") S.voltaConteudo = { tela: S.tela, y: window.scrollY, mod: S.mod, cat: S.cat, cursoPres: S.cursoPres };
        if (S.tela !== "modulo" && S.tela !== "aula") { S.origemMod = S.tela; S.rolagemOrigem = window.scrollY; }
        S.mod = m; S.aula = i; S.tela = "aula"; S.rascunho = ""; S.abaAula = null; S.autoTocar = d.tocar === "1"; void abrirAula(); topo(); break;
      }
      case "anterior": if (S.aula > 0) acao("aula", { m: S.mod, i: S.aula - 1 }); else if (S.mod > 0) acao("aula", { m: S.mod - 1, i: MODS()[S.mod - 1].aulas.length - 1 }); return;
      case "seguinte":
        if (S.tela === "presente") { const [ci, i, j] = String(S.presente).split("-").map(Number); if (CATS()[ci]?.cursos[i]?.itens[j + 1]) { delete S.fim[chaveAtual()]; acao("presente", { v: ci + "-" + i + "-" + (j + 1) }); } return; }
        if (S.aula + 1 < MODS()[S.mod].aulas.length) acao("aula", { m: S.mod, i: S.aula + 1 }); else acao("modulo", { m: S.mod + 1 }); return;
      case "tocar": {
        const id = S.tela === "opcao" ? S.opcaoAberta && S.opcaoAberta.id : S.tela === "presente" ? (() => { const [ci, i, j] = String(S.presente).split("-").map(Number); return CATS()[ci]?.cursos[i]?.itens[j]?.id; })() : MODS()[S.mod]?.aulas[S.aula]?.id;
        if (!id) return;
        if (VID && VID_ID === id && !VID.paused) { VID.pause(); return; }
        void tocar(id); return;
      }
      case "ebook-opcao": {
        const c = conteudoAtual(); const item = c && (c.tipo === "aula" ? c.md.aulas[c.a] : c.curso.itens[c.j]);
        const op = item && (item.opcoes || []).find((x) => x.id === d.id); if (!op) return;
        if (op.bloqueado) { folha(`<div class="eb-bloq-folha"><span class="eb-bloq-ic">${ICONES.cadeado}</span><h2 class="serif">${h(op.titulo || "Em breve")}</h2><p>${h((op.avisoBloqueio || "").trim() || "Este conteúdo ainda não foi liberado. Assim que liberar, ele abre aqui.")}</p></div><button class="botao-2 largo" data-a="fechar-folha" style="margin-top:16px;width:100%">Entendi</button>`); return; }
        if (op.tipo === "texto") {
          if (!(op.texto || "").trim()) { aviso("Este conteúdo será adicionado em breve."); return; }
          const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:28px 22px 60px;font-family:Georgia,'Cormorant Garamond',serif;font-size:18px;line-height:1.75;color:#3a2a14;background:linear-gradient(180deg,#f7ecd9,#f3e4c8)}h1{font-size:26px;line-height:1.25;text-align:center;color:#5a3d16;margin:6px 0 22px}p{margin:0 0 16px}b{color:#5a3d16}</style></head><body><h1>${h(op.titulo)}</h1>${paragrafos(op.texto)}</body></html>`;
          const href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
          S.leitorDe = { presente: S.presente, y: window.scrollY }; S.leitor = { titulo: op.titulo, href }; S.tela = "leitor"; topo(); render(); return;
        }
        if (op.tipo === "pdf") {
          if (!op.arquivoPath) { aviso("Este PDF será adicionado em breve."); return; }
          void api.enderecoDoArquivo("materiais", op.arquivoPath).then((u) => (u ? abrirPdf(u, op.titulo, (op.arquivoPath.split("/").pop() || "arquivo.pdf").replace(/^\d+-/, "")) : aviso("Não conseguimos abrir este PDF agora.")));
          return;
        }
        // Vídeo ou áudio: tela completa, como uma aula.
        MIDIA.set(op.id, { tipo: op.tipo, arquivo: op.arquivoPath || "", conteudo: true });
        pararVideo(); S.opcaoAberta = { id: op.id, de: { tela: S.tela, presente: S.presente, mod: S.mod, aula: S.aula }, y: window.scrollY };
        S.tela = "opcao"; topo(); render();
        void pedirVideo(op.id).then((ref) => { if (S.tela === "opcao" && S.opcaoAberta && S.opcaoAberta.id === op.id) { render(); prepararVideo(op.id, ref); } });
        return;
      }
      case "opcao-voltar": { pararVideo(); const o = S.opcaoAberta || {}; S.opcaoAberta = null; const de = o.de || {}; S.tela = de.tela || "presentes"; if (de.presente) S.presente = de.presente; render(); window.scrollTo({ top: o.y || 0 }); return; }
      case "ler-pdf-aula": { const id = S.tela === "presente" ? conteudoAtual()?.id : MODS()[S.mod]?.aulas[S.aula]?.id; if (id) void lerPdfAula(id); return; }
      case "buscar": return; // arrastar e tocar na trilha: ver "trilha do vídeo" abaixo
      case "de-novo": { const k = chaveAtual(); delete S.fim[k]; if (VID) { VID.currentTime = 0; void VID.play().catch(() => {}); render(); } else acao("tocar", {}); return; }
      case "ver-aulas": {
        S.verAulas = S.verAulas || {}; const ab = (S.verAulas[d.m] = !S.verAulas[d.m]);
        const lista = document.getElementById("la-" + d.m), b = d._el;
        if (lista && b) { lista.classList.toggle("aberto", ab); b.setAttribute("aria-expanded", ab); b.innerHTML = (ab ? "Esconder aulas" : "Ver aulas (" + MODS()[+d.m].aulas.length + ")") + '<span aria-hidden="true">' + (ab ? "⌃" : "⌄") + "</span>"; return; }
        break;
      }
      case "voltar-aula-fim": delete S.modFim[S.mod]; render(); window.scrollTo({ top: 0 }); return;
      case "finalizar-mod": { parar(); delete S.fim[chaveAtual()]; S.modFim[S.mod] = 1; render(); window.scrollTo({ top: 0 }); return; }
      case "aba-aula": {
        S.abaAula = S.abaAula === d.v ? null : d.v;
        render();
        if (!S.abaAula) return;
        requestAnimationFrame(() => {
          const abas = document.querySelector(".abas-aula"), painel = abas && abas.nextElementSibling; if (!painel) return;
          const r = painel.getBoundingClientRect(), nav = document.querySelector(".nav-base");
          const limite = window.innerHeight - (nav ? nav.getBoundingClientRect().height : 0) - 16;
          if (r.bottom > limite) window.scrollBy({ top: r.bottom - limite, behavior: "smooth" });
        });
        return;
      }
      case "aba-fechar": S.abaAula = null; break;
      case "pdf-ver": {
        const oa = S.tela === "opcao" ? opcaoAberta() : null;
        const c = conteudoAtual(); const lista = oa ? oa.op.extras : c ? (c.tipo === "aula" ? c.md.aulas[c.a].conteudos : c.curso.itens[c.j].conteudos) : [];
        const x = (lista || []).find((y) => y.id === d.id); if (!x) return;
        const tit = (c.tipo === "aula" ? c.md.rot + " " + c.md.num + " · " + lA(c.md, c.a) : c.curso.nome) + " — PDF";
        const nome = (x.titulo || c.titulo || "material").replace(/[\\/:*?"<>|]+/g, " ").trim() + ".pdf";
        if (x.url) { abrirPdf(x.url, tit, nome); return; }
        void api.enderecoDoArquivo("materiais", x.arquivoPath).then((u) => (u ? abrirPdf(u, tit, nome) : aviso("Não conseguimos abrir o PDF agora. Tente de novo.")));
        return;
      }
      case "fechar-pdf": { camada.innerHTML = ""; pdfDoc = null; document.documentElement.classList.remove("trava-rolagem"); const y = S.pdfY || 0; window.scrollTo({ top: y }); return; }
      case "pdf-zoom": { pdfZ = Math.max(0, Math.min(PDF_ZOOMS.length - 1, pdfZ + Number(d.v))); void desenharPdf(); return; }
      case "pdf-salvar": { void salvarPdf(); return; }
      case "ver-exercicio": {
        const au = MODS()[S.mod]?.aulas[S.aula]; if (!au || !au.exercicio.trim()) return;
        const [tit, ...resto] = au.exercicio.trim().split(/\n/);
        folha(`<p class="rotulo">Exercício da aula</p><h2 class="serif" style="margin-top:6px">${h(tit)}</h2><div style="margin-top:14px;font-size:1.0625rem;line-height:1.7;color:var(--texto-2)">${resto.join("\n").trim().split(/\n\s*\n/).filter(Boolean).map((par, i) => `<p${i ? ' style="margin-top:12px"' : ""}>${h(par).replace(/\n/g, "<br>")}</p>`).join("")}</div><button class="botao largo" data-a="fechar-folha" style="margin-top:20px">Fechar</button>`); return;
      }
      case "com-curtir": {
        const cid = conteudoAtual()?.id; const x = cid && (S.coms[cid] || []).find((c) => c.id === d.id); if (!x) return;
        x.curti = !x.curti; x.curtidas = Math.max(0, (x.curtidas || 0) + (x.curti ? 1 : -1)); render();
        void api.alternarCurtidaComentario(x.id).then((v) => { if (v !== x.curti) { x.curti = v; x.curtidas = Math.max(0, x.curtidas + (v ? 1 : -1)); render(); } }).catch(() => { x.curti = !x.curti; x.curtidas = Math.max(0, x.curtidas + (x.curti ? 1 : -1)); aviso("Não conseguimos curtir agora. Tente de novo."); render(); });
        return;
      }
      case "com-mais": folha(`<h2 class="serif">Opções do comentário</h2><div class="opcoes" style="margin-top:14px"><button data-a="com-denunciar" data-id="${h(d.id)}">Denunciar comentário</button></div><button class="botao-2 largo" data-a="fechar-folha" style="margin-top:14px">Cancelar</button>`); return;
      case "com-denunciar": camada.innerHTML = ""; void api.denunciarComentario(d.id).then(() => aviso("Obrigada. A equipe vai olhar este comentário.")).catch(() => aviso("Não conseguimos enviar agora. Tente de novo.")); return;
      case "velocidade": folha(`<h2 class="serif">Velocidade</h2><div class="opcoes">${Object.keys(VELS).map((v) => `<button data-a="vel" data-v="${v}" aria-pressed="${S.velocidade === v}">${v === "Normal" ? "Normal (1x)" : v}</button>`).join("")}</div>`); return;
      case "vel": S.velocidade = d.v; if (VID) VID.playbackRate = VELS[d.v] || 1; camada.innerHTML = ""; aviso("Velocidade: " + (d.v === "Normal" ? "normal" : d.v) + "."); break;
      case "fechar-folha": if (d._alvo && d._alvo !== d._el && d._el.classList.contains("fundo-folha")) return; camada.innerHTML = ""; return;
      case "volume": S.mudo = !S.mudo; if (VID) VID.muted = S.mudo; aviso(S.mudo ? "Vídeo sem som. Toque de novo para ligar." : "Som ligado."); break;
      case "tela-cheia": {
        if (!VID) { aviso("Toque em assistir primeiro."); return; }
        if (VID.webkitEnterFullscreen && /iPad|iPhone|iPod/.test(navigator.userAgent)) { VID.webkitEnterFullscreen(); return; }
        const pl = app.querySelector(".player[data-aula]"); if (pl && pl.requestFullscreen) void pl.requestFullscreen().catch(() => {}); return;
      }
      case "extra": {
        const oa = S.tela === "opcao" ? opcaoAberta() : null;
        const c = conteudoAtual(); const lista = oa ? oa.op.extras : c ? (c.tipo === "aula" ? c.md.aulas[c.a].conteudos : c.curso.itens[c.j].conteudos) : [];
        const x = (lista || []).find((y) => y.id === d.id); if (!x) return;
        if (x.url) { window.open(x.url, "_blank", "noopener"); return; }
        if (x.arquivoPath) { void api.enderecoDoArquivo(x.tipo === "audio" ? "audios" : "materiais", x.arquivoPath).then((u) => (u ? window.open(u, "_blank", "noopener") : aviso("Não conseguimos abrir este arquivo agora."))); return; }
        if (x.texto) folha(`<h2 class="serif">${h(x.titulo)}</h2><div style="margin-top:12px;line-height:1.7;color:var(--texto-2)">${h(x.texto).replace(/\n/g, "<br>")}</div><button class="botao largo" data-a="fechar-folha" style="margin-top:20px">Fechar</button>`);
        return;
      }
      case "ebook": { const [ci, i] = d.v.split("-").map(Number); S.presente = ci + "-" + i; S.tela = "presente"; topo(); break; }
      case "abrir-ebook": case "abrir-oracoes": {
        const [ci, i] = d.v.split("-").map(Number); const curso = CATS()[ci]?.cursos[i]; if (!curso) return;
        // O ebook é o arquivo do curso; as orações, o arquivo cujo nome fala em oração.
        const arqs = curso.conteudos.filter((c) => c.url || c.arquivoPath);
        const ehOracao = (c) => /ora[çc][ãaõo]/i.test(c.titulo || "");
        const x = d.a === "abrir-oracoes" ? arqs.find(ehOracao) : arqs.find((c) => !ehOracao(c)) || arqs[0];
        if (!x) { aviso(d.a === "abrir-oracoes" ? "As orações deste ebook serão adicionadas em breve." : "O ebook será adicionado em breve."); return; }
        const abrir = (href) => { S.leitorDe = { presente: S.presente, y: window.scrollY }; S.leitor = { titulo: curso.nome, href }; S.tela = "leitor"; topo(); render(); };
        if (x && x.url) abrir(x.url);
        else if (x && x.arquivoPath) void api.enderecoDoArquivo("materiais", x.arquivoPath).then((u) => (u ? abrir(u) : aviso("Não conseguimos abrir o ebook agora.")));
        return;
      }
      case "leitor-zoom": { const atual = S.leitorZoom == null ? 1 : S.leitorZoom; S.leitorZoom = Math.max(0, Math.min(ZOOMS.length - 1, atual + Number(d.v))); aplicarZoomLeitor(); return; }
      case "fechar-leitor": { const o = S.leitorDe || {}; S.leitorDe = null; S.presente = o.presente || S.presente; S.tela = "presente"; render(); window.scrollTo({ top: o.y || 0 }); return; }
      case "ver-curso": S.verCurso = S.verCurso || {}; S.verCurso[d.v] = !S.verCurso[d.v]; break;
      case "curso-pres": { const [ci, i] = d.v.split("-").map(Number); if (!CATS()[ci]?.cursos[i]) return;
        if (!cursoLiberado(CATS()[ci].cursos[i])) { aviso(CATS()[ci].cursos[i].nome + ": libera em breve."); return; } pararVideo(); S.perfilDe = null; S.cursoPres = d.v; S.tela = "cursoPres"; topo(); break; }
      case "dest-fechado": aviso("Em breve, só para você."); return;
      case "ig-busca": abrirBuscaIg(); return;
      case "ig-slide": { const tr = app.querySelector("[data-ig-trilho]"); if (tr) tr.scrollTo({ left: +d.v * tr.clientWidth, behavior: "smooth" }); return; }
      case "cat-fechada": { const c = CATS()[+d.v]; aviso((c ? c.nome : "Este conteúdo") + " ainda não foi liberado para você. Em breve!"); return; }
      case "categoria": pararVideo(); S.perfilDe = null; S.cat = +d.v; S.tela = "categoria"; topo(); break;
      case "ir-cat": {
        const pr = PRESENTES().find((x) => x.curso.nome.toLowerCase() === String(d.v).toLowerCase());
        if (pr) { acao(ehEbook(pr.curso) && cursoLiberado(pr.curso) ? "ebook" : "curso-pres", { v: pr.ci + "-" + pr.i }); return; }
        const ci = CATS().findIndex((c) => c.nome.toLowerCase() === String(d.v).toLowerCase());
        if (ci >= 0 && !catAberta(CATS()[ci])) { aviso(d.v + " ainda não foi liberado para você. Em breve!"); return; }
        pararVideo(); S.perfilDe = null; S.cat = ci; S.catVazia = ci < 0 ? String(d.v) : null; S.tela = "categoria"; topo(); break;
      }
      case "presente": {
        const [ci, i, j] = d.v.split("-").map(Number); const t = CATS()[ci]?.cursos[i]?.itens[j];
        if (!t) return;
        const e = estadoItem(CATS()[ci].cursos[i], j, ROT[tipoDoCurso(CATS()[ci], CATS()[ci].cursos[i])]);
        if (e.fech) { aviso(e.seq ? "Este conteúdo será liberado no momento certo da sua jornada." : "Este conteúdo ainda não foi liberado para você. Em breve!"); return; }
        pararVideo();
        if (S.tela !== "presente") S.voltaConteudo = { tela: S.tela, y: window.scrollY, mod: S.mod, cat: S.cat, cursoPres: S.cursoPres };
        S.presente = d.v; S.tela = "presente"; S.abaAula = null; void abrirPresente(); topo(); break;
      }
      case "com-responder": S.respondendo = d.id || null; S.rascunho = "@" + d.v + " "; acao("abrir-comentar", {}); return;
      case "coms-toggle": S.comsFechado = !S.comsFechado; gravar("aion-coms-fechado", S.comsFechado ? "1" : "0"); break;
      case "com-ver-mais": S.comTodos[d.v] = !S.comTodos[d.v]; break;
      case "resp-ver-mais": S.respTodas[d.v] = !S.respTodas[d.v]; break;
      case "abrir-comentar": {
        const c = conteudoAtual(); if (!c) return;
        folha(`<form data-f="comentar">
          <h2 class="serif">${h(ROT[c.tipo].comentar)}</h2>
          <p class="apoio" style="margin-top:4px">${h(c.titulo)}</p>
          <label for="txtCom" class="sr">Seu comentário</label>
          <textarea id="txtCom" name="txt" class="com-grande" placeholder="Escreva aqui o que achou...">${h(S.rascunho)}</textarea>
          <p class="apoio" style="margin-top:10px">A equipe lê cada comentário antes de publicar.</p>
          <div class="com-botoes">
            <button type="button" class="botao-2" data-a="fechar-folha">Cancelar</button>
            <button class="botao">${ICONES.enviar}Enviar</button>
          </div>
        </form>`);
        const t = document.getElementById("txtCom"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
        return;
      }
      case "escolher-foto": {
        const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
        inp.onchange = () => {
          const fl = inp.files[0]; if (!fl) return;
          const rd = new FileReader();
          rd.onload = () => { const im = new Image(); im.onload = () => {
            const max = 1000, k = Math.min(1, max / Math.max(im.width, im.height));
            const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
            c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
            abrirEditorFoto({ src: c.toDataURL("image/jpeg", 0.9), w: c.width, h: c.height, z: 1, x: 0, y: 0 });
          }; im.src = rd.result; };
          rd.readAsDataURL(fl);
        };
        inp.click(); return;
      }
      case "ajustar-foto": if (S.fotoOrig) abrirEditorFoto(Object.assign({}, S.fotoOrig)); else acao("escolher-foto", {}); return;
      case "foto-cancelar": camada.innerHTML = ""; return;
      case "foto-salvar": salvarFoto(); return;
      case "abrir-config": S.config = true; break;
      case "fechar-config": S.config = false; break;
      case "tirar-foto": folha(`<h2 class="serif" style="margin:0 0 6px">Remover sua foto?</h2><p class="apoio">No lugar dela volta a aparecer a letra do seu nome.</p><div class="folha-botoes"><button class="botao-2" data-a="fechar-folha">Cancelar</button><button class="botao" data-a="foto-remover-ok">Remover foto</button></div>`); return;
      case "foto-remover-ok": S.foto = ""; S.fotoOrig = null; void api.salvarMinhaFoto(null, null, null).catch(() => aviso("Não conseguimos remover a foto agora. Tente de novo.")); camada.innerHTML = ""; aviso("Foto removida."); break;
      case "cor-nome": {
        const antes = S.corNome; S.corNome = d.v; gravar("aion-cor-nome", d.v);
        void api.salvarMinhaCor(d.v).then(() => aviso("Cor salva.")).catch(() => { S.corNome = antes; gravar("aion-cor-nome", antes); aviso("Não conseguimos salvar a cor agora. Tente de novo."); render(); });
        break;
      }
      case "tema": S.tema = d.v === "claro" ? "claro" : "escuro"; gravar("aion-tema", S.tema); aviso(S.tema === "claro" ? "Tema claro ativado." : "Tema escuro ativado."); break;
      case "letra-mais": S.letra = Math.min(TAM.length - 1, S.letra + 1); gravar("aion-letra", String(S.letra)); aviso("Letra: " + NOMES_TAM[S.letra].toLowerCase() + "."); break;
      case "letra-menos": S.letra = Math.max(0, S.letra - 1); gravar("aion-letra", String(S.letra)); aviso("Letra: " + NOMES_TAM[S.letra].toLowerCase() + "."); break;
      case "instalar": folha(`<h2 class="serif">Colocar na tela do celular</h2><div style="margin-top:14px;font-size:1.0625rem;line-height:1.7;color:var(--texto-2)"><p><b style="color:var(--texto)">No iPhone:</b> toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p><p style="margin-top:12px"><b style="color:var(--texto)">No Android:</b> toque nos três pontinhos do navegador e depois em “Instalar aplicativo”.</p></div><button class="botao largo" data-a="fechar-folha" style="margin-top:20px">Entendi</button>`); return;
      case "suporte-whats": {
        const msg = encodeURIComponent("Olá! Meu acesso à área de membros da mentoria foi bloqueado. Meu nome é " + (S.nomeDigitado || "") + ". Pode me ajudar a desbloquear?");
        if (!SUPORTE_WHATS) { aviso("O número do suporte ainda não foi configurado."); return; }
        window.open("https://wa.me/" + SUPORTE_WHATS + "?text=" + msg, "_blank", "noopener");
        return;
      }
      case "sair": folha(`<h2 class="serif">Sair da área de membros?</h2><p class="apoio" style="margin-top:8px">Para entrar de novo, use seu nome e seu código.</p><div style="display:grid;gap:10px;margin-top:18px"><button class="botao" data-a="sair-sim">Sair</button><button class="botao-2" data-a="fechar-folha">Continuar aqui</button></div>`); return;
      case "sair-sim": {
        camada.innerHTML = ""; pararVideo();
        void api.sair().finally(() => {
          S = ini(); S.carregando = false; S.saiu = true; D = null; ultimaTela = "";
          document.documentElement.classList.remove("trava-rolagem"); render();
          try { window.close(); } catch { /* o navegador não deixa */ }
        });
        return;
      }
      case "entrar-de-novo": S.saiu = false; break;
      case "notif-ativar": ativarNotif(); return;
      case "notif-depois": camada.innerHTML = ""; void api.adiarAvisoNotificacao().catch(() => {}); return;
      default: return;
    }
    render();
  }
  async function enviar(f, form) {
    if (f === "entrar") {
      const n = form.nome.value.trim(), c = form.codigo.value.trim();
      S.nomeDigitado = n; S.codigoDigitado = c;
      if (!n) { S.erroEntrada = "Escreva o seu nome."; S.erroCampo = "nome"; }
      else if (!c) { S.erroEntrada = "Escreva o seu código."; S.erroCampo = "codigo"; }
      else {
        S.erroEntrada = ""; S.erroCampo = ""; S.entrando = true; render();
        const r = await api.entrar(n, c);
        // Conta travada (erros demais) ou suspensa: quem diz é o banco.
        if (!r.ok && (r.falha.erro === "conta_travada" || r.falha.erro === "conta_bloqueada")) { S.entrando = false; S.erroEntrada = ""; S.bloqueado = r.falha.mensagem; render(); return; }
        if (!r.ok) {
          // O banco diz onde ela errou: no nome ou no código.
          S.entrando = false; S.erroEntrada = r.falha.mensagem; S.erroCampo = r.falha.erro === "nome_invalido" ? "nome" : r.falha.erro === "codigo_invalido" ? "codigo" : "";
          render(); const alvo = document.getElementById(S.erroCampo === "nome" ? "nome" : "codigo"); if (alvo) { alvo.focus(); alvo.select && alvo.select(); } return;
        }
        try { await iniciarSessao(); } catch { S.entrando = false; S.erroEntrada = "Não foi possível abrir sua área agora. Tente de novo."; render(); }
        return;
      }
      render();
      document.getElementById(S.erroCampo === "nome" ? "nome" : "codigo")?.focus();
      return;
    }
    if (f === "comentar") {
      const t = form.txt.value.trim();
      if (!t) { aviso("Escreva seu comentário antes de enviar."); form.txt.focus(); return; }
      const c = conteudoAtual(); if (!c) return;
      const pos = VID && VID_ID === c.id ? VID.currentTime : 0;
      const btn = form.querySelector("button:not([type])"); if (btn) btn.disabled = true;
      try {
        await api.comentar(c.id, t, pos, S.respondendo || undefined);
        S.rascunho = ""; S.respondendo = null; camada.innerHTML = "";
        S.coms[c.id] = await api.comentariosDaAula(c.id).catch(() => S.coms[c.id] || []); render();
        aviso("Comentário enviado.");
      } catch { if (btn) btn.disabled = false; aviso("Não conseguimos enviar agora. Tente de novo."); }
    }
  }
  async function iniciarSessao() {
    await carregar();
    void api.marcarPresenca().catch(() => {});
    const nomeTela = S.nome; S.entrou = true; S.carregando = false; S.entrando = false; S.erroEntrada = ""; S.nome = nomeTela;
    render(); marcarHistorico();
    void depoisDeEntrar();
  }

  /* ---------- notificações (0092) ---------- */
  // O celular é inscrito no banco; o "Agora não" também fica no banco. Aqui só se pergunta ao aparelho se o aviso está ligado.
  const NOTIF = () => (D && D.inicio && D.inicio.notif) || null;
  const pushOk = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const chaveVapid = () => { const b = api.VAPID_PUBLICA.replace(/-/g, "+").replace(/_/g, "/"); const r = atob(b + "=".repeat((4 - (b.length % 4)) % 4)); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
  const regSW = async () => (await navigator.serviceWorker.getRegistration()) || navigator.serviceWorker.register("/sw.js");
  async function inscrever() {
    const reg = await regSW(); await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid() }));
    await api.salvarInscricaoPush(sub); S.notifOn = true;
  }
  async function depoisDeEntrar() {
    try { navigator.clearAppBadge && navigator.clearAppBadge(); } catch { /* */ }
    if (S.abrirPend) { const v = S.abrirPend; S.abrirPend = null; abrirAlvo(v); }
    if (pushOk() && Notification.permission === "granted") { try { await inscrever(); } catch { S.notifOn = false; } }
    if (S.tela === "perfil") render();
    // Na prévia do painel (Configurações → Início) o pop-up não aparece.
    const n = NOTIF(); if (PREVIA || !n || !n.ativo || S.notifOn || S.notifVisto || S.tela !== "inicio") return;
    S.notifVisto = true;
    let adiado = null; try { adiado = await api.meuAvisoNotificacao(); } catch { return; }
    if (adiado && n.intervalo > 0 && Date.now() - new Date(adiado).getTime() < n.intervalo * 864e5) return;
    if (camada.innerHTML) return;
    camada.innerHTML = popNotif(n);
  }
  function ativarNotif() {
    if (!pushOk()) {
      camada.innerHTML = "";
      folha(`<h2 class="serif">Ativar os avisos</h2><div style="margin-top:14px;font-size:1.0625rem;line-height:1.7;color:var(--texto-2)"><p><b style="color:var(--texto)">No iPhone:</b> primeiro coloque o app na tela de início — toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra o app pelo ícone e toque em ativar de novo.</p><p style="margin-top:12px"><b style="color:var(--texto)">No Android:</b> abra pelo Chrome e toque em ativar de novo.</p></div><button class="botao largo" data-a="fechar-folha" style="margin-top:20px">Entendi</button>`); return;
    }
    const pedido = Notification.requestPermission();
    void pedido.then(async (r) => {
      camada.innerHTML = "";
      if (r !== "granted") {
        folha(`<h2 class="serif">Avisos bloqueados</h2><p class="apoio" style="margin-top:8px">O celular está bloqueando os avisos deste app. Para liberar: abra os Ajustes do celular, procure o app (ou o navegador), toque em Notificações e ative. Depois toque em ativar de novo.</p><button class="botao largo" data-a="fechar-folha" style="margin-top:20px">Entendi</button>`); return;
      }
      try { await inscrever(); render(); aviso("Pronto! Você vai receber os avisos das novas aulas."); }
      catch { aviso("Não conseguimos ativar agora. Tente de novo."); }
    });
  }
  // Tocar no aviso abre direto no que foi avisado; lá vale a regra de sempre.
  function abrirAlvo(v) {
    if (!D || !v) return;
    const [tipo, id] = String(v).split(":");
    if (tipo === "modulos" || tipo === "presentes") { acao("ir", { v: tipo }); render(); return; }
    if (tipo === "modulo") { const m = MODS().findIndex((x) => x.id === id); if (m >= 0) acao("modulo", { m }); else acao("ir", { v: "modulos" }); render(); return; }
    if (tipo === "aula") {
      let m = -1, i = -1; MODS().forEach((md, k) => { const j = md.aulas.findIndex((x) => x.id === id); if (j >= 0) { m = k; i = j; } });
      if (m < 0) { acao("ir", { v: "modulos" }); render(); aviso("Esta aula ainda não foi liberada para você."); return; }
      const ea = estadoAula(m, i);
      if (!ea.fech) { acao("aula", { m, i }); render(); return; }
      acao("modulo", { m }); render();
      if (ea.seq) {
        let k = i - 1; while (k > 0 && MODS()[m].aulas[k].bloq) k--;
        folha(`<h2 class="serif">Aula bloqueada</h2><p class="apoio" style="margin-top:8px">Para assistir a ${h(lA(MODS()[m], i))}, conclua antes a ${h(lA(MODS()[m], k))}.</p><div style="display:grid;gap:10px;margin-top:18px"><button class="botao" data-a="aula" data-m="${m}" data-i="${k}">Ir para a ${h(lA(MODS()[m], k))}</button><button class="botao-2" data-a="fechar-folha">Agora não</button></div>`);
      } else aviso("Esta aula será liberada em breve.");
      return;
    }
    if (tipo === "presente") {
      let alvo = null; CATS().forEach((c, ci) => c.cursos.forEach((cu, i) => cu.itens.forEach((t, j) => { if (t.id === id) alvo = ci + "-" + i + "-" + j; })));
      if (alvo) { acao("presente", { v: alvo }); render(); } else { acao("ir", { v: "presentes" }); render(); }
    }
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { if (e.data && e.data.abrir) { if (S.entrou) abrirAlvo(e.data.abrir); else S.abrirPend = e.data.abrir; } });
  try { const q = new URLSearchParams(location.search); if (q.get("abrir")) { S.abrirPend = q.get("abrir"); q.delete("abrir"); history.replaceState(history.state, "", location.pathname + (q.toString() ? "?" + q : "")); } } catch { /* */ }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b || b.disabled || !raiz.contains(b)) return;
    acao(b.dataset.a, Object.assign({}, b.dataset, { _alvo: e.target, _el: b, _x: e.clientX }));
    marcarHistorico();
  });
  // Trilha do vídeo: tocar ou arrastar leva ao ponto. A área de toque é
  // maior que a linha (ver .trilha::before no CSS).
  let arrastando = null;
  const irPara = (tr, x) => {
    if (!VID || !Number.isFinite(VID.duration)) return;
    const r = tr.getBoundingClientRect(), f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    comecarCarga(); VID.currentTime = f * VID.duration; atualizarControles();
  };
  document.addEventListener("pointerdown", (e) => { const tr = e.target.closest(".trilha"); if (!tr || !raiz.contains(tr)) return; e.preventDefault(); arrastando = tr; try { tr.setPointerCapture(e.pointerId); } catch { /* */ } irPara(tr, e.clientX); });
  document.addEventListener("pointermove", (e) => { if (arrastando) irPara(arrastando, e.clientX); });
  document.addEventListener("pointerup", () => { if (arrastando) { arrastando = null; gravarPosicao(true); } });
  document.addEventListener("pointercancel", () => { arrastando = null; });

  document.addEventListener("submit", (e) => { const f = e.target.closest("form[data-f]"); if (!f || !raiz.contains(f)) return; e.preventDefault(); void enviar(f.dataset.f, f); });
  document.addEventListener("input", (e) => { if (e.target.id === "txtCom") S.rascunho = e.target.value; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && camada.innerHTML) camada.innerHTML = ""; });
  // Saindo do app no meio da aula, a posição vai junto.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") gravarPosicao(true); });
  window.addEventListener("pagehide", () => gravarPosicao(true));

  render();
  void (async () => {
    try {
      if (await api.temSessao()) { await iniciarSessao(); return; }
    } catch { /* sessão vencida: volta para a entrada */ }
    S.carregando = false; render();
  })();
}
