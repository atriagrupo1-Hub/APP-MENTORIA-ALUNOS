/**
 * Colaboradores (0144) — a gestão da equipe do Atria Track trazida para o AION.
 * Só o dono principal vê. Tudo que grava passa pela Edge Function
 * `colaboradores`, que confere de novo no servidor; o banco confere as áreas
 * com `painel_edita_area()`.
 *
 * O painel chama: `tela()` (conteúdo da aba), `janela()` (por cima de tudo),
 * `acao(a, d, el)` (cliques com data-a="cx-…"; devolve true se tratou) e
 * `campo(el)` (digitação nos campos data-cx, para não perder o que foi
 * digitado quando a tela redesenha).
 */

export type ColabDeps = {
  h: (s: unknown) => string;
  toast: (t: string) => void;
  render: () => void;
  chamar: (nome: string, corpo: unknown) => Promise<Record<string, unknown>>;
  rpc: (nome: string, args?: Record<string, unknown>) => Promise<unknown>;
  lerMensagens: () => Promise<Record<string, string> | null>;
  salvarMensagens: (m: Record<string, string>) => Promise<void>;
  produtos: () => { id: string; nome: string }[];
  /** + Novo colaborador: abre a janela de 3 etapas do painel (perfil, comentários, acesso). */
  novoMembro: () => void;
};

type Colab = {
  id: string; nome: string; email: string; papel: string; acesso: string | null; areas: Record<string, string>;
  funcao: string | null; produtos: string[] | null; bloqueado: boolean; pendente: boolean; ultimo: string | null; dono: boolean; eu: boolean;
};

export const AREAS_GRUPOS: [string, [string, string][]][] = [
  ["Visão geral", [["inicio", "Visão geral e Central"]]],
  ["Alunos", [["alunas", "Alunos"], ["engajamento", "Engajamento"], ["comentarios", "Comentários"]]],
  ["Conteúdos", [["cursos", "Todos os produtos"], ["layout", "Categorias"]]],
  ["Administração", [["config", "Configurações do app"], ["lixeira", "Lixeira"], ["reduzir", "Reduzir PDF"]]],
];
const TODAS_AREAS = AREAS_GRUPOS.flatMap(([, l]) => l.map(([k]) => k));
const RELATORIOS = new Set(["inicio", "engajamento"]);
export const FUNCOES = ["Gestor de tráfego", "Copywriter", "Editor de vídeo", "Designer", "Suporte", "Comercial", "Sócio", "Financeiro", "Gestor"];
export const TIPOS: [string, string, string][] = [
  ["admin", "Administrador", "Vê e altera tudo do painel. Não vê Colaboradores nem o Histórico (só o dono)."],
  ["personalizado", "Personalizado", "Você escolhe, tela por tela, o que a pessoa não vê, só vê ou pode editar."],
  ["leitura", "Só leitura", "Vê todas as telas, não altera nada."],
  ["conteudo", "Só conteúdo", "Vê e edita Todos os produtos e Categorias. O resto fica fechado."],
];
const NOME_TIPO: Record<string, string> = { admin: "Administrador", personalizado: "Personalizado", leitura: "Só leitura", conteudo: "Só conteúdo" };

export const MENSAGENS_PADRAO: Record<string, string> = {
  link: "PAINEL | AION\n\nNome: {nome}\nE-mail: {email}\nLink: {link}\n\nNo link acima, crie a sua senha para acessar o painel. O seu e-mail já aparece lá; é só criar a senha e entrar.\nO link vale por 7 dias e funciona uma vez só.\n\nDepois, é só entrar em {painel} com o seu e-mail e a senha que você criou.",
  email: "PAINEL | AION\n\nNome: {nome}\nE-mail: {email}\n\nO seu acesso foi enviado por e-mail. Acesse o seu e-mail ({email}) e cadastre a sua senha para acessar o painel.\nNão achou? Veja também a caixa de spam/lixo eletrônico.\n\nDepois, é só entrar em {painel} com o seu e-mail e a senha que você criou.",
  ja: "PAINEL | AION\n\nNome: {nome}\nE-mail: {email}\nLink: {painel}\n\nEntre com o seu e-mail e a sua senha. Esqueceu a senha? Clique em \"Esqueci a senha\" na tela de entrada.",
};
const ABAS_MSG: [string, string][] = [["link", "Convite por link"], ["email", "Convite por e-mail"], ["ja", "Quem já tem acesso"]];

type Jan =
  | { tipo: "novo" | "acesso"; id?: string }
  | { tipo: "sucesso"; id: string; titulo: string; link: string | null; modelo: string; texto: string }
  | { tipo: "opcoes"; id: string }
  | { tipo: "msgs"; aba: string }
  | { tipo: "dados"; id: string }
  | { tipo: "confirmar"; id: string; oque: "bloquear" | "remover" };

export function criarColaboradores(D: ColabDeps) {
  const { h } = D;
  let lista: Colab[] | null = null;
  let carregando = false;
  let msgs: Record<string, string> = { ...MENSAGENS_PADRAO };
  let jan: Jan | null = null;
  let pop: { id: string; x: number; y: number } | null = null;
  let ocupado = false;
  let outroFn = "";
  // Formulário aberto (novo colaborador / editar acesso / mensagens / dados).
  let f: { modo: string; nome: string; email: string; funcao: string; funcaoOutro: string; tipo: string; areas: Record<string, string>; prodTodos: boolean; prods: string[]; msg: Record<string, string>; nomeDados: string } = vazio();
  function vazio() {
    return { modo: "link", nome: "", email: "", funcao: "", funcaoOutro: "", tipo: "personalizado", areas: Object.fromEntries(TODAS_AREAS.filter((k) => RELATORIOS.has(k)).map((k) => [k, "ver"])), prodTodos: true, prods: [] as string[], msg: { ...msgs }, nomeDados: "" };
  }
  const painelUrl = () => location.origin + "/admin";
  const colab = (id: string) => lista?.find((x) => x.id === id);
  const dataHora = (iso: string | null) => { if (!iso) return "—"; const d = new Date(iso); const z = (n: number) => String(n).padStart(2, "0"); return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}, ${z(d.getHours())}:${z(d.getMinutes())}`; };

  async function carregar() {
    if (carregando) return;
    carregando = true;
    try {
      lista = ((await D.rpc("colaboradores_lista")) as Colab[]) || [];
      const m = await D.lerMensagens();
      if (m) msgs = { ...MENSAGENS_PADRAO, ...m };
    } catch (e) { D.toast(e instanceof Error ? e.message : "Não foi possível carregar a equipe."); lista = lista || []; }
    carregando = false;
    D.render();
  }

  function preencher(modelo: string, c: { nome: string; email: string; produtos?: string[] | null }, link: string | null) {
    const P = D.produtos();
    const dash = !c.produtos ? "Todos os produtos" : c.produtos.map((id) => P.find((p) => p.id === id)?.nome).filter(Boolean).join(", ") || "Nenhum produto";
    return modelo.replace(/\{nome\}/g, c.nome).replace(/\{primeiro_nome\}/g, c.nome.trim().split(/\s+/)[0] || c.nome)
      .replace(/\{email\}/g, c.email).replace(/\{link\}/g, link || painelUrl()).replace(/\{painel\}/g, painelUrl()).replace(/\{dashboards\}/g, dash);
  }

  /* ---------- a tela ---------- */
  const IC_PTS = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/></svg>`;
  function selFuncao(c: Colab) {
    const atual = c.funcao || "";
    const extra = atual && !FUNCOES.includes(atual) ? [atual] : [];
    if (outroFn === c.id) return `<span class="cx-fn-outro"><input class="campo" maxlength="40" placeholder="Qual função?" data-cx-fn="${c.id}" aria-label="Função de ${h(c.nome)}" /><button type="button" class="cx-bt p ouro" data-a="cx-fn-ok" data-id="${c.id}">OK</button></span>`;
    return `<select class="campo cx-sel" data-cx-funcao="${c.id}" aria-label="Função de ${h(c.nome)}"${c.dono ? "" : ""}>
      <option value="" ${atual ? "" : "selected"} disabled>Escolher função</option>
      ${[...FUNCOES, ...extra].map((x) => `<option ${x === atual ? "selected" : ""}>${h(x)}</option>`).join("")}
      <option value="__outro">Outro…</option></select>`;
  }
  function etiquetaStatus(c: Colab) {
    if (c.dono) return `<span class="cx-st verde">Ativo</span>`;
    const [cls, t] = c.bloqueado ? ["verm", "Bloqueado"] : c.pendente ? ["amar", "Convite pendente"] : ["verde", "Ativo"];
    return `<button type="button" class="cx-st ${cls}" data-a="cx-status" data-id="${c.id}" aria-haspopup="menu">${t} <i aria-hidden="true">▾</i></button>`;
  }
  function tela() {
    if (!lista && !carregando) void carregar();
    const L = lista || [];
    const P = D.produtos();
    return `
    <section class="tela ativa cx">
      <div class="cx-cab">
        <div><h1>Colaboradores</h1><p>Quem pode entrar no painel. Convide por link ou por e-mail; cada pessoa cria a própria senha e pode ter acesso só a algumas áreas e produtos.</p></div>
        <div class="cx-cab-bts"><button type="button" class="cx-bt" data-a="cx-msgs">Editar mensagens</button><button type="button" class="cx-bt ouro" data-a="cx-novo">+ Novo colaborador</button></div>
      </div>
      <div class="cx-tab-w"><table class="cx-tab">
        <thead><tr><th>Colaborador</th><th>Função</th><th>Acesso</th><th>Produtos</th><th>Último acesso</th><th>Status</th><th><span class="sr">Opções</span></th></tr></thead>
        <tbody>${!lista ? `<tr><td colspan="7" class="cx-vazio">Carregando…</td></tr>` : L.map((c) => `
          <tr${c.bloqueado ? ' class="cx-bloq"' : ""}>
            <td><b class="cx-nome">${h(c.nome)}</b><span class="cx-email">${h(c.email)}</span>
              <span class="cx-tags">${c.pendente && !c.dono ? `<span class="cx-tag amar">Convite pendente</span>` : ""}<button type="button" class="cx-tag bt" data-a="cx-copiar" data-id="${c.id}">Copiar acesso</button>${c.dono ? `<span class="cx-tag ouro">dono</span>` : ""}${c.eu ? `<span class="cx-tag">você</span>` : ""}</span></td>
            <td>${selFuncao(c)}</td>
            <td>${c.dono ? "Dono (tudo)" : `<button type="button" class="cx-acesso" data-a="cx-acesso" data-id="${c.id}">${NOME_TIPO[c.acesso || ""] || "Escolher"} <em>editar</em></button>`}</td>
            <td>${c.dono || !c.produtos ? "Todos os produtos" : c.produtos.length + (c.produtos.length === 1 ? " produto" : " produtos")}${!c.dono && c.produtos && P.length ? "" : ""}</td>
            <td>${c.pendente && !c.dono ? "—" : h(dataHora(c.ultimo))}</td>
            <td>${etiquetaStatus(c)}</td>
            <td><button type="button" class="cx-pts" data-a="cx-opcoes" data-id="${c.id}" aria-label="Opções de ${h(c.nome)}">${IC_PTS}</button></td>
          </tr>`).join("") || `<tr><td colspan="7" class="cx-vazio">Ninguém na equipe ainda.</td></tr>`}</tbody>
      </table></div>
      ${pop ? (() => { const c = colab(pop!.id); if (!c) return ""; return `<span class="cx-pop" role="menu" style="left:${pop!.x}px;top:${pop!.y}px">
        <button type="button" role="menuitem" data-a="cx-ativar" data-id="${c.id}"${!c.bloqueado ? ' aria-current="true"' : ""}><i class="verde"></i>Ativo</button>
        <button type="button" role="menuitem" data-a="cx-bloquear" data-id="${c.id}"${c.bloqueado ? ' aria-current="true"' : ""}><i class="verm"></i>Bloquear</button></span>`; })() : ""}
    </section>`;
  }

  /* ---------- as janelas ---------- */
  const xis = `<button type="button" class="cx-x" data-a="cx-fechar" aria-label="Fechar">✕</button>`;
  const caixa = (titulo: string, sub: string, corpo: string, pe: string, larga = false) => `<div class="cx-fundo" data-a="cx-fechar-fundo"><div class="cx-jan${larga ? " larga" : ""}" role="dialog" aria-modal="true" aria-label="${h(titulo)}">
      <header class="cx-jcab"><div><h2>${h(titulo)}</h2>${sub ? `<p>${h(sub)}</p>` : ""}</div>${xis}</header>
      <div class="cx-jcorpo">${corpo}</div>${pe ? `<footer class="cx-jpe">${pe}</footer>` : ""}</div></div>`;

  function blocoAcesso() {
    const cards = TIPOS.map(([k, t, d]) => `<button type="button" class="cx-card${f.tipo === k ? " on" : ""}" data-a="cx-tipo" data-v="${k}" aria-pressed="${f.tipo === k}"><b>${t}</b><span>${d}</span></button>`).join("");
    const nivel = (k: string) => f.tipo === "admin" ? "editar" : f.tipo === "leitura" ? "ver" : f.tipo === "conteudo" ? (k === "cursos" || k === "layout" ? "editar" : "") : (f.areas[k] || "");
    const fixo = f.tipo !== "personalizado";
    const tabela = AREAS_GRUPOS.map(([g, itens]) => `<div class="cx-grp"><div class="cx-grp-cab"><span>${g}</span>${fixo ? "" : `<span class="cx-tudo">Tudo: <button type="button" data-a="cx-grupo" data-v="${g}|">Sem acesso</button><button type="button" data-a="cx-grupo" data-v="${g}|ver">Ver</button><button type="button" data-a="cx-grupo" data-v="${g}|editar">Editar</button></span>`}</div>
      ${itens.map(([k, t]) => { const n = nivel(k); return `<div class="cx-area"><span>${t}</span><span class="cx-seg" role="group" aria-label="${t}">${[["", "Sem acesso"], ["ver", "Ver"], ["editar", "Editar"]].map(([v, r]) => `<button type="button" class="${v ? v : "sem"}" data-a="cx-area" data-v="${k}|${v}" aria-pressed="${n === v}"${fixo ? " disabled" : ""}>${r}</button>`).join("")}</span></div>`; }).join("")}</div>`).join("");
    const P = D.produtos();
    return `<p class="cx-rot">Acesso (o que a pessoa pode ver e editar)</p><div class="cx-cards">${cards}</div>
      <div class="cx-areas">${tabela}<p class="cx-nota">Colaboradores e Histórico de acesso são só do dono. Minha conta e Minha segurança ficam para todos.</p></div>
      <p class="cx-rot">Produtos que a pessoa enxerga</p>
      <div class="cx-modo"><button type="button" data-a="cx-prodtodos" data-v="1" aria-pressed="${f.prodTodos}">Todos os produtos</button><button type="button" data-a="cx-prodtodos" data-v="0" aria-pressed="${!f.prodTodos}">Escolher produtos</button></div>
      ${f.prodTodos ? `<p class="cx-nota">Vê todos os produtos, inclusive os criados depois.</p>` : `<div class="cx-prods">${P.map((p) => `<label><input type="checkbox" data-cx-prod="${p.id}" ${f.prods.includes(p.id) ? "checked" : ""} /> ${h(p.nome)}</label>`).join("") || `<p class="cx-nota">Nenhum produto cadastrado.</p>`}</div>`}`;
  }

  function janela() {
    if (!jan) return "";
    const j = jan;
    const pBt = (t: string, a: string, cls = "ouro", extra = "") => `<button type="button" class="cx-bt ${cls}" data-a="${a}" ${extra}${ocupado ? " disabled" : ""}>${ocupado ? "Aguarde…" : t}</button>`;
    const cancelar = `<button type="button" class="cx-bt" data-a="cx-fechar">Cancelar</button>`;
    if (j.tipo === "novo") {
      const outro = f.funcao === "__outro";
      const corpo = `<div class="cx-modo"><button type="button" data-a="cx-modo" data-v="link" aria-pressed="${f.modo === "link"}">Convidar por link</button><button type="button" data-a="cx-modo" data-v="email" aria-pressed="${f.modo === "email"}">Convidar por e-mail</button></div>
        <div class="cx-duas"><label><span class="cx-rot">Nome</span><input class="campo" data-cx="nome" value="${h(f.nome)}" maxlength="80" autocomplete="off" /></label>
        <label><span class="cx-rot">E-mail</span><input class="campo" type="email" data-cx="email" value="${h(f.email)}" autocomplete="off" /></label></div>
        <p class="cx-nota">${f.modo === "link" ? "Sem senha aqui: você copia o acesso (nome, e-mail e link) e manda para a pessoa. Ela abre o link, o e-mail já vem reconhecido e ela mesma cria a senha." : "A pessoa recebe um e-mail com o link para criar a própria senha. Você também copia uma mensagem avisando que o acesso foi enviado por e-mail."}</p>
        <label><span class="cx-rot">Função (o que a pessoa faz)</span><select class="campo" data-cx="funcao"><option value="" ${f.funcao ? "" : "selected"}>Escolher função</option>${FUNCOES.map((x) => `<option ${x === f.funcao ? "selected" : ""}>${x}</option>`).join("")}<option value="__outro" ${outro ? "selected" : ""}>Outro…</option></select></label>
        ${outro ? `<label><span class="cx-rot">Qual função?</span><input class="campo" data-cx="funcaoOutro" maxlength="40" value="${h(f.funcaoOutro)}" /></label>` : ""}
        ${blocoAcesso()}`;
      return caixa("Convidar colaborador", "", corpo, cancelar + pBt(f.modo === "link" ? "Criar e copiar acesso" : "Enviar convite por e-mail", "cx-criar"), true);
    }
    if (j.tipo === "acesso") {
      const c = colab(j.id!); if (!c) return "";
      return caixa("Acesso de " + c.nome, c.email + (c.funcao ? " · " + c.funcao : ""), blocoAcesso() + `<p class="cx-nota">Vale na hora: a pessoa passa a ver só o que foi marcado, mesmo com o painel aberto.</p>`, cancelar + pBt("Salvar acesso", "cx-salvar-acesso"), true);
    }
    if (j.tipo === "sucesso") {
      const c = colab(j.id);
      const linha = (rot: string, v: string) => `<div class="cx-campo-c"><span class="cx-rot">${rot}</span><span class="cx-copia"><input class="campo" value="${h(v)}" readonly /><button type="button" class="cx-bt p" data-a="cx-copiar-texto" data-v="${h(v)}">copiar</button></span></div>`;
      const corpo = `${linha("Nome", c?.nome || "")}${linha("E-mail", c?.email || "")}${j.link ? linha("Link", j.link) : ""}
        <div class="cx-msg-cab"><span class="cx-rot">Mensagem</span><button type="button" class="cx-link" data-a="cx-msgs" data-v="${j.modelo}">Editar modelo</button></div>
        <textarea class="campo cx-texto" rows="11" data-cx-sucesso>${h(j.texto)}</textarea>`;
      return caixa(j.titulo, "", corpo, `<button type="button" class="cx-bt" data-a="cx-whats">Enviar pelo WhatsApp</button>` + pBt("Copiar acesso", "cx-copiar-msg"));
    }
    if (j.tipo === "opcoes") {
      const c = colab(j.id); if (!c) return "";
      const op = (a: string, t: string, d: string, cls = "") => `<button type="button" class="cx-op ${cls}" data-a="${a}" data-id="${c.id}"><b>${t}</b><span>${d}</span></button>`;
      const corpo = [
        c.dono ? "" : op("cx-acesso", "Editar acesso", "Tipo de acesso e o que pode ver ou editar em cada tela."),
        c.dono ? "" : op("cx-acesso", "Escolher produtos", "Todos os produtos ou só alguns."),
        op("cx-dados", "Editar dados", "Nome da pessoa no painel."),
        op("cx-copiar", "Copiar acesso", c.pendente && !c.dono ? "Gera um link novo de convite (o anterior deixa de valer)." : "Mensagem com o endereço do painel."),
        c.pendente && !c.dono ? "" : op("cx-link-senha", "Copiar link de nova senha", "Link para a pessoa criar uma senha nova."),
        c.pendente && !c.dono ? "" : op("cx-enviar-senha", "Enviar link de nova senha por e-mail", "A pessoa recebe o link no e-mail dela."),
        c.dono || c.eu ? "" : op("cx-remover", "Remover colaborador", "Tira a pessoa da equipe. Não dá para desfazer.", "perigo"),
      ].join("");
      return caixa(c.nome, c.email + (c.funcao ? " · " + c.funcao : ""), `<div class="cx-ops">${corpo}</div>`, "");
    }
    if (j.tipo === "msgs") {
      const k = j.aba;
      const exemplo = preencher(f.msg[k] || "", { nome: "Maria Silva", email: "maria@exemplo.com", produtos: null }, painelUrl() + "#/convite?t=…");
      const corpo = `<div class="cx-modo">${ABAS_MSG.map(([v, t]) => `<button type="button" data-a="cx-msg-aba" data-v="${v}" aria-pressed="${k === v}">${t}</button>`).join("")}</div>
        <p class="cx-nota">É o texto do “Copiar acesso” e do “Enviar pelo WhatsApp”. Variáveis: <code>{nome}</code> <code>{primeiro_nome}</code> <code>{email}</code> <code>{link}</code> <code>{painel}</code> <code>{dashboards}</code> ({link} = link de convite da pessoa; {dashboards} = os produtos que ela vê)</p>
        <textarea class="campo cx-texto" rows="10" data-cx-msg="${k}">${h(f.msg[k] || "")}</textarea>
        <div class="cx-msg-cab"><span class="cx-nota">Prévia com um exemplo:</span><button type="button" class="cx-link" data-a="cx-msg-padrao" data-v="${k}">Voltar ao padrão</button></div>
        <pre class="cx-previa">${h(exemplo)}</pre>`;
      return caixa("Editar mensagens de acesso", "", corpo, cancelar + pBt("Salvar mensagens", "cx-msg-salvar"));
    }
    if (j.tipo === "dados") {
      const c = colab(j.id); if (!c) return "";
      return caixa("Editar dados", c.email, `<label><span class="cx-rot">Nome</span><input class="campo" data-cx="nomeDados" value="${h(f.nomeDados)}" maxlength="80" /></label>`, cancelar + pBt("Salvar", "cx-salvar-dados"));
    }
    if (j.tipo === "confirmar") {
      const c = colab(j.id); if (!c) return "";
      return j.oque === "bloquear"
        ? caixa("Bloquear " + c.nome + "?", "", `<p class="cx-txt">A pessoa perde o acesso na hora, mesmo com o painel aberto. Você pode reativar depois.</p>`, cancelar + pBt("Bloquear", "cx-bloquear-ok", "verm", `data-id="${c.id}"`))
        : caixa("Remover " + c.nome + "?", "", `<p class="cx-txt">A pessoa sai da equipe e a conta dela é apagada. Não dá para desfazer. O histórico do que ela fez continua.</p>`, cancelar + pBt("Remover", "cx-remover-ok", "verm", `data-id="${c.id}"`));
    }
    return "";
  }

  /* ---------- ações ---------- */
  function areasDoForm() { return f.tipo === "personalizado" ? Object.fromEntries(Object.entries(f.areas).filter(([, v]) => v)) : {}; }
  function abrirAcesso(c: Colab) {
    f = vazio(); f.tipo = c.acesso || "personalizado"; f.areas = { ...(c.areas || {}) }; f.prodTodos = !c.produtos; f.prods = c.produtos ? [...c.produtos] : [];
    jan = { tipo: "acesso", id: c.id };
  }
  async function exec(fn: () => Promise<void>) {
    if (ocupado) return; ocupado = true; D.render();
    try { await fn(); } catch (e) { D.toast(e instanceof Error ? e.message : "Não foi possível concluir agora."); }
    ocupado = false; D.render();
  }
  async function copiarTexto(t: string, ok = "Copiado.") {
    try { await navigator.clipboard.writeText(t); D.toast(ok); } catch { D.toast("Não foi possível copiar. Selecione e copie à mão."); }
  }
  async function abrirCopiar(c: Colab, titulo?: string, linkPronto?: string | null) {
    let link: string | null = linkPronto ?? null, modelo = "ja";
    if (c.dono) modelo = "ja";
    else if (linkPronto === undefined && c.pendente) { const r = await D.chamar("colaboradores", { acao: "gerar_link", id: c.id }); link = (r.link as string) || null; }
    if (!c.dono && c.pendente) modelo = link ? "link" : "email";
    jan = { tipo: "sucesso", id: c.id, titulo: titulo || "Acesso de " + c.nome, link, modelo, texto: preencher(msgs[modelo], c, link) };
  }

  function acao(a: string, d: Record<string, string>, el: HTMLElement | null, alvo: EventTarget | null = null): boolean {
    if (!a.startsWith("cx-")) { if (pop) { pop = null; } return false; }
    if (a !== "cx-status") pop = null;
    switch (a) {
      case "cx-fechar": jan = null; break;
      case "cx-fechar-fundo": if (alvo !== el) return true; jan = null; break;
      case "cx-novo": jan = null; D.novoMembro(); return true;
      case "cx-modo": f.modo = d.v; break;
      case "cx-tipo": f.tipo = d.v; break;
      case "cx-area": { const [k, v] = d.v.split("|"); f.areas[k] = v; break; }
      case "cx-grupo": { const [g, v] = d.v.split("|"); (AREAS_GRUPOS.find(([n]) => n === g)?.[1] || []).forEach(([k]) => { f.areas[k] = v; }); break; }
      case "cx-prodtodos": f.prodTodos = d.v === "1"; break;
      case "cx-acesso": { const c = colab(d.id); if (c && !c.dono) abrirAcesso(c); break; }
      case "cx-opcoes": jan = { tipo: "opcoes", id: d.id }; break;
      case "cx-dados": { const c = colab(d.id); if (c) { f = vazio(); f.nomeDados = c.nome; jan = { tipo: "dados", id: c.id }; } break; }
      case "cx-status": { if (pop?.id === d.id) { pop = null; break; } const r = el?.getBoundingClientRect(); if (r) pop = { id: d.id, x: Math.max(8, Math.min(r.left, innerWidth - 200)), y: r.bottom + 100 > innerHeight ? Math.max(8, r.top - 96) : r.bottom + 6 }; break; }
      case "cx-ativar": { const c = colab(d.id); if (c && c.bloqueado) void exec(async () => { await D.chamar("colaboradores", { acao: "ativar", id: c.id }); D.toast(c.nome + " está ativo de novo."); await recarregar(); }); break; }
      case "cx-bloquear": { const c = colab(d.id); if (c && !c.bloqueado && !c.dono) jan = { tipo: "confirmar", id: c.id, oque: "bloquear" }; break; }
      case "cx-bloquear-ok": void exec(async () => { await D.chamar("colaboradores", { acao: "bloquear", id: d.id }); jan = null; D.toast("Acesso bloqueado."); await recarregar(); }); break;
      case "cx-remover": jan = { tipo: "confirmar", id: d.id, oque: "remover" }; break;
      case "cx-remover-ok": void exec(async () => { await D.chamar("colaboradores", { acao: "remover", id: d.id }); jan = null; D.toast("Colaborador removido."); await recarregar(); }); break;
      case "cx-copiar": { const c = colab(d.id); if (c) void exec(async () => { await abrirCopiar(c); }); break; }
      case "cx-copiar-texto": void copiarTexto(d.v); return true;
      case "cx-copiar-msg": { const t = (document.querySelector<HTMLTextAreaElement>("[data-cx-sucesso]")?.value) ?? (jan?.tipo === "sucesso" ? jan.texto : ""); void copiarTexto(t, "Acesso copiado."); return true; }
      case "cx-whats": { const t = (document.querySelector<HTMLTextAreaElement>("[data-cx-sucesso]")?.value) ?? ""; window.open("https://wa.me/?text=" + encodeURIComponent(t), "_blank", "noopener"); return true; }
      case "cx-link-senha": void exec(async () => { const r = await D.chamar("colaboradores", { acao: "link_senha", id: d.id }); await copiarTexto(String(r.link || ""), "Link de nova senha copiado."); }); break;
      case "cx-enviar-senha": void exec(async () => { await D.chamar("colaboradores", { acao: "enviar_link_senha", id: d.id }); jan = null; D.toast("Link de nova senha enviado por e-mail."); }); break;
      case "cx-msgs": f = vazio(); jan = { tipo: "msgs", aba: d.v || "link" }; break;
      case "cx-msg-aba": if (jan?.tipo === "msgs") jan.aba = d.v; break;
      case "cx-msg-padrao": f.msg[d.v] = MENSAGENS_PADRAO[d.v]; break;
      case "cx-msg-salvar": void exec(async () => { await D.salvarMensagens(f.msg); msgs = { ...MENSAGENS_PADRAO, ...f.msg }; jan = null; D.toast("Mensagens salvas."); }); break;
      case "cx-salvar-dados": { const j = jan; if (j?.tipo !== "dados") break; if (!f.nomeDados.trim()) { D.toast("Escreva o nome."); return true; } void exec(async () => { await D.chamar("colaboradores", { acao: "salvar_nome", id: j.id, nome: f.nomeDados.trim() }); jan = null; D.toast("Dados salvos."); await recarregar(); }); break; }
      case "cx-salvar-acesso": { const j = jan; if (j?.tipo !== "acesso") break; void exec(async () => { await D.chamar("colaboradores", { acao: "salvar_acesso", id: j.id, acesso: f.tipo, areas: areasDoForm(), produtos: f.prodTodos ? null : f.prods }); jan = null; D.toast("Acesso salvo. Já vale para a pessoa."); await recarregar(); }); break; }
      case "cx-criar": {
        const funcao = f.funcao === "__outro" ? f.funcaoOutro.trim() : f.funcao;
        if (!f.nome.trim()) { D.toast("Escreva o nome."); return true; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { D.toast("Confira o e-mail."); return true; }
        if (!f.prodTodos && !f.prods.length) { D.toast("Escolha pelo menos um produto, ou marque Todos os produtos."); return true; }
        void exec(async () => {
          const r = await D.chamar("colaboradores", { acao: "convidar", modo: f.modo, nome: f.nome.trim(), email: f.email.trim(), funcao, acesso: f.tipo, areas: areasDoForm(), produtos: f.prodTodos ? null : f.prods });
          await recarregar();
          const c = colab(String(r.id));
          if (c) await abrirCopiar(c, "Cadastro realizado com sucesso!", (r.link as string) || null);
          else jan = null;
        });
        break;
      }
      case "cx-fn-ok": { const v = (document.querySelector<HTMLInputElement>(`[data-cx-fn="${d.id}"]`)?.value || "").trim().slice(0, 40); if (!v) { D.toast("Escreva a função."); return true; } outroFn = ""; void salvarFuncao(d.id, v); break; }
      default: return false;
    }
    D.render();
    return true;
  }
  async function recarregar() { try { lista = ((await D.rpc("colaboradores_lista")) as Colab[]) || []; } catch { /* mantém */ } }
  async function salvarFuncao(id: string, v: string) {
    try { await D.chamar("colaboradores", { acao: "salvar_funcao", id, funcao: v }); const c = colab(id); if (c) c.funcao = v; D.toast("Função salva."); }
    catch (e) { D.toast(e instanceof Error ? e.message : "Não foi possível salvar."); }
    D.render();
  }

  /** Digitação e escolhas nos campos (sem redesenhar a cada tecla). */
  function campo(el: HTMLElement): boolean {
    const t = el as HTMLInputElement;
    if (t.dataset.cx) {
      const k = t.dataset.cx as "nome" | "email" | "funcao" | "funcaoOutro" | "nomeDados";
      f[k] = t.value;
      if (k === "funcao") D.render();
      return true;
    }
    if (t.dataset.cxMsg) { f.msg[t.dataset.cxMsg] = t.value; const pv = document.querySelector(".cx-previa"); if (pv) pv.textContent = preencher(t.value, { nome: "Maria Silva", email: "maria@exemplo.com", produtos: null }, painelUrl() + "#/convite?t=…"); return true; }
    if (t.dataset.cxProd) { const id = t.dataset.cxProd; f.prods = t.checked ? [...new Set([...f.prods, id])] : f.prods.filter((x) => x !== id); return true; }
    if (t.dataset.cxSucesso !== undefined) { if (jan?.tipo === "sucesso") jan.texto = t.value; return true; }
    if (t.dataset.cxFuncao) {
      const id = t.dataset.cxFuncao;
      if (t.value === "__outro") { outroFn = id; D.render(); setTimeout(() => document.querySelector<HTMLInputElement>(`[data-cx-fn="${id}"]`)?.focus(), 30); }
      else if (t.value) void salvarFuncao(id, t.value);
      return true;
    }
    return false;
  }
  function fecharPop() { if (pop) { pop = null; D.render(); } }
  /** Depois de cadastrar pela janela "Adicionar membro": abre o "Cadastro realizado com sucesso!". */
  async function abrirSucesso(id: string, link: string | null) {
    await recarregar(); const c = colab(id);
    if (c) await abrirCopiar(c, "Cadastro realizado com sucesso!", link);
    D.render();
  }
  return { tela, janela, acao, campo, fecharPop, abrirSucesso, recarregar: () => { lista = null; }, temJanela: () => !!jan };
}
