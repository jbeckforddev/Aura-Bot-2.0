import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const PHRASES = [
  "Toca aquí para continuar",
  "Toca esta línea",
  "No toques la siguiente",
  "Toca aquí 15 veces",
  "Toca para desbloquear",
  "Mantén y suelta",
  "Toca el punto negro",
  "Toca aquí ahora",
  "Toca dos veces",
  "Toca para verificar",
  "Toca aquí, no ahí",
  "Toca la línea siguiente",
  "Toca y espera",
  "Toca para sincronizar",
  "Toca el texto pequeño",
  "Toca para reparar",
  "Toca aquí primero",
  "Toca para activar",
  "Toca la última línea",
  "Toca para cerrar",
];

function tapCard(text: string, idx: number, seed: string) {
  const reps = 15;
  const lines = Array.from({ length: reps }, (_, i) => `<i data-k="${i}">${i + 1}. ${text}</i>`).join("");

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:ui-monospace,Menlo,monospace;background:#05070c;color:#cfe9ff;padding:7px}
.c{border:1px solid #1e3a5f;border-radius:10px;overflow:hidden;background:#080d15}
.h{padding:5px 8px;border-bottom:1px solid #14304d;font-size:9px;letter-spacing:1.6px;color:#5eb4ff;background:#061019;display:flex;justify-content:space-between}
.h b{color:#facc15}
.l{padding:6px}
i{display:block;font-style:normal;font-size:10px;padding:4px 6px;margin-bottom:2px;border:1px solid #12293f;border-radius:5px;cursor:pointer;color:#9fc6e8}
i.on{background:#0b2233;border-color:#2b6f9e;color:#5eb4ff}
</style>
<div class="c">
<div class="h"><span>BLOQUE ${idx}</span><b id="n">0/15</b></div>
<div class="l">${lines}</div>
</div>
<script>
(function(){
  var n=0,el=document.getElementById('n'),S="${seed}${idx}";
  document.querySelectorAll('i').forEach(function(e){
    e.addEventListener('pointerdown',function(){
      if(e.classList.contains('on'))return;
      e.classList.add('on');n++;el.textContent=n+'/15';
      try{navigator.vibrate&&navigator.vibrate(8)}catch(x){}
    });
  });
})();
</script>`;

  return {
    __typename: "GenAIUnifiedResponseSection",
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "GenAIaeacdsnwHtmlPrimitive",
        payload: html,
        trusted_sources: [],
      },
    },
  };
}

export default {
  name: ["crashv3", "v3"],
  category: "group",
  description: "Satura un solo mensaje con decenas de textos que hay que tocar.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const n = Math.min(60, Math.max(6, Number(args[0]) || 28));
    const seed = randomUUID().slice(0, 6);

    await react("👆").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle(`👆 CRASH V3 · ${n} bloques`)
        .setFooter("toca todas las líneas de todos los bloques");

      rich.addSection({
        __typename: "GenAIUnifiedResponseSection",
        view_model: {
          __typename: "GenAISingleLayoutViewModel",
          primitive: {
            __typename: "GenAIBotProgressStatusPrimitive",
            title: "Generando bloques de toque…",
            is_in_progress: true,
          },
        },
      });

      for (let i = 1; i <= n; i++) {
        rich.addSection(tapCard(PHRASES[(i - 1) % PHRASES.length], i, seed));
      }

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`${fytBold("Error")}: ${e?.message || e}`).catch(() => undefined);
    }
  },
};
