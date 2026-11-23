import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readOwnerSource, listOwnerSources, findOwnerSources, getOwnerQuotedCode, writeOwnerStage,
  normalizeOwnerCode, OWNER_FILE_STAGE,
} from '../core/ownerFileWorkspace.ts';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-file-test-'));
fs.mkdirSync(path.join(root,'cmd','system'),{recursive:true});
fs.mkdirSync(path.join(root,'sessions'),{recursive:true});
fs.writeFileSync(path.join(root,'cmd','system','demo.ts'),'export default 1;\n');
fs.writeFileSync(path.join(root,'config.ts'),'const secret = "private";\n');
fs.writeFileSync(path.join(root,'sessions','creds.json'),'{}');
after(()=>fs.rmSync(root,{recursive:true,force:true}));
test('getcode lee un archivo permitido',()=>{
 const file=readOwnerSource('cmd/system/demo.ts',root);
 assert.equal(file.filename,'demo.ts');
 assert.match(file.content.toString(),/export default/);
});
test('getcode lista carpeta filtrada',()=>{
 const files=listOwnerSources('cmd/system',root);
 assert.deepEqual(files,['demo.ts']);
});
test('bloquea credenciales, config y rutas ascendentes',()=>{
 for(const p of ['../config.ts','/etc/passwd','cmd/../../config.ts','config.ts','sessions/creds.json','cmd\\system\\demo.ts','cmd/.env','cmd/system/../demo.ts']) {
   assert.throws(()=>readOwnerSource(p,root),undefined,p);
 }
});
test('escritura aislada, sin alterar el archivo activo',()=>{
 const write=writeOwnerStage('cmd/system/demo.ts','\x60\x60\x60ts\nexport default 42;\n\x60\x60\x60',false,root);
 assert.equal(write.path,'staged/cmd/system/demo.ts');
 assert.equal(fs.readFileSync(path.join(root,'cmd/system/demo.ts'),'utf8'),'export default 1;\n');
 const staged=readOwnerSource(write.path,root);
 assert.equal(staged.content.toString(),'export default 42;\n');
 assert.throws(()=>writeOwnerStage('cmd/system/demo.ts','export default 9;',false,root),/Ya existe/);
 const second=writeOwnerStage('cmd/system/demo.ts','export default 9;',true,root);
 assert.equal(second.replaced,true);
 assert.equal(readOwnerSource('staged/cmd/system/demo.ts',root).content.toString(),'export default 9;\n');
 assert.ok(fs.existsSync(path.join(root,OWNER_FILE_STAGE)));
});
test('previene enlaces simbólicos y archivos enormes',()=>{
 fs.symlinkSync(path.join(root,'sessions'),path.join(root,'cmd','secretlink'));
 assert.throws(()=>readOwnerSource('cmd/secretlink/creds.json',root));
 assert.throws(()=>writeOwnerStage('cmd/system/huge.ts','x'.repeat(128*1024+10),false,root));
});
test('extrae mensaje citado con contexto Baileys y limpia cercas',()=>{
 const message={message:{extendedTextMessage:{contextInfo:{quotedMessage:{extendedTextMessage:{text:'\x60\x60\x60js\nconsole.log(1);\n\x60\x60\x60'}}}}}};
 assert.equal(normalizeOwnerCode(getOwnerQuotedCode(message)),'console.log(1);\n');
 assert.equal(getOwnerQuotedCode({message:{conversation:'plain'}}),'');
});
test('busca archivos por nombre y prioriza comandos activos frente a test',()=>{
 fs.mkdirSync(path.join(root,'test','system'),{recursive:true});
 fs.writeFileSync(path.join(root,'test','system','demo.ts'),'export default 2;\n');
 const matches=findOwnerSources('demo',root);
 assert.equal(matches[0].path,'cmd/system/demo.ts');
 assert.equal(matches[1].path,'test/system/demo.ts');
 assert.deepEqual(findOwnerSources('demo.ts',root).map(x=>x.path).slice(0,2),
  ['cmd/system/demo.ts','test/system/demo.ts']);
});
test('busca nombres parciales y no muestra archivos sensibles',()=>{
 fs.writeFileSync(path.join(root,'cmd','system','filecheck.ts'),'export default true;\n');
 fs.writeFileSync(path.join(root,'cmd','system','config.ts'),'const secret = 10;\n');
 assert.equal(findOwnerSources('filech',root)[0].path,'cmd/system/filecheck.ts');
 assert.deepEqual(findOwnerSources('nadaexistente',root),[]);
 assert.throws(()=>findOwnerSources('config.ts',root),/protegido/i);
 assert.throws(()=>findOwnerSources('config',root),/protegido/i);
});
test('omite symlinks al buscar, incluidos directorios enlazados',()=>{
 fs.symlinkSync(path.join(root,'sessions','creds.json'),path.join(root,'cmd','system','leak.ts'));
 assert.deepEqual(findOwnerSources('leak',root),[]);
});
// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
