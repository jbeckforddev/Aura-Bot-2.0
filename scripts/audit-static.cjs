"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ts = require(process.env.TYPESCRIPT_PATH || "typescript");
const root = path.resolve(__dirname, "..");
const cmdRoot = path.join(root, "cmd");
const excluded = new Set([".git", "node_modules", "dist", "data", "sessions", "cache", ".npm"]);
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const files = [];
const categories = new Set();
const issues = [];
const aliases = new Map();
let nCmd = 0;

function report(file, type, reason) {
  issues.push({ file: path.relative(root, file), type, reason });
}
function collect(dir) {
  if (!fs.existsSync(dir)) return;
  for (const d of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    if (excluded.has(d.name) || d.isSymbolicLink()) continue;
    const file = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (dir === cmdRoot) categories.add(d.name);
      collect(file);
    } else if (d.isFile() && extensions.has(path.extname(d.name)) && !d.name.endsWith(".d.ts")) {
      files.push(file);
    }
  }
}
function textValue(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}
function resolveImport(file, spec) {
  const name = path.resolve(path.dirname(file), spec.split(/[?#]/)[0]);
  const tries = [name, name+".ts",name+".js",name+".json",name+".d.ts",
    path.join(name,"index.ts"),path.join(name,"index.js"),path.join(name,"index.d.ts")];
  if (name.endsWith(".js")) tries.push(name.slice(0,-3)+".ts");
  if (name.endsWith(".mjs")) tries.push(name.slice(0,-4)+".mts");
  return tries.some(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
}
function commandObject(source) {
  const assignment=source.statements.find(s=>ts.isExportAssignment(s)&&!s.isExportEquals);
  if (!assignment) return null;
  let expr=assignment.expression;
  for(let n=0;n<5;n++){
    if(ts.isParenthesizedExpression(expr)||ts.isAsExpression(expr)||ts.isSatisfiesExpression(expr)){
      expr=expr.expression;continue;
    }
    if(ts.isIdentifier(expr)){
      const declaration=source.statements.filter(ts.isVariableStatement)
        .flatMap(s=>Array.from(s.declarationList.declarations))
        .find(s=>ts.isIdentifier(s.name)&&s.name.text===expr.text);
      if(declaration?.initializer){expr=declaration.initializer;continue;}
    }
    break;
  }
  return ts.isObjectLiteralExpression(expr)?expr:null;
}
function property(obj, key) {
  return obj.properties.find(p=>p.name&&(ts.isIdentifier(p.name)?p.name.text:textValue(p.name))===key);
}
function check(file) {
  let contents;
  try {contents=fs.readFileSync(file,"utf8");} catch(e) {report(file,"READ",String(e));return;}
  if(file.endsWith(".json")){
    try{JSON.parse(contents);}catch(e){report(file,"JSON",String(e));}
    return;
  }
  const kind=/\.(js|jsx|mjs|cjs)$/.test(file)?ts.ScriptKind.JS:ts.ScriptKind.TS;
  const source=ts.createSourceFile(file,contents,ts.ScriptTarget.Latest,true,kind);
  for(const d of source.parseDiagnostics||[]){
    const pos=source.getLineAndCharacterOfPosition(d.start||0);
    report(file,"SYNTAX",(pos.line+1)+":"+(pos.character+1)+" "+
      ts.flattenDiagnosticMessageText(d.messageText," "));
  }
  const seen=new Set();
  function imports(node){
    let spec=null;
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
      spec=textValue(node.moduleSpecifier);
    }else if(ts.isCallExpression(node)&&node.arguments.length&&
      (node.expression.kind===ts.SyntaxKind.ImportKeyword||
        (ts.isIdentifier(node.expression)&&node.expression.text==="require"))){
      spec=textValue(node.arguments[0]);
    }
    if(spec&&spec.startsWith(".")&&!seen.has(spec)){
      seen.add(spec);
      if(!resolveImport(file,spec))report(file,"IMPORT_ROTO",spec);
    }
    ts.forEachChild(node,imports);
  }
  imports(source);
  if(!file.startsWith(cmdRoot+path.sep))return;
  nCmd++;
  const relative=path.relative(cmdRoot,file).split(path.sep);
  const folder=relative.length>1?relative[0]:null;
  const defaultAssignment=source.statements.find(s=>ts.isExportAssignment(s)&&!s.isExportEquals);
  const call=defaultAssignment?.expression;
  const factory=call&&ts.isCallExpression(call)&&ts.isIdentifier(call.expression)&&
    call.expression.text==="createEconomyActivity"&&
    call.arguments.length>0&&ts.isObjectLiteralExpression(call.arguments[0]);
  const obj=factory?call.arguments[0]:commandObject(source);
  if(!obj){report(file,"ESTRUCTURA","export default no verificable");return;}
  const cp=property(obj,"category"), np=property(obj,factory?"names":"name");
  const category=factory?"economy":cp&&ts.isPropertyAssignment(cp)?textValue(cp.initializer):null;
  if(!category||!categories.has(category)||category!==folder){
    report(file,"CATEGORIA","carpeta="+(folder||"cmd/")+" categoria="+(category||"sin literal"));
  }
  if(!factory&&!property(obj,"run")&&!property(obj,"execute")){
    report(file,"ESTRUCTURA","No existe run/execute");
  }
  if(!np||!ts.isPropertyAssignment(np)){report(file,"ESTRUCTURA","Sin name");return;}
  const init=np.initializer;
  let names=ts.isArrayLiteralExpression(init)?init.elements.map(textValue):[textValue(init)];
  if(ts.isCallExpression(init)&&ts.isPropertyAccessExpression(init.expression)&&
     ts.isIdentifier(init.expression.expression)&&init.expression.expression.text==="Object"&&
     init.expression.name.text==="keys"&&init.arguments.length===1&&
     ts.isIdentifier(init.arguments[0])&&init.arguments[0].text==="DATA"){
    const match=source.text.match(
      /const\s+DATA_PATH\s*=\s*path\.resolve\(\s*process\.cwd\(\)\s*,\s*["']([^"']+\.json)["']\s*\)/,
    );
    if(match){
      const jsonFile=path.resolve(root,match[1]);
      if(jsonFile.startsWith(path.join(root,"database")+path.sep)){
        try{names=Object.keys(JSON.parse(fs.readFileSync(jsonFile,"utf8")));}catch(e){
          report(file,"JSON",String(e));
        }
      }
    }
  }
  if(!names.length||names.some(n=>!n)){report(file,"ALIAS","name sin literales");return;}
  for(const name of names){
    const alias=name.toLowerCase().trim();
    if(!alias){report(file,"ALIAS","Alias vacio");continue;}
    const prev=aliases.get(alias);
    if(prev)report(file,"DUPLICADO",alias+" tambien en "+path.relative(root,prev));
    else aliases.set(alias,file);
  }
}
collect(root);
for(const file of files)check(file);
console.log("AUDITORÍA ESTÁTICA: "+files.length+" archivos; "+nCmd+
" comandos; "+aliases.size+" alias; "+issues.length+" incidencias.");
for(const i of issues)console.log("["+i.type+"] "+i.file+": "+i.reason);
if(process.env.AURA_AUDIT_REPORT){
  fs.writeFileSync(process.env.AURA_AUDIT_REPORT,
    JSON.stringify({fileCount:files.length,commandCount:nCmd,aliasCount:aliases.size,issues},null,2));
}
if(issues.length)process.exitCode=1;
