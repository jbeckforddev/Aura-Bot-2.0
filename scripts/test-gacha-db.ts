import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import Database from "better-sqlite3";

// Aislamiento obligatorio: el archivo de producción nunca se abre durante estas pruebas.
const sandbox = mkdtempSync(join(tmpdir(), "aura-gacha-test-"));
await import("../config.ts");
globalThis.DATA_BASE_DIR = sandbox;
const { db } = await import("../database/AuraDB.ts");
const market = await import("../database/gachaMarketDB.ts");
const original = await import("../database/gachaDB.ts");
const sqlite = new Database(join(sandbox, "GachaAura.db"));
sqlite.pragma("busy_timeout = 15000");
after(() => {
  sqlite.close();
  rmSync(sandbox, { recursive: true, force: true });
});

const group = "gacha-test@g.us";
const alice = "alice@s.whatsapp.net";
const bob = "bob@lid";
const carol = "carol@s.whatsapp.net";
function card(character:string,image:number,user:string):void {
  sqlite.prepare("INSERT INTO GachaImageOwnership(group_id,character_id,image_id,user_id,claimed_at,source_message_id) VALUES(?,?,?,?,?,?)")
    .run(group,character,image,user,Date.now(),"test-"+character+"-"+image);
}
test("ventas y compra descuentan y abonan monedas sin duplicar propiedad", () => {
  db.getUser(alice);
  db.getUser(bob);
  card("asuka", 1, bob);
  market.sellCard(group,bob,"asuka",1,750);
  assert.throws(() => market.purchaseCard(group,alice,"asuka",1,751,bob), /precio|vendedor/i);
  const sale=market.purchaseCard(group,alice,"asuka",1,750,bob);
  assert.equal(sale.price,750);
  assert.equal(sale.seller,bob);
  assert.equal(market.listOwned(group,alice).filter(x=>x.character_id==="asuka").length,1);
  assert.equal(market.listOwned(group,bob).filter(x=>x.character_id==="asuka").length,0);
  assert.equal(market.listSales(group).length,0);
  assert.equal(Number(db.getUser(alice).coins),99250);
  assert.equal(Number(db.getUser(bob).coins),100750);
  assert.throws(()=>market.purchaseCard(group,alice,"asuka",1,750,bob));
});
test("intercambio bidireccional no se puede aceptar dos veces", () => {
  card("rei",2,alice);
  card("mikasa",3,bob);
  const id=market.makeTrade(group,alice,bob,"rei",2,"mikasa",3);
  assert.equal(id.length,12);
  market.acceptTrade(group,bob,id);
  assert.equal(market.listOwned(group,alice).some(x=>x.character_id==="mikasa"),true);
  assert.equal(market.listOwned(group,bob).some(x=>x.character_id==="rei"),true);
  assert.throws(()=>market.acceptTrade(group,bob,id));
});
test("regalo y eliminación de una variante mantienen propiedad consistente", () => {
  market.giveCards(group,bob,carol,[{character_id:"rei",image_id:2}]);
  assert.equal(market.listOwned(group,carol).some(x=>x.character_id==="rei"),true);
  assert.throws(()=>market.giveCards(group,bob,carol,[{character_id:"rei",image_id:2}]));
  assert.equal(market.deleteOwnedCard(group,carol,"rei",2),true);
  assert.equal(market.deleteOwnedCard(group,carol,"rei",2),false);
});
test("votos y favoritos persisten sin duplicar", () => {
  assert.equal(market.voteCharacter(group,alice,"asuka"),true);
  assert.equal(market.voteCharacter(group,alice,"asuka"),false);
  assert.equal(market.voteCount(group,"asuka"),1);
  market.setFavorite(group,alice,"asuka",1);
  assert.equal(market.getFavorite(group,alice)?.character_id,"asuka");
  market.deleteFavorite(group,alice);
  assert.equal(market.getFavorite(group,alice),undefined);
});
test("mensaje personalizado y robo conservan límites", () => {
  market.setClaimMessage(group,alice,"Hola {user}: {character}");
  assert.equal(market.getClaimMessage(group,alice),"Hola {user}: {character}");
  market.setClaimMessage(group,alice,null);
  assert.equal(market.getClaimMessage(group,alice),null);
  const fail=market.stealCard(group,carol,alice,0.9);
  assert.equal(fail.won,false);
  const cooldown=market.stealCard(group,carol,alice,0.01);
  assert.equal(cooldown.won,false);
  assert.ok((cooldown.remaining||0)>0);
});
test("claim por nombre obtiene sólo una tirada propia y vigente", () => {
  original.saveGachaDraw(group,"draw-test-1",alice,"test-waifu",8);
  assert.equal(original.findPendingGachaDraw(group,alice,"test-waifu",8),"draw-test-1");
  assert.equal(original.findPendingGachaDraw(group,bob,"test-waifu",8),null);
  const resolved=original.claimGachaDraw(group,"draw-test-1",alice);
  assert.equal(resolved.status,"claimed");
  assert.equal(original.findPendingGachaDraw(group,alice,"test-waifu",8),null);
});

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
