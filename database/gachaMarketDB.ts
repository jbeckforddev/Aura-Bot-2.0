import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import "./gachaDB.ts";
import { db, invalidateUserDbCache } from "./AuraDB.ts";
import "../config.ts";

export interface GachaCard {
  group_id: string;
  character_id: string;
  image_id: number | null;
  user_id: string;
  claimed_at: number;
}
export interface GachaListing {
  group_id: string;
  character_id: string;
  image_id: number;
  seller_id: string;
  price: number;
  created_at: number;
}
export interface GachaTrade {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  offer_character: string;
  offer_image: number;
  request_character: string;
  request_image: number;
  status: string;
  expires_at: number;
}
export interface GachaRanking {
  user_id: string;
  cards: number;
}
const database = new Database(globalThis.DATA_BASE_DIR + "/GachaAura.db");
database.pragma("busy_timeout = 15000");
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.pragma("synchronous = NORMAL");

// Los cambios económicos y de propiedad se realizan con una misma conexión.
// SQLite adjunta Aura.db para no separar el débito del traspaso del personaje.
// En WAL cada archivo garantiza su transacción local; respaldar ambos archivos juntos.
database.prepare("ATTACH DATABASE ? AS aura").run(globalThis.DATA_BASE_DIR + "/Aura.db");
database.exec([
  "CREATE TABLE IF NOT EXISTS GachaListings (group_id TEXT NOT NULL, character_id TEXT NOT NULL, image_id INTEGER NOT NULL, seller_id TEXT NOT NULL, price INTEGER NOT NULL CHECK(price > 0), created_at INTEGER NOT NULL, PRIMARY KEY(group_id,character_id,image_id))",
  "CREATE TABLE IF NOT EXISTS GachaTrades (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, from_user TEXT NOT NULL, to_user TEXT NOT NULL, offer_character TEXT NOT NULL, offer_image INTEGER NOT NULL, request_character TEXT NOT NULL, request_image INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', expires_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS GachaVotes (group_id TEXT NOT NULL, character_id TEXT NOT NULL, voter_id TEXT NOT NULL, voted_at INTEGER NOT NULL, PRIMARY KEY(group_id,character_id,voter_id))",
  "CREATE TABLE IF NOT EXISTS GachaFavorites (group_id TEXT NOT NULL, user_id TEXT NOT NULL, character_id TEXT NOT NULL, image_id INTEGER NOT NULL, PRIMARY KEY(group_id,user_id))",
  "CREATE TABLE IF NOT EXISTS GachaClaimMessages (group_id TEXT NOT NULL, user_id TEXT NOT NULL, message TEXT NOT NULL, PRIMARY KEY(group_id,user_id))",
  "CREATE TABLE IF NOT EXISTS GachaRobCooldowns (group_id TEXT NOT NULL, user_id TEXT NOT NULL, last_attempt INTEGER NOT NULL, PRIMARY KEY(group_id,user_id))",
  "CREATE INDEX IF NOT EXISTS idx_gachalist_seller ON GachaListings(group_id,seller_id)",
  "CREATE INDEX IF NOT EXISTS idx_gachatrade_target ON GachaTrades(group_id,to_user,status)",
].join(";") + ";");

export function imageKey(id: number | null): number { return id === null ? -1 : id; }
export function listOwned(group: string, user?: string): GachaCard[] {
  if (user) {
    return database.prepare(
      "SELECT group_id,character_id,image_id,user_id,claimed_at FROM GachaImageOwnership WHERE group_id=? AND user_id=? " +
      "UNION ALL SELECT group_id,character_id,NULL AS image_id,user_id,claimed_at FROM GachaOwnership WHERE group_id=? AND user_id=?"
    ).all(group,user,group,user) as GachaCard[];
  }
  return database.prepare(
    "SELECT group_id,character_id,image_id,user_id,claimed_at FROM GachaImageOwnership WHERE group_id=? " +
    "UNION ALL SELECT group_id,character_id,NULL AS image_id,user_id,claimed_at FROM GachaOwnership WHERE group_id=?"
  ).all(group,group) as GachaCard[];
}
function owns(group: string, user: string, character: string, image: number): boolean {
  if (image === -1) return Boolean(database.prepare(
    "SELECT 1 FROM GachaOwnership WHERE group_id=? AND user_id=? AND character_id=?"
  ).get(group,user,character));
  return Boolean(database.prepare(
    "SELECT 1 FROM GachaImageOwnership WHERE group_id=? AND user_id=? AND character_id=? AND image_id=?"
  ).get(group,user,character,image));
}
function clearMarket(group: string, character: string, image: number): void {
  database.prepare("DELETE FROM GachaListings WHERE group_id=? AND character_id=? AND image_id=?").run(group,character,image);
  database.prepare("DELETE FROM GachaFavorites WHERE group_id=? AND character_id=? AND image_id=?").run(group,character,image);
}
function move(group: string, from: string, to: string, character: string, image: number): void {
  if (from === to || !owns(group,from,character,image)) throw new Error("El propietario ya no dispone del personaje.");
  const now = Date.now();
  const result = image === -1
    ? database.prepare("UPDATE GachaOwnership SET user_id=?,claimed_at=? WHERE group_id=? AND character_id=? AND user_id=?").run(to,now,group,character,from)
    : database.prepare("UPDATE GachaImageOwnership SET user_id=?,claimed_at=? WHERE group_id=? AND character_id=? AND image_id=? AND user_id=?").run(to,now,group,character,image,from);
  if (result.changes !== 1) throw new Error("El personaje fue modificado por otro socket.");
  clearMarket(group,character,image);
}
export function giveCards(group: string, from: string, to: string, cards: Array<{character_id:string;image_id:number|null}>): number {
  if (from === to) throw new Error("No puedes transferirte personajes.");
  return database.transaction(() => {
    for (const card of cards) move(group,from,to,card.character_id,imageKey(card.image_id));
    return cards.length;
  })();
}
export function deleteOwnedCard(group: string,user: string,character: string,image: number): boolean {
  return database.transaction(() => {
    if(!owns(group,user,character,image)) return false;
    const result=image===-1
      ? database.prepare("DELETE FROM GachaOwnership WHERE group_id=? AND user_id=? AND character_id=?").run(group,user,character)
      : database.prepare("DELETE FROM GachaImageOwnership WHERE group_id=? AND user_id=? AND character_id=? AND image_id=?").run(group,user,character,image);
    clearMarket(group,character,image);
    return result.changes === 1;
  })();
}
export function listSales(group: string): GachaListing[] {
  return database.prepare("SELECT * FROM GachaListings WHERE group_id=? ORDER BY created_at DESC").all(group) as GachaListing[];
}
export function sellCard(group:string,user:string,character:string,image:number,price:number): void {
  if(!Number.isSafeInteger(price)||price<1||price>1000000000) throw new Error("Precio inválido.");
  database.transaction(() => {
    if(!owns(group,user,character,image)) throw new Error("No eres dueño de ese personaje.");
    database.prepare("INSERT INTO GachaListings(group_id,character_id,image_id,seller_id,price,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(group_id,character_id,image_id) DO UPDATE SET seller_id=excluded.seller_id,price=excluded.price,created_at=excluded.created_at")
      .run(group,character,image,user,price,Date.now());
  })();
}
export function removeSale(group:string,user:string,character:string,image:number): boolean {
  return database.prepare("DELETE FROM GachaListings WHERE group_id=? AND character_id=? AND image_id=? AND seller_id=?").run(group,character,image,user).changes===1;
}
const COINS = "CAST(COALESCE(json_extract(CASE WHEN json_valid(data) THEN data ELSE '{}' END,'$.economy.bolsillo'),json_extract(CASE WHEN json_valid(data) THEN data ELSE '{}' END,'$.economy.coins'),json_extract(CASE WHEN json_valid(data) THEN data ELSE '{}' END,'$.bolsillo'),coins,100000) AS INTEGER)";
function adjustCoins(user:string,delta:number): void {
  const sql="UPDATE aura.users SET coins=("+COINS+")+?,data=json_set(CASE WHEN json_valid(data) THEN data ELSE '{}' END,'$.bolsillo',("+COINS+")+?,'$.coins',("+COINS+")+?,'$.economy.bolsillo',("+COINS+")+?,'$.economy.coins',("+COINS+")+?) WHERE (jid=? OR lid=?) AND ("+COINS+")+? >= 0 AND ("+COINS+")+? <= 9007199254740991";
  const changed=database.prepare(sql).run(delta,delta,delta,delta,delta,user,user,delta,delta).changes;
  if(changed!==1) throw new Error("Saldo insuficiente o cuenta inexistente.");
}
export function purchaseCard(group:string,buyer:string,character:string,image:number,expectedPrice:number,expectedSeller:string): {seller:string;price:number} {
  // Garantiza que existan las cuentas en Aura.db antes de la transacción.
  db.getUser(buyer);
  const listing=database.prepare("SELECT seller_id,price FROM GachaListings WHERE group_id=? AND character_id=? AND image_id=?").get(group,character,image) as {seller_id:string;price:number}|undefined;
  if(!listing) throw new Error("Este personaje no está a la venta.");
  db.getUser(listing.seller_id);
  const receipt=database.transaction(() => {
    const sale=database.prepare("SELECT seller_id,price FROM GachaListings WHERE group_id=? AND character_id=? AND image_id=?").get(group,character,image) as {seller_id:string;price:number}|undefined;
    if(!sale||!owns(group,sale.seller_id,character,image)) throw new Error("La venta ya no está disponible.");
    if(sale.price!==expectedPrice||sale.seller_id!==expectedSeller) throw new Error("El precio o vendedor cambió. Consulta de nuevo la tienda.");
    if(sale.seller_id===buyer) throw new Error("No puedes comprar tu propio personaje.");
    adjustCoins(buyer,-sale.price);
    adjustCoins(sale.seller_id,sale.price);
    move(group,sale.seller_id,buyer,character,image);
    return {seller:sale.seller_id,price:sale.price};
  })();
  // Invalida JID, LID y otras claves equivalentes que puedan estar en caché.
  invalidateUserDbCache();
  return receipt;
}
export function makeTrade(group:string,from:string,to:string,offer:string,offerImage:number,want:string,wantImage:number): string {
  if(from===to) throw new Error("No puedes intercambiar contigo.");
  const id=randomBytes(6).toString("hex");
  database.transaction(() => {
    if(!owns(group,from,offer,offerImage)||!owns(group,to,want,wantImage)) throw new Error("Alguno de los personajes ya no pertenece a su dueño.");
    database.prepare("INSERT INTO GachaTrades(id,group_id,from_user,to_user,offer_character,offer_image,request_character,request_image,status,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(id,group,from,to,offer,offerImage,want,wantImage,"pending",Date.now()+600000);
  })();
  return id;
}
export function acceptTrade(group:string,to:string,id:string): GachaTrade {
  return database.transaction(() => {
    const trade=database.prepare("SELECT * FROM GachaTrades WHERE id=? AND group_id=? AND to_user=?").get(id,group,to) as GachaTrade|undefined;
    if(!trade) throw new Error("Solicitud de intercambio inexistente o dirigida a otra persona.");
    if(trade.status!=="pending"||trade.expires_at<=Date.now()) throw new Error("Solicitud expirada o ya utilizada.");
    if(!owns(group,trade.from_user,trade.offer_character,trade.offer_image)||!owns(group,trade.to_user,trade.request_character,trade.request_image)) throw new Error("Los propietarios han cambiado.");
    move(group,trade.from_user,trade.to_user,trade.offer_character,trade.offer_image);
    move(group,trade.to_user,trade.from_user,trade.request_character,trade.request_image);
    database.prepare("UPDATE GachaTrades SET status='accepted' WHERE id=? AND status='pending'").run(id);
    return trade;
  })();
}
export function setFavorite(group:string,user:string,character:string,image:number): void {
  database.transaction(() => {
    if(!owns(group,user,character,image)) throw new Error("Sólo puedes marcar personajes propios.");
    database.prepare("INSERT INTO GachaFavorites(group_id,user_id,character_id,image_id) VALUES(?,?,?,?) ON CONFLICT(group_id,user_id) DO UPDATE SET character_id=excluded.character_id,image_id=excluded.image_id").run(group,user,character,image);
  })();
}
export function getFavorite(group:string,user:string): {character_id:string;image_id:number}|undefined {
  return database.prepare("SELECT character_id,image_id FROM GachaFavorites WHERE group_id=? AND user_id=?").get(group,user) as {character_id:string;image_id:number}|undefined;
}
export function favoriteRankings(group:string): Array<{character_id:string;votes:number}> {
  return database.prepare(
    "SELECT character_id,COUNT(*) AS votes FROM GachaFavorites WHERE group_id=? GROUP BY character_id ORDER BY votes DESC,character_id ASC LIMIT 20",
  ).all(group) as Array<{character_id:string;votes:number}>;
}
export function deleteFavorite(group:string,user:string): void {
  database.prepare("DELETE FROM GachaFavorites WHERE group_id=? AND user_id=?").run(group,user);
}
export function voteCharacter(group:string,user:string,character:string): boolean {
  return database.prepare("INSERT OR IGNORE INTO GachaVotes(group_id,character_id,voter_id,voted_at) VALUES(?,?,?,?)").run(group,character,user,Date.now()).changes===1;
}
export function voteCount(group:string,character:string): number {
  return (database.prepare("SELECT COUNT(*) AS n FROM GachaVotes WHERE group_id=? AND character_id=?").get(group,character) as {n:number}).n;
}
export function setClaimMessage(group:string,user:string,message:string|null): void {
  if(message===null) database.prepare("DELETE FROM GachaClaimMessages WHERE group_id=? AND user_id=?").run(group,user);
  else database.prepare("INSERT INTO GachaClaimMessages(group_id,user_id,message) VALUES(?,?,?) ON CONFLICT(group_id,user_id) DO UPDATE SET message=excluded.message").run(group,user,message);
}
export function getClaimMessage(group:string,user:string): string|null {
  return (database.prepare("SELECT message FROM GachaClaimMessages WHERE group_id=? AND user_id=?").get(group,user) as {message:string}|undefined)?.message ?? null;
}
export function stealCard(group:string,thief:string,target:string,roll:number): {won:boolean;card?:GachaCard;remaining?:number} {
  return database.transaction(() => {
    if(thief===target) throw new Error("No puedes robarte a ti mismo.");
    const last=(database.prepare("SELECT last_attempt FROM GachaRobCooldowns WHERE group_id=? AND user_id=?").get(group,thief) as {last_attempt:number}|undefined)?.last_attempt||0;
    const remaining=12*3600000-(Date.now()-last);
    if(remaining>0) return {won:false,remaining};
    const available=listOwned(group,target);
    if(available.length===0) throw new Error("El usuario no tiene personajes.");
    database.prepare("INSERT INTO GachaRobCooldowns(group_id,user_id,last_attempt) VALUES(?,?,?) ON CONFLICT(group_id,user_id) DO UPDATE SET last_attempt=excluded.last_attempt").run(group,thief,Date.now());
    if(roll>=0.20) return {won:false};
    const card=available[Math.floor(roll/0.20*available.length)]!;
    move(group,target,thief,card.character_id,imageKey(card.image_id));
    return {won:true,card};
  })();
}
export function userRankings(group?:string): GachaRanking[] {
  const common = "SELECT group_id,user_id FROM GachaImageOwnership UNION ALL SELECT group_id,user_id FROM GachaOwnership";
  const query = "SELECT user_id,COUNT(*) AS cards FROM (" + common + ")" +
    (group ? " WHERE group_id=?" : "") +
    " GROUP BY user_id ORDER BY cards DESC,user_id ASC";
  return (group ? database.prepare(query).all(group) : database.prepare(query).all()) as GachaRanking[];
}

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
