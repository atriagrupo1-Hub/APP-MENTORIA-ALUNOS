import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useEstado } from "@/data/estado";
import "./login.css";

/**
 * A tela de entrada da aluna.
 *
 * Marcação, textos e CSS são os do pacote aprovado no Claude Design
 * (`pacote-login`): reproduzir idêntico, sem inventar nada. A tela não
 * rola — cabe em 390×844 e em telas menores, encolhendo os espaços pela
 * altura.
 *
 * Quem decide se o nome e o código valem é o servidor (Edge Function
 * `entrar`). Aqui só se confere o formato, para avisar antes de ir.
 */
export function Login() {
  const { entrar, aluna, carregando } = useEstado();
  const navegar = useNavigate();
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [verCodigo, setVerCodigo] = useState(false);
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  /*
   * Quem já entrou não pede para entrar de novo. `carregando` importa:
   * sem ele, a tela de entrada pisca por um instante antes de seguir.
   */
  useEffect(() => {
    if (!carregando && aluna) navegar("/inicio", { replace: true });
  }, [carregando, aluna, navegar]);

  // A tela não rola: o corpo da página fica parado enquanto ela está aberta.
  useEffect(() => {
    document.body.classList.add("sem-nav");
    return () => document.body.classList.remove("sem-nav");
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (entrando) return;
    if (!nome.trim()) {
      setErro("Escreva o seu nome.");
      return;
    }
    if (!/^\d{4}$/.test(codigo)) {
      setErro("O código tem 4 números. Confira e tente de novo.");
      return;
    }
    setEntrando(true);
    setErro("");
    try {
      const falha = await entrar(nome.trim(), codigo);
      if (falha) {
        setErro(falha);
        return;
      }
      setCodigo("");
      navegar("/inicio");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="entrada">
      <div className="ent-col">
        <div className="ent-marca">
          <span className="ent-logo">
            <img
              src="/marca/logo-aion.png"
              alt="AIŌN"
              onError={(e) => e.currentTarget.remove()}
            />
            <span className="ent-logo-txt serif" aria-hidden="true">
              AIŌN
            </span>
          </span>
          <p className="ent-sobre">Mentoria</p>
          <p className="ent-nome serif">CAMINHO DO DESBLOQUEIO</p>
          <p className="ent-nome serif">PARA BÊNÇÃOS ILIMITADAS</p>
        </div>

        <form className="ent-cartao" onSubmit={enviar} noValidate>
          <h1>Bem-vindo(a)</h1>

          <label className="ent-rot" htmlFor="nome">
            Seu nome
          </label>
          <div className="ent-campo">
            <span className="ent-ic" aria-hidden="true">
              <span className="cab" />
              <span className="corpo" />
            </span>
            <input
              id="nome"
              name="nome"
              autoComplete="username"
              placeholder="Digite seu nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                setErro("");
              }}
            />
          </div>

          <label className="ent-rot" htmlFor="codigo">
            Seu código
          </label>
          <div className="ent-campo">
            <span className="ent-ic cad" aria-hidden="true">
              <span className="arco" />
              <span className="caixa" />
            </span>
            <input
              id="codigo"
              name="codigo"
              className="ent-cod"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="one-time-code"
              placeholder="Digite seu código"
              type={verCodigo ? "text" : "password"}
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.replace(/\D/g, "").slice(0, 4));
                setErro("");
              }}
            />
            <button
              type="button"
              className="ent-olho"
              aria-pressed={verCodigo}
              aria-label={verCodigo ? "Ocultar código" : "Mostrar código"}
              onClick={() => setVerCodigo((v) => !v)}
            >
              {/* Desenho do olho em SVG: o círculo feito só com CSS sumia em alguns celulares. */}
              <svg className="ent-olho-ic" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {verCodigo ? <path d="M4 4l16 16" /> : null}
              </svg>
            </button>
          </div>

          {erro ? (
            <p className="erro" role="alert">
              {erro}
            </p>
          ) : null}

          <button className="ent-entrar" disabled={entrando} style={entrando ? { cursor: "wait", opacity: 0.8 } : undefined}>
            Entrar na mentoria<span aria-hidden="true">→</span>
          </button>
          <p className="ent-nota" style={{ marginTop: 20 }}>
            Acesso reservado às alunas da mentoria.
          </p>
        </form>

        <div className="ent-selos">
          <span>
            <i>✓</i>Acesso protegido
          </span>
          <span>
            <i>⌘</i>Dados privados
          </span>
          <span>
            <i>♦</i>Turma verificada
          </span>
        </div>
      </div>
    </div>
  );
}
