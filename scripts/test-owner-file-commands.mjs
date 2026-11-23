import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import save from '../cmd/system/savefile.ts';
import get from '../cmd/system/getcode.ts';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-commands-test-'));
const original=process.cwd();
fs.mkdirSync(path.join(root,'cmd','system'),{recursive:true});
fs.writeFileSync(path.join(root,'cmd','system','ping.ts'),'export default 1;\n');
process.chdir(root);
after(()=>{process.chdir(original);fs.rmSync(root,{recursive:true,force:true})});
const messages=[];
const base={isOwner:true,isGroup:false,usedPrefix:'$',prefix:'$',msg:{message:{}},args:[],rawText:'',reply:async value=>{messages.push(value);return value}};
test('solo owners en privado o grupos',async()=>{
 for (const isGroup of [false,true]) {
   const deniedSave=await save.run({...base,isOwner:false,isGroup,rawText:'cmd/system/hack.ts abc'});
   const deniedGet=await get.run({...base,isOwner:false,isGroup,rawText:'cmd/system/ping.ts'});
   assert.match(deniedSave,/Solo los owners/);
   assert.match(deniedGet,/Solo los owners/);
 }
 assert.equal(fs.existsSync(path.join(root,'.aura-owner-staging')),false);
});
test('owners pueden consultar código dentro de grupos',async()=>{
 const fromGroup=await get.run({...base,isGroup:true,rawText:'cmd/system/ping.ts'});
 assert.equal(fromGroup.fileName,'ping.ts');
 assert.match(fromGroup.document.toString(),/export default 1/);
});
test('owners pueden guardar código citado dentro de grupos',async()=>{
 const msg={message:{extendedTextMessage:{contextInfo:{quotedMessage:{conversation:'export default 87;'}}}}};
 const out=await save.run({...base,isGroup:true,msg,rawText:'cmd/system/grupo.ts'});
 assert.match(out,/staged\/cmd\/system\/grupo.ts/);
 const read=await get.run({...base,isGroup:true,rawText:'staged/cmd/system/grupo.ts'});
 assert.equal(read.document.toString(),'export default 87;\n');
});

test('guardar desde mensaje citado y exportarlo con getcode',async()=>{
 const msg={message:{extendedTextMessage:{contextInfo:{quotedMessage:{conversation:'\x60\x60\x60ts\nexport default 11;\n\x60\x60\x60'}}}}};
 await save.run({...base,msg,rawText:'cmd/system/demo.ts',args:['cmd/system/demo.ts']});
 assert.match(messages.at(-1),/staged\/cmd\/system\/demo.ts/);
 const exported=await get.run({...base,rawText:'staged/cmd/system/demo.ts'});
 assert.equal(exported.fileName,'demo.ts');
 assert.equal(exported.document.toString(),'export default 11;\n');
});
test('reemplazo requiere confirmación explícita',async()=>{
 await save.run({...base,rawText:'cmd/system/demo.ts export default 12;'});
 assert.match(messages.at(-1),/Ya existe/);
 await save.run({...base,rawText:'cmd/system/demo.ts --replace export default 12;'});
 assert.match(messages.at(-1),/actualizado/);
 assert.equal(fs.readFileSync(path.join(root,'cmd','system','ping.ts'),'utf8'),'export default 1;\n');
});
test('getcode directorio y bloqueo de ruta sensible',async()=>{
 const list=await get.run({...base,rawText:'cmd/system'});
 assert.match(list,/ping.ts/);
 const bad=await get.run({...base,rawText:'config.ts'});
 assert.match(bad,/Ruta prohibida|no está autorizada|ubicación no está autorizada/i);
});
// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
