import type { WAMessage } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

const execFileAsync = promisify(execFile);

async function runGit(args: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: process.cwd(),
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, out: `${stdout}\n${stderr}`.trim() };
  } catch (error: unknown) {
    const details = [
      (error as { stdout?: string })?.stdout,
      (error as { stderr?: string })?.stderr,
      error instanceof Error ? error.message : String(error),
    ]
      .filter(Boolean)
      .join("\n")
      .trim();
    return { ok: false, out: details || "Error desconocido de Git." };
  }
}

function buildUpdateRichPayload(data: {
  stateMode: "UPDATED" | "UP_TO_DATE" | "ERROR";
  statusTitle: string;
  branch: string;
  prevHash: string;
  currHash: string;
  commitMsg: string;
  commitAuthor: string;
  commitDate: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  elapsedMs: string;
  output: string;
  rawReport: string;
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#130826 0%,#070312 100%);border:1.5px solid #3b1d6e;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.85),0 0 30px rgba(139,92,246,.2);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#7c3aed,#ec4899,#00ffcc,#7c3aed);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(168,85,247,.28),transparent 60%);border-bottom:1px solid #261447;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.orb{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#9333ea,#db2777);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 15px rgba(147,51,234,.5)}
.brand-txt h1{font-size:13.5px;font-weight:900;letter-spacing:.8px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10.5px;color:#c084fc;font-weight:800;font-family:'Courier New',monospace}
.pill{font-size:9.5px;font-weight:900;padding:4px 9px;border-radius:999px;font-family:'Courier New',monospace;text-transform:uppercase}
.pill.ok{background:rgba(0,255,204,.14);color:#00ffcc;border:1px solid rgba(0,255,204,.4)}
.pill.up{background:rgba(139,92,246,.22);color:#e9d5ff;border:1px solid rgba(168,85,247,.5)}
.pill.err{background:rgba(255,42,84,.18);color:#ff6b8b;border:1px solid rgba(255,42,84,.45)}
.body{padding:14px 16px}
.commit-box{background:#0d051c;border:1px solid #28154a;border-left:3px solid #a855f7;border-radius:12px;padding:10px 12px;margin-bottom:12px}
.lbl{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#a78bfa;margin-bottom:4px;display:flex;justify-content:space-between}
.commit-msg{font-size:12px;font-weight:800;color:#fff;line-height:1.35;word-break:break-word}
.commit-meta{font-size:10.5px;color:#9378bc;margin-top:4px;font-family:'Courier New',monospace}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
.stat{background:#0f061e;border:1px solid #251345;border-radius:10px;padding:7px 5px;text-align:center}
.stat-v{font-size:12px;font-weight:900;color:#f3e8ff;font-family:'Courier New',monospace}
.stat-v.add{color:#4ade80}
.stat-v.del{color:#f87171}
.stat-k{font-size:8.5px;font-weight:800;color:#8b74b0;text-transform:uppercase;margin-top:2px}
.term-wrap{background:#040208;border:1px solid #301957;border-radius:12px;overflow:hidden;margin-bottom:12px}
.term-top{background:#150a2a;padding:6px 10px;border-bottom:1px solid #261347;display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:800;color:#c084fc;font-family:'Courier New',monospace}
.dots{display:flex;gap:5px}
.dot{width:7px;height:7px;border-radius:50%}
.term-pre{padding:10px;font-family:'Courier New',monospace;font-size:11px;color:#d8b4fe;max-height:190px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;line-height:1.4;user-select:text;-webkit-user-select:text}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;box-shadow:0 4px 15px rgba(139,92,246,.35)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#8b5cf6;color:#fff;font-size:11.5px;font-weight:800;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.6)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb" id="orbIcon">🚀</div>
      <div class="brand-txt">
        <h1 id="statusTitle"></h1>
        <p id="branchSub"></p>
      </div>
    </div>
    <span class="pill" id="statePill"></span>
  </div>

  <div class="body">
    <div class="commit-box">
      <div class="lbl"><span>📦 ÚLTIMO COMMIT</span><span id="hashSpan"></span></div>
      <div class="commit-msg" id="commitMsg"></div>
      <div class="commit-meta" id="commitMeta"></div>
    </div>

    <div class="grid">
      <div class="stat">
        <div class="stat-v" id="stFiles"></div>
        <div class="stat-k">Archivos</div>
      </div>
      <div class="stat">
        <div class="stat-v add" id="stAdd"></div>
        <div class="stat-k">Líneas +</div>
      </div>
      <div class="stat">
        <div class="stat-v del" id="stDel"></div>
        <div class="stat-k">Líneas -</div>
      </div>
      <div class="stat">
        <div class="stat-v" id="stTime"></div>
        <div class="stat-k">Tiempo</div>
      </div>
    </div>

    <div class="term-wrap">
      <div class="term-top">
        <span>GIT_OUTPUT // CONSOLE</span>
        <div class="dots">
          <div class="dot" style="background:#ff3b30"></div>
          <div class="dot" style="background:#ffab00"></div>
          <div class="dot" style="background:#00ffcc"></div>
        </div>
      </div>
      <div class="term-pre" id="gitOut"></div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" onclick="copyText(D.output, 'Salida de Git copiada')">📋 Copiar Log</button>
      <button class="btn btn-sec" onclick="showAlert()">🔍 Ver Detalles</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
function $(id){ return document.getElementById(id); }

function init(){
  $("statusTitle").textContent = D.statusTitle;
  $("branchSub").textContent = "Rama: " + D.branch;

  const pill = $("statePill");
  if (D.stateMode === "UPDATED") {
    $("orbIcon").textContent = "🚀";
    pill.textContent = "UPDATE OK";
    pill.className = "pill ok";
  } else if (D.stateMode === "UP_TO_DATE") {
    $("orbIcon").textContent = "✨";
    pill.textContent = "AL DÍA";
    pill.className = "pill up";
  } else {
    $("orbIcon").textContent = "⚠️";
    pill.textContent = "CONFLICTO";
    pill.className = "pill err";
  }

  $("hashSpan").textContent = D.prevHash === D.currHash ? D.currHash : (D.prevHash + " ➔ " + D.currHash);
  $("commitMsg").textContent = D.commitMsg || "Sin descripción de commit";
  $("commitMeta").textContent = "Autor: " + D.commitAuthor + " • " + D.commitDate;
  $("stFiles").textContent = D.filesChanged;
  $("stAdd").textContent = "+" + D.insertions;
  $("stDel").textContent = "-" + D.deletions;
  $("stTime").textContent = D.elapsedMs + "ms";
  $("gitOut").textContent = D.output || "Sin salida de consola.";
}

function copyText(txt, msg){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).catch(function(){});
  } else {
    const t = document.createElement("textarea");
    t.value = txt;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(t);
  }
  const el = $("toast");
  el.textContent = msg || "Copiado";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

function showAlert(){
  alert(D.rawReport);
}

init();
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [],
        payload: html,
      },
    },
  };
}

export default {
  name: ["update", "actualizar", "fix"],
  category: "system",
  description: t("cmd_actualiza_el_bot_desde_los_cam_b2f56e1b"),
  modOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], react } = ctx;
    const startTs = performance.now();
    const forceReset = args.some((a) => /^(?:-f|--force|force|hard)$/i.test(String(a)));

    await react("⏳").catch(() => undefined);

    let initText = t("cmd_value0_613e73f3", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
    initText += t("cmd_value0_ff060343", { value0: fytBold(t("cmd_sistema_update_d7487f6b")) });
    initText += t("cmd_text_bdfd7fa0");
    initText += t("cmd_buscando_cambios_en_el_reposit_f70bd2dd");
    initText += t("cmd_system_96040c03");

    const sent = await sock
      .sendMessage(from, { text: initText }, { quoted: msg as unknown as WAMessage })
      .catch(() => null);

    const [branchRes, prevHashRes] = await Promise.all([
      runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
      runGit(["rev-parse", "--short", "HEAD"]),
    ]);

    const branch = branchRes.ok && branchRes.out ? branchRes.out.split("\n")[0].trim() : "main";
    const prevHash = prevHashRes.ok && prevHashRes.out ? prevHashRes.out.split("\n")[0].trim() : "HEAD";

    let pullRes: { ok: boolean; out: string };
    if (forceReset) {
      const fetchRes = await runGit(["fetch", "--all", "--prune"]);
      const resetRes = await runGit(["reset", "--hard", `origin/${branch}`]);
      pullRes = {
        ok: fetchRes.ok && resetRes.ok,
        out: [fetchRes.out, resetRes.out].filter(Boolean).join("\n").trim(),
      };
    } else {
      pullRes = await runGit(["pull", "--ff-only", "--autostash"]);
    }

    const [currHashRes, logRes] = await Promise.all([
      runGit(["rev-parse", "--short", "HEAD"]),
      runGit(["log", "-1", "--pretty=format:%s||%an||%cr"]),
    ]);

    const currHash = currHashRes.ok && currHashRes.out ? currHashRes.out.split("\n")[0].trim() : prevHash;
    const [commitMsg = "Actualización del repositorio", commitAuthor = "Aura Dev", commitDate = "reciente"] =
      (logRes.ok ? logRes.out : "").split("||");

    const elapsedMs = (performance.now() - startTs).toFixed(0);
    const output = pullRes.out || "Sin salida de Git.";

    let filesChanged = 0;
    let insertions = 0;
    let deletions = 0;

    const filesMatch = output.match(/(\d+)\s+files?\s+changed/i);
    const insMatch = output.match(/(\d+)\s+insertions?\(\+\)/i);
    const delMatch = output.match(/(\d+)\s+deletions?\(-\)/i);
    if (filesMatch) filesChanged = Number(filesMatch[1]);
    if (insMatch) insertions = Number(insMatch[1]);
    if (delMatch) deletions = Number(delMatch[1]);

    if (pullRes.ok) {
      const alreadyUpdated =
        /Already up[- ]to[- ]date|Already up to date/i.test(output) && prevHash === currHash;

      let text = t("cmd_value0_c35c8fa6", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
      text += t("cmd_value0_value1_d90b5f4f", {
        value0: alreadyUpdated ? "✨" : "🚀",
        value1: fytBold(alreadyUpdated ? "SISTEMA ACTUALIZADO" : "UPDATE COMPLETO"),
      });
      text += t("cmd_text_bdfd7fa0");
      text += alreadyUpdated
        ? t("cmd_el_bot_ya_esta_actualizado_69816f1a")
        : t("cmd_cambios_descargados_correctame_c5db703e");
      text += t("cmd_value0_b4f94461", { value0: fytBold(t("cmd_salida_de_git_9f2ea82c")) });
      text += t("cmd_value0_21c1b49b", { value0: output });
      text += t("cmd_system_96040c03");

      if (sent?.key) {
        await sock
          .sendMessage(from, { text, edit: sent.key }, { quoted: msg as unknown as WAMessage })
          .catch(() => undefined);
      }

      try {
        const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
        const rich = new AIRich(sock)
          .setTitle(`🟣 ${alreadyUpdated ? "SISTEMA AL DÍA" : "UPDATE COMPLETO"} // GIT`)
          .setFooter(`${branch} @ ${currHash} • ${elapsedMs} ms`);

        rich.addSection(
          buildUpdateRichPayload({
            stateMode: alreadyUpdated ? "UP_TO_DATE" : "UPDATED",
            statusTitle: alreadyUpdated ? "Sistema al Día" : "Repositorio Actualizado",
            branch,
            prevHash,
            currHash,
            commitMsg,
            commitAuthor,
            commitDate,
            filesChanged,
            insertions,
            deletions,
            elapsedMs,
            output,
            rawReport: text,
          }),
        );

        await rich.send(from, { quoted: msg });
      } catch {
        if (!sent?.key) {
          await sock
            .sendMessage(from, { text }, { quoted: msg as unknown as WAMessage })
            .catch(() => undefined);
        }
      }

      await react("✅").catch(() => undefined);
      return;
    }

    let errText = t("cmd_value0_e364d4cd", { value0: fytBold(t("cmd_aura_reed_95dcfb15")) });
    errText += t("cmd_value0_17a5f5fd", { value0: fytBold(t("cmd_error_de_update_a4e20670")) });
    errText += t("cmd_text_bdfd7fa0");
    errText += t("cmd_git_no_pudo_actualizar_el_repo_11259aea");
    errText += t("cmd_se_conservaron_los_cambios_loc_24bd9224");
    errText += t("cmd_value0_21c1b49b", { value0: output });
    errText += t("cmd_system_96040c03");

    if (sent?.key) {
      await sock
        .sendMessage(from, { text: errText, edit: sent.key }, { quoted: msg as unknown as WAMessage })
        .catch(() => undefined);
    }

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("⚠️ ERROR DE ACTUALIZACION // GIT")
        .setFooter(`Usa .fix --force para forzar sincronización`);

      rich.addSection(
        buildUpdateRichPayload({
          stateMode: "ERROR",
          statusTitle: "Error de Actualización",
          branch,
          prevHash,
          currHash,
          commitMsg,
          commitAuthor,
          commitDate,
          filesChanged: 0,
          insertions: 0,
          deletions: 0,
          elapsedMs,
          output,
          rawReport: errText,
        }),
      );

      await rich.send(from, { quoted: msg });
    } catch {
      if (!sent?.key) {
        await sock
          .sendMessage(from, { text: errText }, { quoted: msg as unknown as WAMessage })
          .catch(() => undefined);
      }
    }

    await react("❌").catch(() => undefined);
  },
};
