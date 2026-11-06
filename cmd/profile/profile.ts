import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

async function fetchAvatarDataUri(sock: any, jid: string): Promise<string> {
  try {
    const url = await Promise.race([
      sock.profilePictureUrl(jid, "image"),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3500)),
    ]);
    if (!url || typeof url !== "string") return "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 125_000) return "";
      const mime = res.headers.get("content-type") || "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return "";
  }
}

function calculateAgeFromBirthday(birthdayStr: string): string {
  if (!birthdayStr) return "";
  const parts = birthdayStr.split(/[/-]/).map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return "";
  let day = parts[0];
  let month = parts[1];
  let year = parts[2];
  if (year < 100) year += year > 30 ? 1900 : 2000;
  if (day > 1900) {
    year = parts[0];
    month = parts[1];
    day = parts[2];
  }
  const now = new Date();
  let age = now.getFullYear() - year;
  const m = now.getMonth() + 1 - month;
  if (m < 0 || (m === 0 && now.getDate() < day)) {
    age--;
  }
  return age > 0 && age < 120 ? String(age) : "";
}

function formatAuraCoins(amount: number): string {
  const num = Number.isFinite(amount) ? Math.floor(amount) : 0;
  const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `₡${formatted} AuraCoins`;
}

function buildProfileRichPayload(profile: {
  tagName: string;
  fullName: string;
  wbId: string;
  bio: string;
  gender: string;
  birthday: string;
  age: string;
  partner: string;
  level: number;
  points: number;
  nextLevelPoints: number;
  walletFmt: string;
  bankFmt: string;
  totalFmt: string;
  rankRole: string;
  avatarUri: string;
}) {
  const serialized = JSON.stringify(profile);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#06030d;color:#f5f3ff;padding:10px}
.card{max-width:410px;margin:0 auto;background:linear-gradient(180deg,#120824 0%,#080411 100%);border:1.5px solid #3b1d6e;border-radius:22px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.85),0 0 30px rgba(139,92,246,.2);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#7c3aed,#ec4899,#a855f7,#7c3aed);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.banner{position:relative;padding:18px 16px 14px;background:radial-gradient(circle at 80% 10%,rgba(168,85,247,.28),transparent 60%),radial-gradient(circle at 20% 80%,rgba(236,72,153,.15),transparent 60%);border-bottom:1px solid #251347}
.top-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.badge{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:1px;padding:4px 10px;border-radius:999px;background:rgba(139,92,246,.2);color:#d8b4fe;border:1px solid rgba(168,85,247,.45)}
.badge-id{font-family:'Courier New',monospace;color:#f0abfc;border-color:rgba(240,171,252,.4);background:rgba(217,70,239,.14);cursor:pointer}
.profile-head{display:flex;align-items:center;gap:14px}
.ava-wrap{position:relative;width:68px;height:68px;flex:none}
.ava-ring{width:100%;height:100%;border-radius:50%;padding:2.5px;background:linear-gradient(135deg,#a855f7,#ec4899,#6366f1);box-shadow:0 0 18px rgba(168,85,247,.5)}
.ava-img,.ava-fallback{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#190d30;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#e9d5ff}
.lvl-pill{position:absolute;bottom:-4px;right:-4px;background:linear-gradient(135deg,#9333ea,#db2777);color:#fff;font-size:10px;font-weight:900;padding:2px 7px;border-radius:999px;border:1.5px solid #090414;box-shadow:0 4px 10px rgba(0,0,0,.6)}
.user-meta{min-width:0;flex:1}
.user-name{font-size:17px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.3px}
.user-tag{font-size:11.5px;color:#a78bfa;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xp-wrap{margin-top:10px}
.xp-top{display:flex;justify-content:space-between;font-size:10px;font-weight:800;color:#c4b5fd;margin-bottom:4px}
.xp-bar{height:6px;background:#190d30;border-radius:999px;overflow:hidden;border:1px solid #2e1854}
.xp-fill{height:100%;background:linear-gradient(90deg,#8b5cf6,#ec4899);border-radius:999px;width:0%;transition:width .5s ease}
.body{padding:14px 16px}
.bio-box{background:#120921;border:1px solid #2b164d;border-left:3px solid #a855f7;border-radius:11px;padding:9px 12px;margin-bottom:14px}
.sec-lbl{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:1.1px;color:#9378bc;margin-bottom:4px}
.bio-txt{font-size:12px;color:#e9d5ff;line-height:1.4;word-break:break-word}
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
.info-item{background:#110820;border:1px solid #241342;border-radius:12px;padding:8px 10px}
.info-item.wide{grid-column:span 2}
.info-k{font-size:9.5px;font-weight:800;color:#8b74b0;text-transform:uppercase;letter-spacing:.6px}
.info-v{font-size:12.5px;font-weight:800;color:#f3e8ff;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.econ-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
.econ-card{background:linear-gradient(145deg,#170b2c,#0e061b);border:1px solid #351a63;border-radius:13px;padding:10px 11px;position:relative;overflow:hidden}
.econ-card.total{grid-column:span 2;background:linear-gradient(135deg,rgba(124,58,237,.18),rgba(219,39,119,.12));border-color:#6d28d9;display:flex;justify-content:space-between;align-items:center}
.econ-k{font-size:10px;font-weight:800;color:#c4b5fd;text-transform:uppercase;letter-spacing:.6px}
.econ-v{font-size:13px;font-weight:900;color:#fff;margin-top:3px;font-family:'Courier New',monospace}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;box-shadow:0 4px 15px rgba(139,92,246,.35)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#8b5cf6;color:#fff;font-size:11.5px;font-weight:800;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.6)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="banner">
    <div class="top-row">
      <span class="badge" id="roleBadge"></span>
      <span class="badge badge-id" id="idBadge" onclick="copyText(P.wbId, 'ID copiado')"></span>
    </div>
    <div class="profile-head">
      <div class="ava-wrap">
        <div class="ava-ring">
          <img id="avaImg" class="ava-img" style="display:none" alt="Avatar">
          <div id="avaFallback" class="ava-fallback">👤</div>
        </div>
        <div class="lvl-pill" id="lvlBadge"></div>
      </div>
      <div class="user-meta">
        <div class="user-name" id="fullName"></div>
        <div class="user-tag" id="tagName"></div>
        <div class="xp-wrap">
          <div class="xp-top">
            <span>✨ AURA POINTS</span>
            <span id="xpText"></span>
          </div>
          <div class="xp-bar"><div class="xp-fill" id="xpFill"></div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="body">
    <div class="bio-box">
      <div class="sec-lbl">📋 BIO</div>
      <div class="bio-txt" id="bioText"></div>
    </div>

    <div class="sec-lbl" style="margin-bottom:6px">👤 BASIC INFO</div>
    <div class="info-grid">
      <div class="info-item">
        <div class="info-k">⚧️ Género</div>
        <div class="info-v" id="valGender"></div>
      </div>
      <div class="info-item">
        <div class="info-k">🎈 Edad</div>
        <div class="info-v" id="valAge"></div>
      </div>
      <div class="info-item">
        <div class="info-k">🎂 Cumpleaños</div>
        <div class="info-v" id="valBday"></div>
      </div>
      <div class="info-item">
        <div class="info-k">🆔 Registro</div>
        <div class="info-v" id="valId"></div>
      </div>
      <div class="info-item wide">
        <div class="info-k">💍 Pareja</div>
        <div class="info-v" id="valPartner"></div>
      </div>
    </div>

    <div class="sec-lbl" style="margin-bottom:6px">📊 RANK & AURA ECONOMY</div>
    <div class="econ-grid">
      <div class="econ-card">
        <div class="econ-k">💵 Wallet</div>
        <div class="econ-v" id="valWallet"></div>
      </div>
      <div class="econ-card">
        <div class="econ-k">🏦 Bank</div>
        <div class="econ-v" id="valBank"></div>
      </div>
      <div class="econ-card total">
        <span class="econ-k">💎 Patrimonio Total</span>
        <span class="econ-v" id="valTotal" style="margin:0;color:#e9d5ff"></span>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" onclick="copyFullCard()">📋 Copiar Ficha</button>
      <button class="btn btn-sec" onclick="copyText(P.wbId, 'ID copiado')">🆔 Copiar ID</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const P = ${serialized};
function $(id){ return document.getElementById(id); }

function init(){
  if (P.avatarUri) {
    $("avaImg").src = P.avatarUri;
    $("avaImg").style.display = "block";
    $("avaFallback").style.display = "none";
  } else {
    $("avaFallback").textContent = (P.fullName || "U").charAt(0).toUpperCase();
  }
  $("roleBadge").textContent = "⚡ " + P.rankRole;
  $("idBadge").textContent = P.wbId;
  $("lvlBadge").textContent = "LVL " + P.level;
  $("fullName").textContent = P.fullName;
  $("tagName").textContent = P.tagName;
  $("xpText").textContent = P.points + " / " + P.nextLevelPoints + " XP";
  const pct = Math.min(100, Math.max(6, Math.round((P.points / Math.max(1, P.nextLevelPoints)) * 100)));
  setTimeout(function(){ $("xpFill").style.width = pct + "%"; }, 80);

  $("bioText").textContent = P.bio;
  $("valGender").textContent = P.gender;
  $("valAge").textContent = P.age;
  $("valBday").textContent = P.birthday;
  $("valId").textContent = P.wbId;
  $("valPartner").textContent = P.partner;
  $("valWallet").textContent = P.walletFmt;
  $("valBank").textContent = P.bankFmt;
  $("valTotal").textContent = P.totalFmt;
}

function copyText(txt, label){
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
  el.textContent = label || "Copiado";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

function copyFullCard(){
  const summary = [
    "╭〔 👤 PROFILE 〕⬣",
    "┃ 📋 ABOUT " + P.tagName,
    "╰━━━━━━━━━━━━⬣",
    "",
    "┏━━〔 BIO 〕━━⬣",
    "┃ " + P.bio,
    "┗━━━━━━━━━━━━⬣",
    "",
    "┏━━〔 BASIC INFO 〕━━⬣",
    "┃ 👤 Name › " + P.fullName,
    "┃ 🆔 ID › " + P.wbId,
    "┃ ⚧️ Gender › " + P.gender,
    "┃ 🎂 Birthday › " + P.birthday,
    "┃ 🎈 Age › " + P.age,
    "┃ 💍 Partner › " + P.partner,
    "┗━━━━━━━━━━━━⬣",
    "",
    "┏━━〔 RANK 〕━━⬣",
    "┃ 📊 Aura level › " + P.level,
    "┃ ✨ Aura points › " + P.points,
    "┃ 💵 Wallet › " + P.walletFmt,
    "┃ 🏦 Bank › " + P.bankFmt,
    "╰〔 ⚡ AURA REED 〕⬣"
  ].join("\\n");
  copyText(summary, "Ficha copiada al portapapeles");
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
  name: ["me", "profile", "perfil", "userinfo"],
  category: "rpg",
  description: "Muestra tu tarjeta de perfil interactiva con estadísticas de Aura y economía.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, sender, args, db, reply, react } = ctx;
    const quotedMsg = msg?.message?.extendedTextMessage?.contextInfo;
    const mentionedJid = quotedMsg?.mentionedJid?.[0];
    const quotedParticipant = quotedMsg?.participant;

    let targetJid = mentionedJid || quotedParticipant || sender || msg?.key?.participant || from;
    if (args?.[0] && /^\+?\d{7,15}$/.test(args[0].replace(/\D/g, ""))) {
      targetJid = `${args[0].replace(/\D/g, "")}@s.whatsapp.net`;
    }

    await react("🟣").catch(() => undefined);

    const dbAny = db as any;
    const cleanPhone = String(targetJid || "")
      .split("@")[0]
      .split(":")[0]
      .replace(/\D/g, "");

    const userRecord =
      dbAny?.getUser?.(targetJid) ||
      (cleanPhone ? dbAny?.getUser?.(`${cleanPhone}@s.whatsapp.net`) : null) ||
      {};
    const uData =
      typeof userRecord?.data === "string"
        ? (() => {
            try {
              return JSON.parse(userRecord.data);
            } catch {
              return {};
            }
          })()
        : userRecord?.data || {};

    const fullName = String(
      userRecord?.name ||
        uData?.name ||
        userRecord?.username ||
        userRecord?.pushName ||
        (targetJid === sender ? msg?.pushName : "") ||
        `+${cleanPhone || "Usuario"}`,
    ).trim();

    const tagName = `@${userRecord?.pushName || userRecord?.username || cleanPhone || "user"}`;
    const wbId = String(
      userRecord?.custom_id ||
        userRecord?.wb_id ||
        uData?.id ||
        uData?.wbId ||
        `WB${cleanPhone || "0000000000"}`,
    ).trim();

    let statusBio = String(
      userRecord?.bio ||
        userRecord?.description ||
        uData?.bio ||
        uData?.description ||
        "",
    ).trim();

    if (!statusBio && typeof sock?.fetchStatus === "function") {
      try {
        const st = await Promise.race([
          sock.fetchStatus(targetJid),
          new Promise<any>((resolve) => setTimeout(() => resolve(null), 2000)),
        ]);
        const fetched = Array.isArray(st) ? st[0]?.status?.status || st[0]?.status : st?.status;
        if (typeof fetched === "string" && fetched.trim()) {
          statusBio = fetched.trim();
        }
      } catch {}
    }
    if (!statusBio) statusBio = "Sin biografía establecida.";

    const gender = String(
      userRecord?.gender || uData?.gender || userRecord?.genero || uData?.genero || "No especificado",
    ).trim();

    const birthday = String(
      userRecord?.birthday ||
        userRecord?.birthdate ||
        uData?.birthday ||
        uData?.birthdate ||
        "No registrado",
    ).trim();

    const computedAge = calculateAgeFromBirthday(birthday);
    const age = String(
      userRecord?.age || uData?.age || computedAge || "N/A",
    ).trim();

    const rawPartner = String(
      userRecord?.partner ||
        userRecord?.marry ||
        uData?.partner ||
        uData?.marry ||
        "",
    ).trim();

    let partnerDisplay = "Soltero/a";
    if (rawPartner) {
      const partnerClean = rawPartner.split("@")[0].split(":")[0].replace(/\D/g, "");
      const partnerRec =
        dbAny?.getUser?.(rawPartner) ||
        (partnerClean ? dbAny?.getUser?.(`${partnerClean}@s.whatsapp.net`) : null);
      const partnerName =
        partnerRec?.pushName ||
        partnerRec?.username ||
        partnerRec?.name ||
        partnerRec?.data?.name ||
        (partnerClean ? `+${partnerClean}` : rawPartner);
      partnerDisplay = `@${partnerName}`;
    }

    const level = Number(
      userRecord?.level ??
        userRecord?.aura_level ??
        uData?.level ??
        uData?.auraLevel ??
        1,
    );

    const points = Number(
      userRecord?.exp ??
        userRecord?.xp ??
        userRecord?.points ??
        userRecord?.aura_points ??
        uData?.exp ??
        uData?.points ??
        uData?.auraPoints ??
        0,
    );

    const nextLevelPoints = Math.max(points + 100, level * 250);

    const wallet = Number(
      userRecord?.wallet ??
        userRecord?.coins ??
        userRecord?.money ??
        userRecord?.balance ??
        uData?.wallet ??
        uData?.coins ??
        0,
    );

    const bank = Number(
      userRecord?.bank ??
        userRecord?.banco ??
        uData?.bank ??
        0,
    );

    const rankRole =
      level >= 50
        ? "AURA OVERLORD"
        : level >= 25
          ? "AURA MASTER"
          : level >= 10
            ? "AURA ELITE"
            : level >= 4
              ? "AURA KNIGHT"
              : "AURA NOVICE";

    const avatarUri = await fetchAvatarDataUri(sock, targetJid);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle(`👤 PROFILE // ${fullName.toUpperCase()}`)
        .setFooter("⚡ AURA REED • Perfil Interactivo");

      rich.addSection(
        buildProfileRichPayload({
          tagName,
          fullName,
          wbId,
          bio: statusBio,
          gender,
          birthday,
          age,
          partner: partnerDisplay,
          level,
          points,
          nextLevelPoints,
          walletFmt: formatAuraCoins(wallet),
          bankFmt: formatAuraCoins(bank),
          totalFmt: formatAuraCoins(wallet + bank),
          rankRole,
          avatarUri,
        }),
      );

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      await reply(
        `${fytBold("Error")} al renderizar el perfil: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
