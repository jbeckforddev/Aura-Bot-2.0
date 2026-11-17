"use strict";
const { DatabaseSync } = require("node:sqlite");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const dir = mkdtempSync(join(tmpdir(), "aura-gacha-sql-"));
const db = new DatabaseSync(join(dir,"GachaAura.db"));
const buyer = "521100@s.whatsapp.net", seller = "876543@lid", group = "test@g.us";
db.exec("PRAGMA journal_mode=WAL");
db.prepare("ATTACH DATABASE ? AS aura").run(join(dir,"Aura.db"));
db.exec([
  "CREATE TABLE aura.users(jid TEXT PRIMARY KEY,lid TEXT,coins INTEGER DEFAULT 100000,data TEXT DEFAULT '{}')",
  "CREATE TABLE GachaImageOwnership(group_id TEXT,character_id TEXT,image_id INTEGER,user_id TEXT,claimed_at INTEGER,source_message_id TEXT,PRIMARY KEY(group_id,character_id,image_id))",
  "CREATE TABLE GachaOwnership(group_id TEXT,character_id TEXT,user_id TEXT,claimed_at INTEGER,source_message_id TEXT,PRIMARY KEY(group_id,character_id))",
  "CREATE TABLE GachaListings(group_id TEXT,character_id TEXT,image_id INTEGER,seller_id TEXT,price INTEGER CHECK(price>0),created_at INTEGER,PRIMARY KEY(group_id,character_id,image_id))",
  "CREATE TABLE GachaVotes(group_id TEXT,character_id TEXT,voter_id TEXT,voted_at INTEGER,PRIMARY KEY(group_id,character_id,voter_id))",
  "CREATE TABLE GachaFavorites(group_id TEXT,user_id TEXT,character_id TEXT,image_id INTEGER,PRIMARY KEY(group_id,user_id))",
].join(";")+";");
db.prepare("INSERT INTO aura.users(jid,lid,coins,data) VALUES(?,NULL,100000,'{}')").run(buyer);
db.prepare("INSERT INTO aura.users(jid,lid,coins,data) VALUES(NULL,?,100000,'{}')").run(seller);
after(() => { db.close(); rmSync(dir,{recursive:true,force:true}); });
const coins = "CAST(COALESCE(json_extract(CASE WHEN json_valid(data) THEN data ELSE '{}' END,'$.economy.bolsillo'),json_extract(CASE WHEN json_valid(data) THEN data ELSE '{}' END,'$.economy.coins'),json_extract(CASE WHEN json_valid(data) THEN data ELSE '{}' END,'$.bolsillo'),coins,100000) AS INTEGER)";
const adjustSQL = "UPDATE aura.users SET coins=("+coins+")+?,data=json_set(CASE WHEN json_valid(data) THEN data ELSE '{}' END,'$.bolsillo',("+coins+")+?,'$.coins',("+coins+")+?,'$.economy.bolsillo',("+coins+")+?,'$.economy.coins',("+coins+")+?) WHERE (jid=? OR lid=?) AND ("+coins+")+? >= 0 AND ("+coins+")+? <= 9007199254740991";
function tx(fn) {db.exec("BEGIN IMMEDIATE");try{fn();db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}}
function adjust(user, delta) {if(db.prepare(adjustSQL).run(delta,delta,delta,delta,delta,user,user,delta,delta).changes!==1)throw Error("saldo");}
function move(from,to,name,id) {
  const n=db.prepare("UPDATE GachaImageOwnership SET user_id=? WHERE group_id=? AND character_id=? AND image_id=? AND user_id=?").run(to,group,name,id,from).changes;
  if(n!==1)throw Error("propiedad");
}
function balance(user) {return db.prepare("SELECT coins FROM aura.users WHERE jid=? OR lid=?").get(user,user).coins;}
test("compra: JID/LID, dinero y propiedad",()=>{
  db.prepare("INSERT INTO GachaImageOwnership VALUES(?,?,?,?,?,?)").run(group,"asuka",1,seller,0,"m1");
  db.prepare("INSERT INTO GachaListings VALUES(?,?,?,?,?,?)").run(group,"asuka",1,seller,750,0);
  tx(()=>{adjust(buyer,-750);adjust(seller,750);move(seller,buyer,"asuka",1);db.prepare("DELETE FROM GachaListings WHERE group_id=? AND character_id=? AND image_id=?").run(group,"asuka",1);});
  assert.equal(balance(buyer),99250);assert.equal(balance(seller),100750);
  assert.equal(db.prepare("SELECT user_id FROM GachaImageOwnership WHERE character_id='asuka'").get().user_id,buyer);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM GachaListings").get().n,0);
});
test("compra duplicada revierte el débito",()=>{
  assert.throws(()=>tx(()=>{adjust(buyer,-750);move(seller,buyer,"asuka",1);}),/propiedad/);
  assert.equal(balance(buyer),99250);
});
test("saldo insuficiente revierte cualquier cambio",()=>{
  assert.throws(()=>tx(()=>{adjust(buyer,-9999999);move(buyer,seller,"asuka",1);}),/saldo/);
  assert.equal(balance(buyer),99250);
});
test("intercambio de dos cartas y rechazo de segundo intento",()=>{
  db.prepare("INSERT INTO GachaImageOwnership VALUES(?,?,?,?,?,?)").run(group,"rei",2,seller,0,"m2");
  tx(()=>{move(buyer,seller,"asuka",1);move(seller,buyer,"rei",2);});
  assert.throws(()=>tx(()=>{move(buyer,seller,"asuka",1);move(seller,buyer,"rei",2);}),/propiedad/);
});
test("ventas antiguas, votos y favoritos",()=>{
  db.prepare("INSERT INTO GachaOwnership VALUES(?,?,?,?,?)").run(group,"legacy",buyer,0,"m3");
  db.prepare("INSERT INTO GachaListings VALUES(?,?,?,?,?,?)").run(group,"legacy",-1,buyer,1000,0);
  assert.equal(db.prepare("SELECT image_id FROM GachaListings WHERE character_id='legacy'").get().image_id,-1);
  db.prepare("INSERT OR IGNORE INTO GachaVotes VALUES(?,?,?,?)").run(group,"asuka",buyer,0);
  assert.equal(db.prepare("INSERT OR IGNORE INTO GachaVotes VALUES(?,?,?,?)").run(group,"asuka",buyer,0).changes,0);
  db.prepare("INSERT INTO GachaFavorites VALUES(?,?,?,?)").run(group,buyer,"rei",2);
  assert.equal(db.prepare("SELECT character_id FROM GachaFavorites WHERE user_id=?").get(buyer).character_id,"rei");
});

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
