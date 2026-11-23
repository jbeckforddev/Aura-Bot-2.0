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
 assert.match(fromGroup.text,/𝐆𝐄𝐓𝐂𝐎𝐃𝐄/);
 assert.match(fromGroup.text,/export default 1/);
 assert.equal(fromGroup.document,undefined);
});
test('owners pueden guardar código citado dentro de grupos',async()=>{
 const msg={message:{extendedTextMessage:{contextInfo:{quotedMessage:{conversation:'export default 87;'}}}}};
 const out=await save.run({...base,isGroup:true,msg,rawText:'cmd/system/grupo.ts'});
 assert.match(out,/staged\/cmd\/system\/grupo.ts/);
 const read=await get.run({...base,isGroup:true,rawText:'staged/cmd/system/grupo.ts'});
 assert.match(read.text,/export default 87;/);
 assert.equal(read.document,undefined);
});

test('guardar desde mensaje citado y exportarlo con getcode',async()=>{
 const msg={message:{extendedTextMessage:{contextInfo:{quotedMessage:{conversation:'\x60\x60\x60ts\nexport default 11;\n\x60\x60\x60'}}}}};
 await save.run({...base,msg,rawText:'cmd/system/demo.ts',args:['cmd/system/demo.ts']});
 assert.match(messages.at(-1),/staged\/cmd\/system\/demo.ts/);
 const exported=await get.run({...base,rawText:'staged/cmd/system/demo.ts'});
 assert.match(exported.text,/export default 11;/);
 assert.equal(exported.document,undefined);
});
test('actualiza archivo automáticamente sin --replace',async()=>{
 const one=await save.run({...base,rawText:'cmd/system/demo.ts export default 12;'});
 assert.match(one,/actualizado/);
 const two=await save.run({...base,rawText:'cmd/system/demo.ts export default 13;'});
 assert.match(two,/actualizado/);
 const result=await get.run({...base,rawText:'staged/cmd/system/demo.ts'});
 assert.match(result.text,/export default 13;/);
 assert.equal(result.document,undefined);
 assert.equal(fs.readFileSync(path.join(root,'cmd','system','ping.ts'),'utf8'),'export default 1;\n');
});
test('getcode directorio y bloqueo de ruta sensible',async()=>{
 const list=await get.run({...base,rawText:'cmd/system'});
 assert.match(list,/ping.ts/);
 const bad=await get.run({...base,rawText:'config.ts'});
 assert.match(bad,/Ruta prohibida|no está autorizada|ubicación no está autorizada|archivo inválido o protegido/i);
});
test('getcode por nombre sin ruta envía el archivo correcto',async()=>{
 const found=await get.run({...base,isGroup:true,rawText:'ping'});
 assert.match(found.text,/𝐆𝐄𝐓𝐂𝐎𝐃𝐄/);
 assert.match(found.text,/cmd\/system\/ping\.ts/);
 assert.match(found.text,/export default 1/);
 assert.equal(found.document,undefined);
 const withExtension=await get.run({...base,rawText:'ping.ts'});
 assert.match(withExtension.text,/export default 1/);
});
test('getcode encuentra archivos preparados solo por nombre',async()=>{
 const found=await get.run({...base,rawText:'grupo'});
 assert.match(found.text,/export default 87;/);
 assert.match(found.text,/staged\/cmd\/system\/grupo\.ts/);
 assert.match(found.text,/𝐆𝐄𝐓𝐂𝐎𝐃𝐄/);
 assert.equal(found.document,undefined);
});
test('getcode distingue coincidencias duplicadas y no entrega al azar',async()=>{
 fs.mkdirSync(path.join(root,'cmd','group'),{recursive:true});
 fs.writeFileSync(path.join(root,'cmd','group','duplicado.ts'),'export default 2;\n');
 fs.writeFileSync(path.join(root,'cmd','system','duplicado.ts'),'export default 3;\n');
 const result=await get.run({...base,rawText:'duplicado'});
 assert.equal(typeof result,'string');
 assert.match(result,/cmd\/group\/duplicado.ts/);
 assert.match(result,/cmd\/system\/duplicado.ts/);
 const specific=await get.run({...base,rawText:'cmd/group/duplicado.ts'});
 assert.match(specific.text,/export default 2;/);
 assert.equal(specific.document,undefined);
});
test('getcode rechaza nombres protegidos y búsquedas vacías',async()=>{
 const sensitive=await get.run({...base,rawText:'config.ts'});
 assert.match(sensitive,/protegido|inválido/i);
 const missing=await get.run({...base,rawText:'archivoinexistente'});
 assert.match(missing,/No encontré/i);
});
// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
