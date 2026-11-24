/**
 * CENTRAL (Painel Geral) — souaion.com/central (0145).
 *
 * De onde se entra em todos os painéis. O login é o MESMO dos painéis
 * (mesma conta, mesma sessão do Supabase: entrou aqui, entra no AION ADM).
 * Cards vêm da tabela `paineis`; o acesso de cada pessoa, de `acessos_painel`
 * (lido por `meus_paineis()`). Colaboradores e Histórico: só o dono e quem
 * for Admin da Central. Tudo que cria, convida, bloqueia ou remove passa pela
 * Edge Function `colaboradores` (a chave de serviço nunca vem para cá).
 */
import "./central.css";
import { supabase, chavePublica } from "../data/supabase";
import { FUNCOES, MENSAGENS_PADRAO } from "../painel/colaboradores";

type Painel = { slug: string; nome: string; descricao: string; icone: string; rota: string; ativo: boolean; ordem: number };
type Meus = { dono: boolean; admin_central: boolean; bloqueado: boolean; paineis: Record<string, { nivel: string; bloqueado: boolean }> };
type Colab = { id: string; nome: string; email: string; funcao: string | null; dono: boolean; eu: boolean; bloqueado: boolean; pendente: boolean; ultimo: string | null; paineis: Record<string, { nivel: string; bloqueado: boolean }> };
type Hist = { id: string; quando: string; ator_nome: string | null; tipo: string; painel_slug: string | null; alvo_nome: string | null; detalhe: string | null };

const URL_SB = import.meta.env.VITE_SUPABASE_URL as string;
const BLOQUEADO = "Seu acesso a este painel foi bloqueado. Fale com o dono do painel.";
const NIVEIS: [string, string][] = [["", "Sem acesso"], ["ver", "Só ver"], ["editar", "Editar"], ["admin", "Admin do painel"]];
const NOME_NIVEL: Record<string, string> = { ver: "Só ver", editar: "Editar", admin: "Admin" };
const h = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const centralUrl = () => location.origin + "/central";
const dataHora = (iso: string | null) => { if (!iso) return "—"; const d = new Date(iso); const z = (n: number) => String(n).padStart(2, "0"); return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}, ${z(d.getHours())}:${z(d.getMinutes())}`; };
const IC: Record<string, string> = {
  aion: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19L12 5l7 14"/><path d="M8.5 13.5h7"/></svg>`,
  produtos: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z"/><path d="M3.5 12L12 16.5 20.5 12"/><path d="M3.5 16L12 20.5 20.5 16"/></svg>`,
  painel: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17"/></svg>`,
};

export function montar(raiz: HTMLElement) {
  document.title = "PAINEL | AION";
  document.body.classList.add("ce-corpo");
  let tela: "carregando" | "login" | "esqueci" | "novaSenha" | "convite" | "central" = "carregando";
  let aba: "paineis" | "colab" | "hist" = "paineis";
  let erro = "", aviso = "", ocupado = false, mostrar = false;
  let meus: Meus | null = null, paineis: Painel[] = [], nome = "";
  let colabs: Colab[] | null = null, hist: Hist[] | null = null;
  let msgs: Record<string, string> = { ...MENSAGENS_PADRAO };
  const convite = { t: "", nome: "", email: "" };
  type Jan = { tipo: "novo" } | { tipo: "sucesso"; id: string; titulo: string; link: string | null; modelo: string; texto: string } | { tipo: "opcoes"; id: string }
    | { tipo: "dados"; id: string } | { tipo: "paineis"; id: string } | { tipo: "msgs"; aba: string } | { tipo: "confirmar"; id: string; oque: "bloquear" | "remover" };
  let jan: Jan | null = null;
  let f = form0();
  function form0() { return { modo: "link", nome: "", email: "", funcao: "", outro: "", niveis: {} as Record<string, string>, adminCentral: false, msg: { ...msgs } }; }
  const ehGestor = () => !!meus && (meus.dono || meus.admin_central);
  const colab = (id: string) => colabs?.find((x) => x.id === id);

  function toast(t: string) {
    let el = document.getElementById("ceToast");
    if (!el) { el = document.createElement("div"); el.id = "ceToast"; el.className = "ce-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout((el as unknown as { _t: number })._t);
    (el as unknown as { _t: number })._t = window.setTimeout(() => { el!.hidden = true; }, 3800);
  }
  async function chamar(nomeFn: string, corpo: unknown, publica = false): Promise<Record<string, unknown>> {
    const { data } = await supabase.auth.getSession();
    const tk = publica ? chavePublica : data.session?.access_token;
    if (!tk) throw new Error("Entre de novo.");
    const r = await fetch(`${URL_SB}/functions/v1/${nomeFn}`, { method: "POST", headers: { Authorization: `Bearer ${tk}`, apikey: chavePublica, "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(j?.mensagem || "Não foi possível concluir agora."));
    return j;
  }
  function traduzir(m: string) {
    if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/banned/i.test(m)) return BLOQUEADO;
    if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Aguarde alguns minutos.";
    return "Não foi possível entrar agora. Tente de novo.";
  }

  /* ---------- carregar ---------- */
  async function abrir() {
    const [m, p, pf] = await Promise.all([supabase.rpc("meus_paineis"), supabase.from("paineis").select("*").order("ordem"), supabase.auth.getUser()]);
    if (m.error || !m.data) { await supabase.auth.signOut({ scope: "local" }); tela = "login"; erro = "Não foi possível abrir a Central. Entre de novo."; return; }
    meus = m.data as Meus;
    if (meus.bloqueado) { await supabase.auth.signOut({ scope: "local" }); tela = "login"; erro = BLOQUEADO; return; }
    paineis = (p.data ?? []) as Painel[];
    const { data: perfil } = await supabase.from("profiles").select("nome").eq("id", pf.data.user?.id ?? "").maybeSingle();
    nome = String(perfil?.nome || pf.data.user?.email || "");
    tela = "central";
    void supabase.rpc("registrar_entrada_painel", { p_slug: "central" }).then(() => {});
    const r = await supabase.from("configuracoes").select("mensagens_convite").limit(1).maybeSingle();
    if (r.data?.mensagens_convite) msgs = { ...MENSAGENS_PADRAO, ...(r.data.mensagens_convite as Record<string, string>) };
  }
  async function carregarColabs() { const r = await supabase.rpc("central_colaboradores"); colabs = (r.data ?? []) as Colab[]; desenhar(); }
  async function carregarHist() { const r = await supabase.from("historico_central").select("*").order("quando", { ascending: false }).limit(300); hist = (r.data ?? []) as Hist[]; desenhar(); }

  /* ---------- telas ---------- */
  const campoSenha = (n: string, id: string, ac: string) => `<input class="ce-campo" type="${mostrar ? "text" : "password"}" name="${n}" id="${id}" autocomplete="${ac}" required />`;
  function telaLogin() {
    const msg = (erro ? `<p class="ce-erro" role="alert">${h(erro)}</p>` : "") + (aviso ? `<p class="ce-ok" role="status">${h(aviso)}</p>` : "");
    const mostrarSenha = `<label class="ce-mostrar"><input type="checkbox" data-c="mostrar" ${mostrar ? "checked" : ""} /> Mostrar senha</label>`;
    let corpo = "";
    if (tela === "esqueci") corpo = `<form data-f="esqueci"><h1>PAINEL | AION</h1><p class="ce-sub">Informe seu e-mail para receber o link de nova senha.</p>
      <label><span>E-mail</span><input class="ce-campo" type="email" name="email" autocomplete="email" required /></label>${msg}
      <button class="ce-bt laranja" ${ocupado ? "disabled" : ""}>${ocupado ? "Enviando…" : "Enviar link"}</button><button type="button" class="ce-link" data-a="tela" data-v="login">Voltar para a entrada</button></form>`;
    else if (tela === "novaSenha") corpo = `<form data-f="novaSenha"><h1>PAINEL | AION</h1><p class="ce-sub">Crie a sua nova senha (pelo menos 8 caracteres).</p>
      <label><span>Nova senha</span>${campoSenha("senha", "ceSenha", "new-password")}</label><label><span>Repita a senha</span>${campoSenha("senha2", "ceSenha2", "new-password")}</label>${mostrarSenha}${msg}
      <button class="ce-bt laranja" ${ocupado ? "disabled" : ""}>${ocupado ? "Salvando…" : "Salvar senha e entrar"}</button></form>`;
    else if (tela === "convite") corpo = !convite.email ? `<div><h1>PAINEL | AION</h1>${msg || `<p class="ce-sub">Abrindo o seu convite…</p>`}<button type="button" class="ce-link" data-a="tela" data-v="login">Ir para a entrada</button></div>`
      : `<form data-f="convite"><h1>PAINEL | AION</h1><p class="ce-sub">Olá, ${h(convite.nome.split(/\s+/)[0])}! Crie sua senha.</p><p class="ce-acesso">Seu acesso: <b>${h(convite.email)}</b></p>
      <label><span>Senha</span>${campoSenha("senha", "ceSenha", "new-password")}</label><label><span>Repita a senha</span>${campoSenha("senha2", "ceSenha2", "new-password")}</label>${mostrarSenha}${msg}
      <button class="ce-bt laranja" ${ocupado ? "disabled" : ""}>${ocupado ? "Criando…" : "Criar senha e entrar"}</button></form>`;
    else corpo = `<form data-f="login"><h1>PAINEL | AION</h1><p class="ce-sub">Entre com seu e-mail e sua senha.</p>
      <label><span>E-mail</span><input class="ce-campo" type="email" name="email" id="ceEmail" autocomplete="email" required /></label>
      <label><span>Senha</span>${campoSenha("senha", "ceSenha", "current-password")}</label>${mostrarSenha}${msg}
      <button class="ce-bt laranja" ${ocupado ? "disabled" : ""}>${ocupado ? "Entrando…" : "Entrar"}</button><button type="button" class="ce-link" data-a="tela" data-v="esqueci">Esqueci minha senha</button></form>`;
    return `<main class="ce-login"><div class="ce-caixa">${corpo}</div></main>`;
  }
  function telaPaineis() {
    const visiveis = paineis.filter((p) => meus!.dono || (meus!.paineis[p.slug] && !meus!.paineis[p.slug].bloqueado) || (!p.ativo && ehGestor()));
    if (!visiveis.length) return `<p class="ce-vazio">Você ainda não tem acesso a nenhum painel. Fale com o dono do painel.</p>`;
    return `<div class="ce-cards">${visiveis.map((p) => {
      const pode = p.ativo && p.rota && (meus!.dono || (meus!.paineis[p.slug] && !meus!.paineis[p.slug].bloqueado));
      return `<article class="ce-card${p.ativo ? "" : " breve"}"><span class="ce-ic">${IC[p.icone] || IC.painel}</span><h2>${h(p.nome)}</h2><p>${h(p.descricao)}</p>
        ${pode ? `<a class="ce-bt laranja" href="${h(p.rota)}">Entrar →</a>` : `<span class="ce-breve">Em breve</span>`}</article>`;
    }).join("")}</div>`;
  }
  function chipsPaineis(c: Colab) {
    if (c.dono) return `<span class="ce-chip">Todos (dono)</span>`;
    const L = paineis.filter((p) => c.paineis[p.slug]).map((p) => { const a = c.paineis[p.slug]; return `<span class="ce-chip${a.bloqueado ? " verm" : ""}">${h(p.nome)} · ${a.bloqueado ? "bloqueado" : NOME_NIVEL[a.nivel] || a.nivel}</span>`; });
    if (c.paineis.central?.nivel === "admin") L.unshift(`<span class="ce-chip laranja">Admin da Central</span>`);
    return L.join("") || `<span class="ce-chip cinza">Nenhum</span>`;
  }
  function telaColab() {
    if (!colabs) { void carregarColabs(); return `<p class="ce-vazio">Carregando…</p>`; }
    const st = (c: Colab) => c.bloqueado ? `<span class="ce-st verm">Bloqueado</span>` : c.pendente && !c.dono ? `<span class="ce-st amar">Convite pendente</span>` : `<span class="ce-st verde">Ativo</span>`;
    return `<div class="ce-cab2"><p>Quem pode entrar na Central e em quais painéis.</p><span><button type="button" class="ce-bt" data-a="msgs">Editar mensagens</button><button type="button" class="ce-bt laranja" data-a="novo">+ Adicionar colaborador</button></span></div>
      <div class="ce-tab-w"><table class="ce-tab"><thead><tr><th>Nome / e-mail</th><th>Função</th><th>Painéis que acessa</th><th>Status</th><th>Último acesso</th><th><span class="ce-sr">Opções</span></th></tr></thead><tbody>
      ${colabs.map((c) => `<tr><td><b>${h(c.nome)}</b>${c.dono ? ` <span class="ce-chip laranja">dono</span>` : ""}${c.eu ? ` <span class="ce-chip cinza">você</span>` : ""}<small>${h(c.email)}</small></td><td>${h(c.funcao || "—")}</td><td><span class="ce-chips">${chipsPaineis(c)}</span></td><td>${st(c)}</td><td>${c.pendente && !c.dono ? "—" : h(dataHora(c.ultimo))}</td>
        <td><button type="button" class="ce-pts" data-a="opcoes" data-id="${c.id}" aria-label="Opções de ${h(c.nome)}">⋯</button></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  const TIPO_HIST: Record<string, string> = { entrada: "Entrou", criou: "Cadastrou", bloqueou: "Bloqueou", desbloqueou: "Desbloqueou", removeu: "Removeu", acesso: "Mudou o acesso de" };
  function telaHist() {
    if (!hist) { void carregarHist(); return `<p class="ce-vazio">Carregando…</p>`; }
    const nomeP = (s: string | null) => s === "central" ? "Central" : paineis.find((p) => p.slug === s)?.nome || s || "—";
    return `<div class="ce-tab-w"><table class="ce-tab"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Painel</th><th>Detalhe</th></tr></thead><tbody>
      ${hist.map((x) => `<tr><td>${h(dataHora(x.quando))}</td><td><b>${h(x.ator_nome || "—")}</b></td><td>${h(TIPO_HIST[x.tipo] || x.tipo)}${x.alvo_nome ? " " + h(x.alvo_nome) : ""}</td><td>${h(x.tipo === "entrada" || x.painel_slug ? nomeP(x.painel_slug) : "—")}</td><td>${h(x.detalhe || "")}</td></tr>`).join("") || `<tr><td colspan="5" class="ce-vazio">Nada registrado ainda.</td></tr>`}
      </tbody></table></div>`;
  }
  function telaCentral() {
    const abas: [string, string][] = [["paineis", "Painéis"], ...(ehGestor() ? [["colab", "Colaboradores"], ["hist", "Histórico"]] as [string, string][] : [])];
    return `<div class="ce-app"><header class="ce-topo"><b class="ce-marca">PAINEL | AION</b><span class="ce-quem">${h(nome)}</span><button type="button" class="ce-bt" data-a="sair">Sair</button></header>
      <main class="ce-main"><h1>Central</h1><p class="ce-sub">Escolha o painel em que você quer entrar.</p>
      ${abas.length > 1 ? `<nav class="ce-abas" aria-label="Seções da Central">${abas.map(([k, t]) => `<button type="button" data-a="aba" data-v="${k}" aria-pressed="${aba === k}">${t}</button>`).join("")}</nav>` : ""}
      ${aba === "colab" && ehGestor() ? telaColab() : aba === "hist" && ehGestor() ? telaHist() : telaPaineis()}</main></div>${janela()}`;
  }

  /* ---------- janelas ---------- */
  const caixa = (titulo: string, sub: string, corpo: string, pe: string) => `<div class="ce-fundo" data-a="fechar-fundo"><div class="ce-jan" role="dialog" aria-modal="true" aria-label="${h(titulo)}">
    <header><div><h2>${h(titulo)}</h2>${sub ? `<p>${h(sub)}</p>` : ""}</div><button type="button" class="ce-x" data-a="fechar" aria-label="Fechar">✕</button></header>
    <div class="ce-jcorpo">${corpo}</div>${pe ? `<footer>${pe}</footer>` : ""}</div></div>`;
  const bt = (t: string, a: string, cls = "laranja", extra = "") => `<button type="button" class="ce-bt ${cls}" data-a="${a}" ${extra}${ocupado ? " disabled" : ""}>${ocupado ? "Aguarde…" : t}</button>`;
  const cancelar = `<button type="button" class="ce-bt" data-a="fechar">Cancelar</button>`;
  function blocoNiveis() {
    return `<p class="ce-rot">Acesso aos painéis</p><div class="ce-niveis">${paineis.map((p) => `<div class="ce-nivel"><span><b>${h(p.nome)}</b>${p.ativo ? "" : ` <em>em breve</em>`}</span><span class="ce-seg" role="radiogroup" aria-label="${h(p.nome)}">${NIVEIS.map(([v, t]) => `<button type="button" data-a="nivel" data-v="${p.slug}|${v}" aria-pressed="${(f.niveis[p.slug] || "") === v}" class="n${v || "0"}">${t}</button>`).join("")}</span></div>`).join("")}</div>
      ${meus?.dono ? `<label class="ce-check"><input type="checkbox" data-c="adminCentral" ${f.adminCentral ? "checked" : ""} /> <span><b>Admin da Central</b> — pode cadastrar, bloquear e mudar o acesso de outros colaboradores (menos o seu). Só você dá ou tira.</span></label>` : ""}`;
  }
  function selFuncao() {
    const extra = f.funcao && f.funcao !== "__outro" && !FUNCOES.includes(f.funcao) ? [f.funcao] : [];
    return `<label><span class="ce-rot">Função (cargo do app AION)</span><select class="ce-campo" data-c="funcao"><option value="">Escolher função</option>${[...FUNCOES, ...extra].map((x) => `<option ${x === f.funcao ? "selected" : ""}>${h(x)}</option>`).join("")}<option value="__outro" ${f.funcao === "__outro" ? "selected" : ""}>Outro…</option></select></label>
      ${f.funcao === "__outro" ? `<label><span class="ce-rot">Qual função?</span><input class="ce-campo" data-c="outro" maxlength="40" value="${h(f.outro)}" /></label>` : ""}`;
  }
  function preencher(modelo: string, c: { nome: string; email: string; paineis?: Colab["paineis"] }, link: string | null) {
    const dash = c.paineis ? paineis.filter((p) => c.paineis![p.slug]).map((p) => p.nome).join(", ") || "Nenhum painel" : "Todos os painéis";
    return modelo.replace(/\{nome\}/g, c.nome).replace(/\{primeiro_nome\}/g, c.nome.split(/\s+/)[0]).replace(/\{email\}/g, c.email)
      .replace(/\{link\}/g, link || centralUrl()).replace(/\{painel\}/g, centralUrl()).replace(/\{dashboards\}/g, dash);
  }
  function janela() {
    if (!jan) return "";
    const j = jan;
    if (j.tipo === "novo") return caixa("Adicionar colaborador", "", `<div class="ce-modo"><button type="button" data-a="modo" data-v="link" aria-pressed="${f.modo === "link"}">Por link</button><button type="button" data-a="modo" data-v="email" aria-pressed="${f.modo === "email"}">Por e-mail</button></div>
      <p class="ce-nota">${f.modo === "link" ? "Você cria o acesso só com nome e e-mail; o sistema gera um link. A pessoa abre, o e-mail já vem preenchido e ela só cria a senha." : "O Supabase manda o convite para o e-mail da pessoa, e ela cria a senha pelo link do e-mail."}</p>
      <div class="ce-duas"><label><span class="ce-rot">Nome</span><input class="ce-campo" data-c="nome" value="${h(f.nome)}" maxlength="80" /></label><label><span class="ce-rot">E-mail</span><input class="ce-campo" type="email" data-c="email" value="${h(f.email)}" /></label></div>
      ${selFuncao()}${blocoNiveis()}`, cancelar + bt(f.modo === "link" ? "Criar e gerar link" : "Enviar convite por e-mail", "criar"));
    if (j.tipo === "sucesso") {
      const c = colab(j.id);
      const linha = (r: string, v: string) => `<div><span class="ce-rot">${r}</span><span class="ce-copia"><input class="ce-campo" value="${h(v)}" readonly /><button type="button" class="ce-bt" data-a="copiar" data-v="${h(v)}">copiar</button></span></div>`;
      return caixa(j.titulo, "", `${linha("Nome", c?.nome || "")}${linha("E-mail", c?.email || "")}${j.link ? linha("Link", j.link) : ""}
        <div class="ce-msgcab"><span class="ce-rot">Mensagem pronta</span><button type="button" class="ce-link" data-a="msgs" data-v="${j.modelo}">Editar mensagens</button></div>
        <textarea class="ce-campo ce-texto" rows="11" data-c="sucesso">${h(j.texto)}</textarea>`, bt("Copiar para e-mail", "copiar-email", "") + bt("Copiar para WhatsApp", "copiar-whats"));
    }
    if (j.tipo === "opcoes") {
      const c = colab(j.id); if (!c) return "";
      const op = (a: string, t: string, d: string, cls = "", v = "") => `<button type="button" class="ce-op ${cls}" data-a="${a}" data-id="${c.id}" data-v="${v}"><b>${t}</b><span>${d}</span></button>`;
      const mexe = !c.dono && !c.eu && (meus!.dono || c.paineis.central?.nivel !== "admin");
      const porPainel = mexe ? paineis.filter((p) => c.paineis[p.slug]).map((p) => op("bloq-painel", (c.paineis[p.slug].bloqueado ? "Desbloquear " : "Bloquear só ") + p.nome, c.paineis[p.slug].bloqueado ? "Volta a entrar neste painel." : "Continua entrando nos outros painéis.", "", p.slug)).join("") : "";
      return caixa(c.nome, c.email + (c.funcao ? " · " + c.funcao : ""), `<div class="ce-ops">
        ${op("dados", "Editar dados", "Nome e função.")}
        ${mexe ? op("paineis", "Editar acesso aos painéis", "Sem acesso, Só ver, Editar ou Admin, painel por painel.") : ""}
        ${mexe ? op(c.bloqueado ? "desbloquear" : "bloquear", c.bloqueado ? "Desbloquear tudo" : "Bloquear tudo", c.bloqueado ? "Volta a entrar em todos os painéis que tem." : "Perde o acesso a tudo na hora, mesmo com o painel aberto.") : ""}
        ${porPainel}
        ${c.dono ? "" : op("reenviar", c.pendente ? "Reenviar convite" : "Copiar mensagem de acesso", c.pendente ? "Gera um link novo (o anterior deixa de valer)." : "Mensagem com o endereço da Central.")}
        ${mexe ? op("remover", "Remover", "Tira a pessoa de todos os painéis e apaga a conta. Não dá para desfazer.", "perigo") : ""}</div>`, "");
    }
    if (j.tipo === "dados") return caixa("Editar dados", colab(j.id)?.email || "", `<label><span class="ce-rot">Nome</span><input class="ce-campo" data-c="nome" value="${h(f.nome)}" maxlength="80" /></label>${selFuncao()}`, cancelar + bt("Salvar", "salvar-dados"));
    if (j.tipo === "paineis") return caixa("Acesso de " + (colab(j.id)?.nome || ""), "Vale na hora, mesmo com o painel aberto.", blocoNiveis(), cancelar + bt("Salvar acesso", "salvar-paineis"));
    if (j.tipo === "msgs") {
      const ex = preencher(f.msg[j.aba] || "", { nome: "Maria Silva", email: "maria@exemplo.com" }, centralUrl() + "#/convite?t=…");
      return caixa("Editar mensagens", "Modelos salvos no banco. Só o dono salva.", `<div class="ce-modo">${[["link", "Convite por link"], ["email", "Convite por e-mail"], ["ja", "Quem já tem acesso"]].map(([k, t]) => `<button type="button" data-a="msg-aba" data-v="${k}" aria-pressed="${j.aba === k}">${t}</button>`).join("")}</div>
        <p class="ce-nota">Variáveis: {nome} {primeiro_nome} {email} {link} {painel} {dashboards}</p><textarea class="ce-campo ce-texto" rows="10" data-c="msg" data-k="${j.aba}">${h(f.msg[j.aba] || "")}</textarea>
        <div class="ce-msgcab"><span class="ce-nota">Prévia com um exemplo:</span><button type="button" class="ce-link" data-a="msg-padrao" data-v="${j.aba}">Voltar ao padrão</button></div><pre class="ce-previa">${h(ex)}</pre>`, cancelar + bt("Salvar mensagens", "msg-salvar"));
    }
    if (j.tipo === "confirmar") {
      const c = colab(j.id); if (!c) return "";
      return j.oque === "bloquear" ? caixa("Bloquear " + c.nome + "?", "", `<p class="ce-txt">A pessoa perde o acesso a tudo na hora, mesmo com o painel aberto. Dá para desbloquear depois.</p>`, cancelar + bt("Bloquear", "bloquear-ok", "verm", `data-id="${c.id}"`))
        : caixa("Remover " + c.nome + "?", "", `<p class="ce-txt">Sai de todos os painéis e a conta é apagada. Não dá para desfazer. O histórico continua.</p>`, cancelar + bt("Remover", "remover-ok", "verm", `data-id="${c.id}"`));
    }
    return "";
  }

  /* ---------- desenhar e ações ---------- */
  function desenhar() {
    raiz.innerHTML = tela === "carregando" ? `<main class="ce-login"><p class="ce-sub">Carregando…</p></main>` : tela === "central" ? telaCentral() : telaLogin();
    const foco = raiz.querySelector<HTMLInputElement>("#ceEmail, #ceSenha"); if (foco && !document.activeElement?.closest("form")) foco.focus();
  }
  async function exec(fn: () => Promise<void>) {
    if (ocupado) return; ocupado = true; desenhar();
    try { await fn(); } catch (e) { toast(e instanceof Error ? e.message : "Não foi possível concluir agora."); }
    ocupado = false; desenhar();
  }
  async function copiar(t: string, ok: string) { try { await navigator.clipboard.writeText(t); toast(ok); } catch { toast("Não foi possível copiar. Selecione e copie à mão."); } }
  async function abrirAcesso(c: Colab, titulo: string, linkPronto?: string | null) {
    let link = linkPronto ?? null;
    if (linkPronto === undefined && c.pendente) { const r = await chamar("colaboradores", { acao: "gerar_link", id: c.id, destino: "central" }); link = (r.link as string) || null; }
    const modelo = c.pendente ? (link ? "link" : "email") : "ja";
    jan = { tipo: "sucesso", id: c.id, titulo, link, modelo, texto: preencher(msgs[modelo], c, link) };
  }
  const funcaoForm = () => f.funcao === "__outro" ? f.outro.trim().slice(0, 40) : f.funcao;
  /** Nível no AION ADM → tipo de acesso dele (o detalhe por tela fica no próprio AION ADM). */
  const acessoAion = () => { const n = f.niveis["aion-adm"] || ""; return n === "admin" ? "admin" : n === "ver" ? "leitura" : "personalizado"; };
  const areasAion = () => (f.niveis["aion-adm"] === "editar" ? Object.fromEntries(["inicio", "alunas", "engajamento", "comentarios", "cursos", "layout", "config", "lixeira", "reduzir"].map((a) => [a, "editar"])) : {});

  function acao(a: string, d: DOMStringMap, el: HTMLElement, alvo: EventTarget | null) {
    switch (a) {
      case "tela": tela = d.v as typeof tela; erro = ""; aviso = ""; break;
      case "aba": aba = d.v as typeof aba; if (aba === "colab") colabs = null; if (aba === "hist") hist = null; break;
      case "sair": void supabase.auth.signOut().then(() => { meus = null; tela = "login"; desenhar(); }); return;
      case "fechar": jan = null; break;
      case "fechar-fundo": if (alvo !== el) return; jan = null; break;
      case "novo": f = form0(); f.niveis = { "aion-adm": "ver" }; jan = { tipo: "novo" }; break;
      case "modo": f.modo = d.v!; break;
      case "nivel": { const [s, v] = d.v!.split("|"); f.niveis[s] = v; break; }
      case "opcoes": jan = { tipo: "opcoes", id: d.id! }; break;
      case "dados": { const c = colab(d.id!); if (c) { f = form0(); f.nome = c.nome; f.funcao = c.funcao || ""; jan = { tipo: "dados", id: c.id }; } break; }
      case "paineis": { const c = colab(d.id!); if (c) { f = form0(); f.niveis = Object.fromEntries(Object.entries(c.paineis).filter(([k]) => k !== "central").map(([k, v]) => [k, v.nivel])); f.adminCentral = c.paineis.central?.nivel === "admin"; jan = { tipo: "paineis", id: c.id }; } break; }
      case "bloquear": jan = { tipo: "confirmar", id: d.id!, oque: "bloquear" }; break;
      case "remover": jan = { tipo: "confirmar", id: d.id!, oque: "remover" }; break;
      case "bloquear-ok": void exec(async () => { await chamar("colaboradores", { acao: "bloquear", id: d.id }); jan = null; toast("Bloqueado. Vale na hora."); await carregarColabs(); }); return;
      case "desbloquear": void exec(async () => { await chamar("colaboradores", { acao: "ativar", id: d.id }); jan = null; toast("Desbloqueado."); await carregarColabs(); }); return;
      case "bloq-painel": { const c = colab(d.id!); const b = !c?.paineis[d.v!]?.bloqueado; void exec(async () => { await chamar("colaboradores", { acao: "bloquear_painel", id: d.id, slug: d.v, bloqueado: b }); jan = null; toast(b ? "Bloqueado neste painel." : "Desbloqueado neste painel."); await carregarColabs(); }); return; }
      case "remover-ok": void exec(async () => { await chamar("colaboradores", { acao: "remover", id: d.id }); jan = null; toast("Colaborador removido."); await carregarColabs(); }); return;
      case "reenviar": { const c = colab(d.id!); if (c) void exec(async () => { await abrirAcesso(c, "Acesso de " + c.nome); }); return; }
      case "copiar": void copiar(d.v || "", "Copiado."); return;
      case "copiar-whats": case "copiar-email": {
        const t = raiz.querySelector<HTMLTextAreaElement>('[data-c="sucesso"]')?.value || "";
        void copiar(a === "copiar-whats" ? t.replace(/^PAINEL \| AION/, "*PAINEL | AION*") : t, a === "copiar-whats" ? "Copiado para colar no WhatsApp." : "Copiado para colar no e-mail."); return;
      }
      case "msgs": f = form0(); jan = { tipo: "msgs", aba: d.v || "link" }; break;
      case "msg-aba": if (jan?.tipo === "msgs") jan.aba = d.v!; break;
      case "msg-padrao": f.msg[d.v!] = MENSAGENS_PADRAO[d.v!]; break;
      case "msg-salvar": void exec(async () => {
        const r = await supabase.from("configuracoes").select("id").limit(1).maybeSingle(); if (!r.data) throw new Error("Configurações não encontradas.");
        const { error } = await supabase.from("configuracoes").update({ mensagens_convite: f.msg }).eq("id", r.data.id).select("id").single(); if (error) throw new Error(meus?.dono ? "Não foi possível salvar." : "Só o dono salva as mensagens.");
        msgs = { ...MENSAGENS_PADRAO, ...f.msg }; jan = null; toast("Mensagens salvas.");
      }); return;
      case "salvar-dados": { const j = jan; if (j?.tipo !== "dados") break; void exec(async () => {
        if (!f.nome.trim()) throw new Error("Escreva o nome.");
        await chamar("colaboradores", { acao: "salvar_nome", id: j.id, nome: f.nome.trim() });
        const c = colab(j.id); if (c && !c.dono && !c.eu && funcaoForm() !== (c.funcao || "")) await chamar("colaboradores", { acao: "salvar_funcao", id: j.id, funcao: funcaoForm() });
        jan = null; toast("Dados salvos."); await carregarColabs(); }); return; }
      case "salvar-paineis": { const j = jan; if (j?.tipo !== "paineis") break; void exec(async () => {
        const pn: Record<string, string> = {}; paineis.forEach((p) => { pn[p.slug] = f.niveis[p.slug] || ""; });
        await chamar("colaboradores", { acao: "salvar_paineis", id: j.id, paineis: pn, ...(meus?.dono ? { admin_central: f.adminCentral } : {}) });
        jan = null; toast("Acesso salvo. Já vale para a pessoa."); await carregarColabs(); }); return; }
      case "criar": void exec(async () => {
        if (!f.nome.trim()) throw new Error("Escreva o nome.");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) throw new Error("Confira o e-mail.");
        const pn: Record<string, string> = {}; paineis.forEach((p) => { pn[p.slug] = f.niveis[p.slug] || ""; });
        const r = await chamar("colaboradores", { acao: "convidar", destino: "central", modo: f.modo, nome: f.nome.trim(), email: f.email.trim(), funcao: funcaoForm() || null, acesso: acessoAion(), areas: areasAion(), produtos: null, paineis: pn, ...(meus?.dono && f.adminCentral ? { admin_central: true } : {}) });
        await carregarColabs(); const c = colab(String(r.id));
        if (c) await abrirAcesso(c, "Cadastro realizado com sucesso", (r.link as string) || null); else jan = null;
      }); return;
      default: return;
    }
    desenhar();
  }

  raiz.addEventListener("click", (ev) => { const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-a]"); if (el && raiz.contains(el)) { ev.preventDefault(); acao(el.dataset.a!, el.dataset, el, ev.target); } });
  raiz.addEventListener("input", (ev) => {
    const t = ev.target as HTMLInputElement; const k = t.dataset.c; if (!k) return;
    if (k === "nome" || k === "email" || k === "outro") (f as Record<string, unknown>)[k] = t.value;
    else if (k === "msg") { f.msg[t.dataset.k!] = t.value; const pv = raiz.querySelector(".ce-previa"); if (pv) pv.textContent = preencher(t.value, { nome: "Maria Silva", email: "maria@exemplo.com" }, centralUrl() + "#/convite?t=…"); }
    else if (k === "sucesso" && jan?.tipo === "sucesso") jan.texto = t.value;
  });
  raiz.addEventListener("change", (ev) => {
    const t = ev.target as HTMLInputElement; const k = t.dataset.c; if (!k) return;
    if (k === "mostrar") { mostrar = t.checked; raiz.querySelectorAll<HTMLInputElement>('input[name="senha"], input[name="senha2"]').forEach((i) => { i.type = mostrar ? "text" : "password"; }); }
    else if (k === "funcao") { f.funcao = t.value; desenhar(); }
    else if (k === "adminCentral") f.adminCentral = t.checked;
  });
  raiz.addEventListener("submit", (ev) => {
    ev.preventDefault(); if (ocupado) return;
    const form = ev.target as HTMLFormElement, v = (n: string) => ((form.elements.namedItem(n) as HTMLInputElement | null)?.value || "");
    const tipo = form.dataset.f; erro = ""; aviso = "";
    void exec(async () => {
      if (tipo === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: v("email").trim().toLowerCase(), password: v("senha") });
        if (error) { erro = traduzir(error.message); return; }
        await abrir();
      } else if (tipo === "esqueci") {
        await supabase.auth.resetPasswordForEmail(v("email").trim().toLowerCase(), { redirectTo: centralUrl() });
        aviso = "Se este e-mail tiver acesso, o link chega em alguns minutos. Veja também o spam.";
      } else if (tipo === "novaSenha" || tipo === "convite") {
        if (v("senha").length < 8) { erro = "A senha precisa ter pelo menos 8 caracteres."; return; }
        if (v("senha") !== v("senha2")) { erro = "As duas senhas não são iguais."; return; }
        if (tipo === "novaSenha") {
          const { error } = await supabase.auth.updateUser({ password: v("senha") }); if (error) { erro = /different|same/i.test(error.message) ? "Escolha uma senha diferente da anterior." : "Não foi possível salvar a senha."; return; }
          try { await chamar("conta-equipe", { acao: "senha_definida" }); } catch { /* segue */ }
        } else {
          const r = await chamar("entrar", { acao: "convite_aceitar", t: convite.t, senha: v("senha") }, true);
          const { error } = await supabase.auth.signInWithPassword({ email: String(r.email || convite.email), password: v("senha") }); if (error) { erro = traduzir(error.message); return; }
        }
        history.replaceState(null, "", location.pathname); await abrir();
      }
    });
  });

  void (async () => {
    const t = /^#\/convite\?t=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1];
    const { data } = await supabase.auth.getSession();
    if (t) {
      if (data.session) await supabase.auth.signOut({ scope: "local" });
      tela = "convite"; convite.t = t;
      try { const r = await chamar("entrar", { acao: "convite_ver", t }, true); convite.nome = String(r.nome || ""); convite.email = String(r.email || ""); } catch (e) { erro = e instanceof Error ? e.message : "Este link não vale mais."; }
    } else if (data.session && /type=(recovery|invite)/.test(location.hash)) tela = "novaSenha";
    else if (data.session) {
      const rf = await supabase.auth.refreshSession();
      if (rf.error) { await supabase.auth.signOut({ scope: "local" }); tela = "login"; if (/banned/i.test(rf.error.message)) erro = BLOQUEADO; }
      else await abrir();
    } else tela = "login";
    desenhar();
  })();
  desenhar();
}
