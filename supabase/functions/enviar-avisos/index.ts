/**
 * Edge Function `enviar-avisos`
 *
 * Quem chama é o próprio banco (pg_cron, a cada minuto, só quando há algo
 * a avisar — 0092). O cabeçalho `x-segredo` confere que veio de lá.
 *
 * O banco diz o que ficou liberado e ainda não foi avisado
 * (avisos_pendentes); aqui vira uma notificação por aluna e por tipo, que
 * vai para cada celular inscrito. Ao tocar, o app abre direto no que foi
 * avisado — e lá a regra de sempre decide se ela já pode assistir.
 * Inscrição que o serviço de push diz que morreu (404/410) é apagada.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEGREDO = Deno.env.get("AVISOS_SEGREDO") ?? "";

webpush.setVapidDetails("https://souaion.com", Deno.env.get("VAPID_PUBLICA")!, Deno.env.get("VAPID_PRIVADA")!);

type Pendente = { aluna_id: string; tipo: "aula" | "presente"; ref_id: string; titulo: string | null; modulo_id: string | null; modulo_titulo: string | null };
type Aviso = { title: string; body: string; url: string; tag: string };

const plural = (n: number, um: string, varios: string) => n + " " + (n === 1 ? um : varios);

function montar(itens: Pendente[]): Aviso[] {
  const out: Aviso[] = [];
  const aulas = itens.filter((x) => x.tipo === "aula"), pres = itens.filter((x) => x.tipo === "presente");
  if (aulas.length === 1) {
    const a = aulas[0];
    out.push({ title: "Aula nova liberada", body: (a.modulo_titulo ? a.modulo_titulo + " — " : "") + (a.titulo ?? ""), url: "/?abrir=aula:" + a.ref_id, tag: "aula-" + a.ref_id });
  } else if (aulas.length > 1) {
    const mods = [...new Set(aulas.map((a) => a.modulo_id))];
    out.push(mods.length === 1
      ? { title: "Novas aulas liberadas", body: (aulas[0].modulo_titulo ?? "") + " — " + plural(aulas.length, "aula nova", "aulas novas"), url: "/?abrir=modulo:" + mods[0], tag: "modulo-" + mods[0] }
      : { title: "Novos módulos liberados", body: plural(aulas.length, "aula nova", "aulas novas") + " para você.", url: "/?abrir=modulos", tag: "modulos" });
  }
  if (pres.length === 1) out.push({ title: "Presente novo liberado", body: pres[0].titulo ?? "", url: "/?abrir=presente:" + pres[0].ref_id, tag: "presente-" + pres[0].ref_id });
  else if (pres.length > 1) out.push({ title: "Novos presentes liberados", body: plural(pres.length, "presente novo", "presentes novos") + " para você.", url: "/?abrir=presentes", tag: "presentes" });
  return out;
}

Deno.serve(async (req) => {
  if (!SEGREDO || req.headers.get("x-segredo") !== SEGREDO) return new Response("proibido", { status: 403 });
  const db = createClient(URL_SUPABASE, CHAVE_SERVICO, { auth: { persistSession: false } });

  const { data: pend, error } = await db.rpc("avisos_pendentes");
  if (error) return new Response(error.message, { status: 500 });
  const lista = (pend ?? []) as Pendente[];
  if (!lista.length) return Response.json({ enviados: 0 });

  const porAluna = new Map<string, Pendente[]>();
  for (const p of lista) porAluna.set(p.aluna_id, [...(porAluna.get(p.aluna_id) ?? []), p]);

  const { data: insc } = await db.from("push_inscricoes").select("id, aluna_id, endpoint, p256dh, auth").in("aluna_id", [...porAluna.keys()]);
  // Marca antes de enviar: um erro no meio não pode virar aviso repetido a cada minuto.
  await db.rpc("marcar_avisos", { p_itens: lista.map((p) => ({ aluna_id: p.aluna_id, tipo: p.tipo, ref_id: p.ref_id })) });

  let enviados = 0;
  const mortas: string[] = [];
  await Promise.all((insc ?? []).map(async (i) => {
    for (const av of montar(porAluna.get(i.aluna_id) ?? [])) {
      try {
        await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify(av), { TTL: 60 * 60 * 24 * 3, urgency: "high" });
        enviados++;
      } catch (e) {
        const st = (e as { statusCode?: number }).statusCode;
        if (st === 404 || st === 410) { mortas.push(i.id); return; }
      }
    }
  }));
  if (mortas.length) await db.from("push_inscricoes").delete().in("id", mortas);
  return Response.json({ enviados, removidas: mortas.length });
});
