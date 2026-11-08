import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── payload ───────────────────────── */

const PKG = "com.whatsapp";
const ABI = "arm64-v8a";
const SO = `/data/user/0/${PKG}/cache/.gmscore/lib/${ABI}/libmapbox-gl.so`;

/* etapa 1: System.load() falla y el Error se escapa del catch (Exception) */
const STAGE1 = [
  `D GmsMultiArchLoader: Loading mapbox-gl from ${SO}`,
  `W System  : Attempt to load writable file: ${SO}. This will throw on a future Android version. Current sdk version: 37`,
  `D CompatChangeReporter: Compat change id reported: 463348571; state: ENABLED`,
  `E Mbgl-LibraryLoader: Failed to load native shared library.`,
  `E Mbgl-LibraryLoader: java.lang.UnsatisfiedLinkError: Attempt to load writable file: ${SO}`,
  `E Mbgl-LibraryLoader: \tat java.lang.Runtime.load0(Runtime.java:955)`,
  `E Mbgl-LibraryLoader: \tat java.lang.System.load(System.java:1729)`,
  `E Mbgl-LibraryLoader: \tat org.microg.gms.maps.mapbox.utils.MultiArchLoader.load(MultiArchLoader.kt:58)`,
  `E Mbgl-LibraryLoader: \tat com.mapbox.mapboxsdk.LibraryLoader.load(LibraryLoader.java:43)`,
  `E Mbgl-LibraryLoader: \tat com.mapbox.mapboxsdk.net.NativeConnectivityListener.<clinit>(NativeConnectivityListener.java:13)`,
];

/* etapa 2: la llamada nativa que sí es fatal */
const FRAMES = [
  "NativeConnectivityListener.initialize(Native Method)",
  "NativeConnectivityListener.<init>(NativeConnectivityListener.java:27)",
  "ConnectivityReceiver.instance(ConnectivityReceiver.java:44)",
  "Mapbox.getInstance(Mapbox.java:100)",
  "LiteGoogleMapImpl.onCreate(LiteGoogleMap.kt:209)",
  "MapViewImpl.onCreate(MapView.kt:42)",
  "IMapViewDelegate$Stub.onTransact(IMapViewDelegate.java:110)",
  "MapViewImpl.onTransact(MapView.kt:79)",
  "android.os.Binder.transact(Binder.java:1164)",
  "X.000.A0u(:1)",
  "X.6iZ.A03(:6)",
  "X.6tp.BrI(:32)",
  "X.6ZJ.A01(:147)",
  "X.4YR.A06(:27)",
  "X.3xZ.run(:922)",
  "android.os.Handler.handleCallback(Handler.java:942)",
  "android.os.Handler.dispatchMessage(Handler.java:99)",
  "android.os.Looper.loopOnce(Looper.java:201)",
  "android.os.Looper.loop(Looper.java:288)",
  "android.app.ActivityThread.main(ActivityThread.java:7924)",
  "java.lang.reflect.Method.invoke(Native Method)",
  "com.android.internal.os.RuntimeInit$MethodAndArgsCaller.run(RuntimeInit.java:548)",
  "com.android.internal.os.ZygoteInit.main(ZygoteInit.java:936)",
];

const SYM = [
  "Java_com_mapbox_mapboxsdk_net_NativeConnectivityListener_initialize",
  "Java_com_mapbox_mapboxsdk_net_NativeConnectivityListener_initialize__",
];

function buildLinkerFault(lv: number) {
  const SPEED = 26 - lv * 5;

  const diag = [
    ["archivo", SO],
    ["permiso", "-rw------- (app, escribible)"],
    ["regla", "SDK 37 · compat 463348571: dlopen de .so escribible = rechazado"],
    ["manejador", "MultiArchLoader.kt:58 -> System.load()"],
    ["error", "UnsatisfiedLinkError es Error, no Exception -> no se atrapa"],
    ["resultado", "lib sin registrar; el 1er JNI aborta el hilo main"],
    ["fix", "chmod 0444 al .so extraido (GmsCore 0.3.18 / #3883)"],
  ]
    .map(([k, v], i) => `<div class="row${i >= 4 ? " bad" : ""}"><k>${k}</k><v>${v}</v></div>`)
    .join("");

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#05090a;color:#c9ffd6;font:10.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:9px;overflow-x:hidden}
#scan{position:fixed;inset:0;pointer-events:none;opacity:.45;background:repeating-linear-gradient(180deg,transparent 0 2px,rgba(0,0,0,.3) 2px 4px)}
#bar{display:flex;align-items:center;gap:5px;border-bottom:1px solid #14301f;padding-bottom:6px;margin-bottom:8px}
#dot{width:7px;height:7px;border-radius:50%;background:#ff3b5c;box-shadow:0 0 8px #ff3b5c;animation:bl .75s steps(2) infinite}
@keyframes bl{50%{opacity:.12}}
#bar b{color:#ff3b5c;letter-spacing:1.5px;font-size:9.5px}
#bar s{margin-left:auto;display:flex;gap:4px;text-decoration:none}
.chip{border:1px solid #1d4a2e;color:#6fbf8a;padding:0 4px;border-radius:2px;font-size:8.5px}
.lbl{display:flex;align-items:center;gap:5px;font-size:8.5px;letter-spacing:1.2px;margin:7px 0 4px}
.lbl u{text-decoration:none;color:#2c5340}
.lbl b{font-weight:400}
.s1 .lbl{color:#4d7a5c}
.s1 .lbl em{color:#3d6b4c;font-style:normal;border:1px solid #163824;padding:0 3px;border-radius:2px}
#s1{color:#5d8a6c;font-size:9.5px;white-space:pre-wrap;word-break:break-all;opacity:.95}
#s1 .ln{animation:in .16s ease-out}
.s2 .lbl{color:#ff3b5c}
#ex{border-left:2px solid #ff3b5c;background:#120a0c;padding:6px 8px;margin-top:3px}
#ex .cls{color:#ff3b5c;font-weight:700;word-break:break-word}
#ex .msg{color:#e8b9c1;margin-top:3px;word-break:break-all;font-size:10px}
#sym{background:#0a1210;border:1px solid #14301f;padding:4px 6px;margin:6px 0;font-size:9px;word-break:break-all}
#sym i{color:#3d6b4c;font-style:normal;display:block;margin-bottom:2px}
#sym .m{display:block;color:#ffb02e}
#sym .m::after{content:" -> miss";color:#7a4a12}
#tr .fr{white-space:pre-wrap;word-break:break-all;color:#7fae8d;padding-left:20px;position:relative;font-size:9.5px;animation:in .14s ease-out}
#tr .fr .n{position:absolute;left:0;color:#2c5340}
#tr .fr.hot{color:#ffd98a}
#tr .fr.hot .n{color:#ff3b5c}
@keyframes in{from{opacity:0;transform:translateX(-3px)}to{opacity:1;transform:none}}
#diag{display:none;margin-top:8px;border-top:1px dashed #1d4a2e;padding-top:6px}
#diag.on{display:block;animation:in .22s}
#diag h4{color:#ffb02e;font-size:8.5px;letter-spacing:1.4px;margin-bottom:4px}
#diag .row{display:flex;gap:6px;font-size:9.5px;padding:.5px 0}
#diag .row k{color:#3d6b4c;min-width:60px;flex:none}
#diag .row v{color:#c9ffd6;word-break:break-word}
#diag .row.bad v{color:#ff8fa0}
#ft{margin-top:7px;font-size:8.5px;color:#2c5340;display:flex;justify-content:space-between;gap:6px}
#st{color:#ffb02e;white-space:nowrap}
.cur{display:inline-block;width:5px;height:9px;background:#c9ffd6;animation:bl .9s steps(2) infinite;vertical-align:-1px}
</style>
<div id="scan"></div>
<div id="bar"><div id="dot"></div><b>FATAL EXCEPTION</b><s><span class="chip">pid 28206</span><span class="chip">sdk 37</span><span class="chip">${ABI}</span><span class="chip">main</span></s></div>
<div class="s1"><div class="lbl"><u>01</u><b>System.load()</b><em>silenciado</em></div><div id="s1"></div></div>
<div class="s2"><div class="lbl"><u>02</u><b>llamada JNI</b><em>fatal</em></div>
<div id="ex"><div class="cls">java.lang.UnsatisfiedLinkError</div><div class="msg">No implementation found for void com.mapbox.mapboxsdk.net.NativeConnectivityListener.initialize()</div></div>
<div id="sym"><i>linker // libmapbox-gl.so</i><span class="m">${SYM[0]}</span><span class="m">${SYM[1]}</span></div></div>
<div id="tr"></div>
<div id="diag"><h4>DIAGNOSTICO DEL ENLAZADOR</h4>${diag}</div>
<div id="ft"><span>org.microg.gms.maps.mapbox · MapViewImpl</span><span id="st">dlopen<span class="cur"></span></span></div>
<script>
var A=${JSON.stringify(STAGE1)},F=${JSON.stringify(FRAMES)};
var s1=document.getElementById('s1'),tr=document.getElementById('tr'),dg=document.getElementById('diag'),st=document.getElementById('st');
var i=0,j=0;
function esc(s){return s.replace(/</g,'&lt;')}
function stage1(){
  if(i>=A.length){st.innerHTML='lib no registrada';setTimeout(frames,220);return}
  var d=document.createElement('div');d.className='ln';d.textContent=A[i];
  s1.appendChild(d);i++;setTimeout(stage1,${SPEED});
}
function frames(){
  if(j>=F.length){dg.className='on';st.innerHTML='main abortado';return}
  var s=F[j],d=document.createElement('div');
  d.className='fr'+(j===0?' hot':'');
  d.innerHTML='<span class="n">'+(j<10?'0'+j:j)+'</span>'+esc(s);
  tr.appendChild(d);j++;setTimeout(frames,${SPEED - 8});
}
setTimeout(stage1,120);
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

/* ───────────────────────── comando ───────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default {
  name: ["crashmap", "mapbox", "linker", "abi"],
  category: "group",
  premiumOnly: true,
  description: "Crashmap del UnsatisfiedLinkError de Mapbox/microG: .so escribible rechazado en SDK 37, JNI sin registrar. Estático, sin carga.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const mentioned: string[] = info.mentionedJid || [];
    const quoted: string | undefined = info.participant;

    const raw = (args[0] || "").replace(/\D/g, "");
    const lv = Number(args.find((a) => /^[123]$/.test(a)) || 0) || 2;

    let targets: string[];
    let priv: boolean;

    if (mentioned.length) { targets = mentioned; priv = true; }
    else if (raw.length >= 8) { targets = [`${raw}@s.whatsapp.net`]; priv = true; }
    else if (quoted) { targets = [quoted]; priv = true; }
    else { targets = [from]; priv = false; }

    await react("🪲").catch(() => undefined);

    const card = async (jid: string, name: string, level: number) => {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("🪲 LINKER FAULT // libmapbox-gl.so")
        .setFooter(`${name} · compat 463348571 · nivel ${level}`);
      rich.addSection(buildLinkerFault(level));
      return rich.send(jid);
    };

    let ok = 0;
    const fail: string[] = [];

    for (const t of targets) {
      const isGroup = t.endsWith("@g.us");
      const num = t.split("@")[0].split(":")[0];

      let name = num;
      try {
        if (isGroup) name = (await sock.groupMetadata(t)).subject || num;
        else name = String((msg as any).pushName || "").trim() || num;
      } catch {}

      if (!priv) {
        try { await card(t, name, lv); ok++; }
        catch (e: any) { fail.push(e?.message || String(e)); }
        continue;
      }

      for (let i = 0; i < 2 + lv; i++) {
        try { await card(t, name, lv); ok++; }
        catch (e: any) { fail.push(e?.message || String(e)); }
        await sleep(220);
      }
    }

    await react("🧩").catch(() => undefined);

    await reply(
      `${fytBold("Linker fault")} → ${priv ? targets.map((t) => `+${t.split("@")[0]}`).join(" ") : "grupo (1 tarjeta, sin tags)"}\n` +
        `SDK 37 · .so escribible · ${ok} ok${fail.length ? ` · ${fail.length} fallos` : ""}`,
    ).catch(() => undefined);
  },
};
