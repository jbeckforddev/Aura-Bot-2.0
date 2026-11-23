import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  GLOBAL_GBAN_CONTROLLER_PHONES,
  isProtectedAntiRaidOwner,
  isAuthorizedGlobalBanOperator,
} from "../core/antiRaidOwnerPolicy.ts";

const previousRoles = globalThis.DEFAULT_USER_ROLES;
globalThis.DEFAULT_USER_ROLES = [
  { role: "owner", jid: "525538176300@s.whatsapp.net", lid: "276772692222150@lid" },
  { role: "owner", jid: "50672373785@s.whatsapp.net", lid: "37031996583942@lid" },
  { role: "owner", jid: "573132801341@s.whatsapp.net", lid: "249907738841305@lid" },
  { role: "coowner", jid: "44111111111@s.whatsapp.net", lid: "441234567891@lid" },
  { role: "user", jid: "50999999999@s.whatsapp.net", lid: "599999999999@lid" },
];
after(() => { globalThis.DEFAULT_USER_ROLES = previousRoles; });

test("conserva el operador anterior y añade ambos números solicitados", () => {
  assert.deepEqual([...GLOBAL_GBAN_CONTROLLER_PHONES], [
    "573118353868", "525538176300", "50672373785",
  ]);
  for (const phone of GLOBAL_GBAN_CONTROLLER_PHONES) {
    assert.equal(isProtectedAntiRaidOwner({phone}), true);
    assert.equal(isAuthorizedGlobalBanOperator({phone}, "", true), true);
  }
});

test("la autorización adicional exige el rol owner validado en handler", () => {
  assert.equal(isAuthorizedGlobalBanOperator({phone:"525538176300"}, "", false), false);
  assert.equal(isAuthorizedGlobalBanOperator({jid:"50672373785@s.whatsapp.net"}, "", false), false);
  assert.equal(isAuthorizedGlobalBanOperator({phone:"573118353868"}, "", false, true), true);
});

test("JID y LID configurados pueden identificar a los dos operadores", () => {
  for (const lid of ["276772692222150@lid", "37031996583942@lid"]) {
    assert.equal(isAuthorizedGlobalBanOperator({lid}, lid, true), true);
    assert.equal(isAuthorizedGlobalBanOperator({lid}, lid, false), false);
    assert.equal(isProtectedAntiRaidOwner({jid:lid}), true);
    assert.equal(isProtectedAntiRaidOwner({phone:"LID_"+lid.split("@")[0]}), true);
  }
});

test("todo owner y coowner registrado es inmune aunque no controle gban", () => {
  const owner={jid:"573132801341@s.whatsapp.net",lid:"249907738841305@lid"};
  const coowner={jid:"44111111111@s.whatsapp.net",lid:"441234567891@lid"};
  for (const user of [owner,coowner]) {
    assert.equal(isProtectedAntiRaidOwner(user), true);
    assert.equal(isProtectedAntiRaidOwner({lid:user.lid}), true);
    assert.equal(isAuthorizedGlobalBanOperator(user,"",true), false);
  }
});

test("se protege el rol owner concedido dinámicamente en DB", () => {
  const ownerRole=jid=>jid==="55500000123@s.whatsapp.net"||jid==="883377221100@lid";
  assert.equal(isProtectedAntiRaidOwner({phone:"55500000123"},"",ownerRole), true);
  assert.equal(isProtectedAntiRaidOwner({lid:"883377221100@lid"},"",ownerRole), true);
  assert.equal(isAuthorizedGlobalBanOperator({phone:"55500000123"},"",true), false);
});

test("números ajenos y LID de usuarios no se protegen", () => {
  assert.equal(isProtectedAntiRaidOwner({phone:"5219999999999"}),false);
  assert.equal(isProtectedAntiRaidOwner({lid:"599999999999@lid"}),false);
  assert.equal(isProtectedAntiRaidOwner({phone:"LID_599999999999"}),false);
  assert.equal(isAuthorizedGlobalBanOperator({phone:"5219999999999"},"",true),false);
  assert.equal(isAuthorizedGlobalBanOperator({lid:"599999999999@lid"},"",true),false);
});

test("los dígitos de un LID no se interpretan como número telefónico", () => {
  assert.equal(isProtectedAntiRaidOwner({lid:"525538176300@lid"}),false);
  assert.equal(isAuthorizedGlobalBanOperator({lid:"525538176300@lid"},"",true),false);
  assert.equal(isProtectedAntiRaidOwner({jid:"525538176300@lid"}),false);
});

test("identificador LID del owner supremo y errores de DB", () => {
  assert.equal(isProtectedAntiRaidOwner({lid:"1234567890123@lid"},"",undefined,"1234567890123@lid"),true);
  const failLookup=()=>{throw Error("DB offline")};
  assert.equal(isProtectedAntiRaidOwner({jid:"55300001111@s.whatsapp.net"},"",failLookup),false);
});

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
