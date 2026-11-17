"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require(process.env.TYPESCRIPT_PATH || "typescript");

const root = path.resolve(__dirname, "..");
const commandDir = path.join(root, "cmd/gacha");
const expected = new Map(Object.entries({
  accepttrade: ["accepttrade", "aceptarintercambio"],
  animeinfo: ["animeinfo", "ainfo", "serieinfo"],
  animelist: ["animelist", "slist", "serielist"],
  buyc: ["buyc", "buycharacter", "buychar"],
  claim: ["claim", "c"],
  deletechar: ["deletechar", "delwaifu", "delchar"],
  ginfo: ["ginfo", "infogacha", "gachainfo"],
  gachacheck: ["gachacheck", "gcheck"],
  giveallharem: ["giveallharem"],
  givechar: ["givechar", "regalar", "givewaifu"],
  gtop: ["gtop", "gachatop"],
  harem: ["harem", "miswaifus", "claims"],
  htop: ["htop", "haremtop", "topharem"],
  removerventa: ["removerventa", "removesale"],
  robwaifu: ["robwaifu", "robarwaifu"],
  rw: ["rw", "roll", "rollwaifu"],
  sell: ["sell", "vender"],
  setclaim: ["setclaim", "setclaimmsg", "delclaimmsg"],
  setfav: ["setfav", "wfav", "delfav"],
  tiendawaifus: ["tiendawaifus", "wshop", "haremshop"],
  trade: ["trade", "cambiar"],
  vote: ["vote", "votar"],
  waifusboard: ["waifusboard", "topwaifus", "waifustop"],
  wimage: ["wimage", "charimage", "cimage"],
  winfo: ["winfo", "charinfo", "cinfo"],
}));
const errors = [];
const aliases = new Map();
const note = "Hecho por Lourtnyx Matterssmith [Lou-Nyx].";

function syntax(relative) {
  const file = path.join(root, relative);
  const contents = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = source.parseDiagnostics || [];
  for (const diagnostic of diagnostics) {
    const position = source.getLineAndCharacterOfPosition(diagnostic.start || 0);
    errors.push(relative + ":" + (position.line + 1) + " " +
      ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
  }
  return {source, contents};
}
function unwrap(node) {
  while(node && (ts.isSatisfiesExpression(node) || ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
}
for (const [fileName,requiredAliases] of expected) {
  const rel = "cmd/gacha/" + fileName + ".ts";
  let source, contents;
  try { ({source, contents} = syntax(rel)); }
  catch(error) { errors.push(rel + " ausente: " + String(error)); continue; }
  if(!contents.trimEnd().endsWith("// " + note)) errors.push(rel + " falta la nota de autor.");
  const exported = source.statements.find(s => ts.isExportAssignment(s) && !s.isExportEquals);
  let command = unwrap(exported?.expression);
  if(ts.isIdentifier(command)) {
    const declaration = source.statements.filter(ts.isVariableStatement)
      .flatMap(s => Array.from(s.declarationList.declarations))
      .find(d => ts.isIdentifier(d.name) && d.name.text === command.text);
    command = unwrap(declaration?.initializer);
  }
  if(!command || !ts.isObjectLiteralExpression(command)) {
    errors.push(rel + " no tiene export default literal."); continue;
  }
  const get = key => command.properties.find(p =>
    p.name && (ts.isIdentifier(p.name) ? p.name.text : p.name.text) === key);
  const name = get("name"), category = get("category"), run = get("run");
  const declaredNames = name && ts.isPropertyAssignment(name) && ts.isArrayLiteralExpression(name.initializer)
    ? name.initializer.elements.filter(ts.isStringLiteral).map(x => x.text) : [];
  for (const alias of requiredAliases) if(!declaredNames.includes(alias)) errors.push(rel + " falta alias " + alias);
  if(!category || !ts.isPropertyAssignment(category) ||
      !ts.isStringLiteral(category.initializer) || category.initializer.text !== "gacha") {
    errors.push(rel + " categoría incorrecta.");
  }
  if(!run || !(ts.isMethodDeclaration(run) || ts.isPropertyAssignment(run))) errors.push(rel + " sin método run.");
  for(const alias of declaredNames) {
    const old = aliases.get(alias.toLowerCase());
    if(old && old!==rel) errors.push("Alias duplicado " + alias + ": " + rel + " y " + old);
    aliases.set(alias.toLowerCase(), rel);
  }
}
for(const rel of ["core/gachaActions.ts", "database/gachaMarketDB.ts", "database/gachaDB.ts", "core/gachaRuntime.ts"]) {
  try {syntax(rel);} catch(error) {errors.push(rel + " no encontrado: " + String(error));}
}
for (const error of errors) console.error("✖ " + error);
console.log("Gacha: " + expected.size + " comandos revisados; " + aliases.size +
  " alias en gacha; " + errors.length + " errores de contrato/sintaxis.");
if(errors.length) process.exitCode = 1;

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
