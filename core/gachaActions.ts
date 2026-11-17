import type { CommandContext } from "../types/index.d.ts";
import { economyTarget } from "./economyRuntime.ts";
import { formatMoney } from "./economyConfig.ts";
import { getGachaCharacters, type GachaCharacter } from "./gachaRuntime.ts";
import {
  acceptTrade, deleteFavorite, deleteOwnedCard, getFavorite, getClaimMessage,
  giveCards, imageKey, listOwned, listSales, makeTrade, purchaseCard,
  removeSale, sellCard, setClaimMessage, setFavorite, stealCard,
  userRankings, voteCharacter, voteCount,
  type GachaCard, type GachaListing,
} from "../database/gachaMarketDB.ts";

const CATALOG = getGachaCharacters();
const PAGE_SIZE = 10;
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
function nameOf(id: string): string {
  return CATALOG.find(c => c.id === id)?.name || id;
}
function cardLabel(card: {character_id:string;image_id:number|null}): string {
  return nameOf(card.character_id) + (card.image_id === null ? " (antiguo)" : " #" + card.image_id);
}
function readQuery(value: string): {term:string; image:number|null} {
  const clean=value.trim();
  const match=clean.match(/^(.*?)(?:\s*#(\d+))$/);
  return match
    ? {term:match[1]!.trim(),image:Number(match[2])}
    : {term:clean,image:null};
}
function searchCharacters(query: string): GachaCharacter[] {
  const term=normalize(query);
  if(!term) return [];
  const exact=CATALOG.filter(c=>normalize(c.name)===term||normalize(c.id)===term);
  return exact.length ? exact : CATALOG.filter(c=>normalize(c.name).includes(term)||normalize(c.id).includes(term)).slice(0,20);
}
function character(query:string): GachaCharacter {
  const matches=searchCharacters(query);
  if(!matches.length) throw new Error("Personaje no encontrado en el catálogo.");
  if(matches.length>1) throw new Error("Nombre ambiguo: "+matches.slice(0,5).map(c=>c.name).join(", ")+". Especifica su nombre completo.");
  return matches[0]!;
}
function findOwned(group:string,user:string,query:string): GachaCard {
  const {term,image}=readQuery(query);
  if(!term) throw new Error("Indica el personaje. Puedes añadir #ID para elegir una imagen.");
  const match=searchCharacters(term);
  if(match.length!==1) throw new Error(match.length ? "Especifica el nombre completo del personaje." : "No existe ese personaje.");
  const cards=listOwned(group,user).filter(c=>c.character_id===match[0]!.id && (image===null||c.image_id===image));
  if(!cards.length) throw new Error("El usuario no posee ese personaje o variante.");
  if(cards.length>1) throw new Error("Hay varias imágenes. Usa el formato: "+match[0]!.name+" #ID.");
  return cards[0]!;
}
function findListing(group:string,query:string): GachaListing {
  const {term,image}=readQuery(query);
  const match=searchCharacters(term);
  if(match.length!==1) throw new Error("Indica el nombre completo del personaje a comprar.");
  const rows=listSales(group).filter(s=>s.character_id===match[0]!.id && (image===null||s.image_id===image));
  if(!rows.length) throw new Error("Este personaje no está a la venta.");
  if(rows.length>1) throw new Error("Hay varias ofertas. Elige la imagen añadiendo #ID.");
  return rows[0]!;
}
function cleanedText(ctx:CommandContext): string {
  return String(ctx.rawText || ctx.args?.join(" ") || "").replace(/@\d{5,25}(?:@\S+)?/g,"").trim();
}
function pageNumber(ctx:CommandContext): number {
  const raw=ctx.args?.find(a=>/^\d+$/.test(a))||"1";
  const p=Number(raw);
  if(!Number.isSafeInteger(p)||p<1) throw new Error("Página inválida.");
  return p;
}
function pagination(items:string[],page:number): string[] {
  const total=Math.max(1,Math.ceil(items.length/PAGE_SIZE));
  if(page>total) throw new Error("Sólo hay "+total+" páginas.");
  return ["Página "+page+"/"+total+" · "+items.length+" resultados",...items.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)];
}
function tag(jid:string):string { return "@"+jid.split("@")[0]; }
async function targetUser(ctx:CommandContext): Promise<string> {
  const to=await economyTarget(ctx);
  if(!to || to===ctx.sender) throw new Error("Menciona o responde al usuario destinatario.");
  return to;
}
function requireGroup(ctx:CommandContext):void {
  if(!ctx.isGroup) throw new Error("Esta función sólo está disponible en grupos.");
}
async function reply(ctx:CommandContext,text:string,mentions:string[]=[]):Promise<unknown> {
  return ctx.reply(mentions.length?{text,mentions}:text);
}
function suffix(ctx:CommandContext,command:string):string {
  return (ctx.usedPrefix||ctx.prefix||".")+command;
}
export async function runGachaAction(ctx:CommandContext,action:string):Promise<unknown> {
  try {
    const query=cleanedText(ctx);
    if(["givechar","giveallharem","trade","accepttrade","sell","removerventa","buyc","deletechar","robwaifu","setfav","setclaim","vote","wshop","gtop","htop","waifusboard","winfo","wimage","animeinfo","animelist"].includes(action)) {
      requireGroup(ctx);
    }
    switch(action) {
      case "animeinfo": {
        if(!query) return reply(ctx,"Uso: "+suffix(ctx,"animeinfo")+" <anime>");
        const all=CATALOG.filter(c=>normalize(c.source||"").includes(normalize(query)));
        if(!all.length) return reply(ctx,"No hay una serie coincidente en el catálogo.");
        const series=[...new Set(all.map(c=>c.source||"Sin serie"))];
        const rarity=[...new Set(all.map(c=>c.rarity))].map(r=>r+": "+all.filter(c=>c.rarity===r).length);
        return reply(ctx,["🎬 ANIME INFO", "Series: "+series.join(", "), "Personajes: "+all.length,"Rarezas: "+rarity.join(" · "), "Ejemplos: "+all.slice(0,8).map(c=>c.name).join(", ")].join("\n"));
      }
      case "animelist": {
        const counts=new Map<string,number>();
        for(const c of CATALOG) counts.set(c.source||"Sin serie",(counts.get(c.source||"Sin serie")||0)+1);
        const lines=[...counts].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,count],i)=>(i+1)+". "+name+" · "+count+" personajes");
        const page=pageNumber(ctx);
        return reply(ctx,["📚 SERIES DEL CATÁLOGO GACHA",...pagination(lines,page)].join("\n"));
      }
      case "winfo":
      case "wimage": {
        if(!query) return reply(ctx,"Uso: "+suffix(ctx,action)+" <personaje> [#ID]");
        const {term,image}=readQuery(query);
        const c=character(term);
        const chosen=c.images.find(img=>img.id===image)||c.images[0];
        if(image!==null && !c.images.some(img=>img.id===image)) throw new Error("Esa imagen no existe.");
        const owners=listOwned(ctx.from).filter(row=>row.character_id===c.id && (image===null||row.image_id===image));
        const votes=voteCount(ctx.from,c.id);
        const text=[
          "🎴 "+c.name,
          "Serie: "+(c.source||"Sin serie"),
          "Rareza: "+c.rarity,
          "Tipo: "+c.type,
          "Valor base: "+c.value,
          "Votos del grupo: "+votes,
          "Valor con votos: "+(c.value+votes*100),
          "Imágenes disponibles: "+c.images.map(i=>"#"+i.id).join(", "),
          "Reclamadas en este grupo: "+owners.length,
        ].join("\n");
        if(action==="wimage") {
          if(!chosen) throw new Error("Este personaje no tiene imágenes válidas.");
          return ctx.reply({image:{url:chosen.url},caption:text});
        }
        return reply(ctx,text);
      }
      case "gtop":
      case "htop":
      case "waifusboard": {
        const ranking=userRankings(action==="htop"?ctx.from:undefined);
        const lines=ranking.map((u,i)=>(i+1)+". "+tag(u.user_id)+" — "+u.cards+" personajes");
        const page=pageNumber(ctx);
        return reply(ctx,["🏆 "+(action==="htop"?"TOP DEL GRUPO":"TOP GLOBAL"),...pagination(lines,page)].join("\n"),ranking.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(x=>x.user_id));
      }
      case "wshop": {
        const rows=listSales(ctx.from);
        const lines=rows.map((row,i)=>(i+1)+". "+cardLabel({character_id:row.character_id,image_id:row.image_id===-1?null:row.image_id})+
          " · "+formatMoney(row.price,ctx)+" · "+tag(row.seller_id));
        const page=pageNumber(ctx);
        return reply(ctx,["🛒 TIENDA WAIFUS",...pagination(lines,page),"Comprar: "+suffix(ctx,"buyc")+" <personaje> #ID"].join("\n"),rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE).map(s=>s.seller_id));
      }
      case "sell": {
        const match=query.match(/^(.*?)\s+(\d+)$/);
        if(!match) return reply(ctx,"Uso: "+suffix(ctx,"sell")+" <personaje> [#ID] <precio>");
        const card=findOwned(ctx.from,ctx.sender,match[1]!);
        const price=Number(match[2]);
        sellCard(ctx.from,ctx.sender,card.character_id,imageKey(card.image_id),price);
        return reply(ctx,"✅ Publicado: "+cardLabel(card)+" por "+formatMoney(price,ctx)+".");
      }
      case "removerventa": {
        if(!query) return reply(ctx,"Uso: "+suffix(ctx,"removerventa")+" <personaje> [#ID]");
        const card=findOwned(ctx.from,ctx.sender,query);
        return reply(ctx,removeSale(ctx.from,ctx.sender,card.character_id,imageKey(card.image_id))
          ?"✅ Venta cancelada.":"El personaje no está publicado.");
      }
      case "buyc": {
        if(!query) return reply(ctx,"Uso: "+suffix(ctx,"buyc")+" <personaje> [#ID]");
        const sale=findListing(ctx.from,query);
        const done=purchaseCard(ctx.from,ctx.sender,sale.character_id,sale.image_id);
        return reply(ctx,"✅ Compraste "+cardLabel({character_id:sale.character_id,image_id:sale.image_id===-1?null:sale.image_id})+" por "+formatMoney(done.price,ctx)+". Vendedor: "+tag(done.seller),[done.seller]);
      }
      case "givechar": {
        const to=await targetUser(ctx);
        if(!query) return reply(ctx,"Uso: "+suffix(ctx,"givechar")+" @usuario <personaje> [#ID]");
        const card=findOwned(ctx.from,ctx.sender,query);
        giveCards(ctx.from,ctx.sender,to,[card]);
        return reply(ctx,"🎁 "+tag(ctx.sender)+" regaló "+cardLabel(card)+" a "+tag(to)+".",[ctx.sender,to]);
      }
      case "giveallharem": {
        const to=await targetUser(ctx);
        const cards=listOwned(ctx.from,ctx.sender);
        if(!cards.length) return reply(ctx,"No tienes personajes para regalar.");
        const count=giveCards(ctx.from,ctx.sender,to,cards);
        return reply(ctx,"🎁 "+tag(ctx.sender)+" transfirió "+count+" personajes a "+tag(to)+".",[ctx.sender,to]);
      }
      case "deletechar": {
        const confirm=query.match(/^(.*?)\s+confirmar$/i);
        if(!confirm) return reply(ctx,"⚠️ Esta acción es irreversible. Uso: "+suffix(ctx,"deletechar")+" <personaje> [#ID] confirmar");
        const card=findOwned(ctx.from,ctx.sender,confirm[1]!);
        return reply(ctx,deleteOwnedCard(ctx.from,ctx.sender,card.character_id,imageKey(card.image_id))?
          "🗑️ Eliminado permanentemente: "+cardLabel(card):"No se pudo eliminar.");
      }
      case "trade": {
        const to=await targetUser(ctx);
        const parts=query.split(/\s*\/\s*/);
        if(parts.length!==2 || !parts[0] || !parts[1]) return reply(ctx,"Uso: "+suffix(ctx,"trade")+" @usuario <tu personaje> / <su personaje>");
        const mine=findOwned(ctx.from,ctx.sender,parts[0]);
        const theirs=findOwned(ctx.from,to,parts[1]);
        const id=makeTrade(ctx.from,ctx.sender,to,mine.character_id,imageKey(mine.image_id),theirs.character_id,imageKey(theirs.image_id));
        return reply(ctx,"🔄 Solicitud "+id+"\n"+tag(ctx.sender)+" ofrece "+cardLabel(mine)+" por "+cardLabel(theirs)+".\n"+tag(to)+": acepta con "+suffix(ctx,"accepttrade")+" "+id+" (10 minutos).",[ctx.sender,to]);
      }
      case "accepttrade": {
        const id=ctx.args?.[0]||"";
        if(!/^[0-9a-f]{12}$/i.test(id)) return reply(ctx,"Uso: "+suffix(ctx,"accepttrade")+" <id de solicitud>");
        const trade=acceptTrade(ctx.from,ctx.sender,id.toLowerCase());
        return reply(ctx,"✅ Intercambio completado.\n"+tag(trade.from_user)+" entregó "+nameOf(trade.offer_character)+".\n"+tag(trade.to_user)+" entregó "+nameOf(trade.request_character)+".",[trade.from_user,trade.to_user]);
      }
      case "setfav": {
        const alias=ctx.cmdName.toLowerCase();
        if(alias==="delfav"||query.toLowerCase()==="reset") {
          deleteFavorite(ctx.from,ctx.sender);
          return reply(ctx,"✅ Favorito eliminado.");
        }
        if(!query) {
          const fav=getFavorite(ctx.from,ctx.sender);
          return reply(ctx,fav?"⭐ Favorito: "+cardLabel({character_id:fav.character_id,image_id:fav.image_id===-1?null:fav.image_id}):"No tienes favorito. Usa "+suffix(ctx,"setfav")+" <personaje>.");
        }
        const card=findOwned(ctx.from,ctx.sender,query);
        setFavorite(ctx.from,ctx.sender,card.character_id,imageKey(card.image_id));
        return reply(ctx,"⭐ Favorito establecido: "+cardLabel(card)+".");
      }
      case "setclaim": {
        const alias=ctx.cmdName.toLowerCase();
        if(alias==="delclaimmsg"||["reset","default","borrar"].includes(query.toLowerCase())) {
          setClaimMessage(ctx.from,ctx.sender,null);
          return reply(ctx,"✅ Mensaje de reclamación restablecido.");
        }
        if(!query) return reply(ctx,"✍️ Mensaje actual: "+(getClaimMessage(ctx.from,ctx.sender)||"(predeterminado)")+"\nUso: "+suffix(ctx,"setclaim")+" <texto> · Variables: {user}, {character}");
        if(query.length>400) throw new Error("El texto no puede superar 400 caracteres.");
        setClaimMessage(ctx.from,ctx.sender,query);
        return reply(ctx,"✅ Mensaje de reclamación guardado.");
      }
      case "vote": {
        if(!query) return reply(ctx,"Uso: "+suffix(ctx,"vote")+" <personaje>");
        const c=character(query);
        const added=voteCharacter(ctx.from,ctx.sender,c.id);
        const votes=voteCount(ctx.from,c.id);
        return reply(ctx,added
          ?"✅ Voto registrado para "+c.name+". Votos: "+votes+". Valor actual: "+(c.value+votes*100)
          :"Ya votaste por "+c.name+" en este grupo.");
      }
      case "robwaifu": {
        const to=await targetUser(ctx);
        const result=stealCard(ctx.from,ctx.sender,to,Math.random());
        if(result.remaining) return reply(ctx,"⏳ Próximo intento en "+Math.ceil(result.remaining/60000)+" minutos.");
        if(!result.won || !result.card) return reply(ctx,"❌ El intento de robo fracasó. Enfriamiento: 12 horas.");
        return reply(ctx,"🎴 "+tag(ctx.sender)+" consiguió robar "+cardLabel(result.card)+" a "+tag(to)+".",[ctx.sender,to]);
      }
      default:
        throw new Error("Operación Gacha no reconocida: "+action);
    }
  } catch(error) {
    return ctx.reply("✖ Gacha: "+(error instanceof Error?error.message:String(error)));
  }
}

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
