import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../backend/server.js';
import {validate} from '../backend/validation.js';
import {createPdf,pensionFor} from '../backend/pdf.js';
import {lookupDni,normalizePerson} from '../backend/dni.js';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

export const sample={tipo:'nuevo',estudiantes:[{nombre:'ESTUDIANTE DE PRUEBA',dni:'00123456',grado:'1.º',nivel:'Primaria',procedencia:'Colegio de prueba'}],contactos:[{parentesco:'Madre',nombre:'CONTACTO DE PRUEBA',dni:'00012345',celular:'900000000'}],correo:'prueba@example.com',direccion:'Dirección de prueba',ocupacion:'Docente'};
test('validación conserva ceros y rechaza grados, DNI duplicados y parentescos inválidos',()=>{
  assert.equal(validate(sample).estudiantes[0].dni,'00123456');
  assert.throws(()=>validate({...sample,estudiantes:[{...sample.estudiantes[0],nivel:'Secundaria',grado:'6.º'}]}));
  assert.throws(()=>validate({...sample,estudiantes:[...sample.estudiantes,...sample.estudiantes]}));
  assert.throws(()=>validate({...sample,contactos:[{...sample.contactos[0],parentesco:'otro'}]}));
});
test('fichas de 1, 2 y 3 hermanos: una página familiar y tarifas de las referencias',async()=>{
  for(const total of [1,2,3,4]) {
    const pdf=await createPdf({...sample,estudiantes:Array.from({length:total},(_,i)=>({...sample.estudiantes[0],dni:String(i).padStart(8,'0')}))});
    assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
    assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,Math.ceil(total/3));
  }
  assert.equal(pensionFor(2,0,9),'S/ 480.00');
  assert.equal(pensionFor(2,1,9),'S/ 470.00');
  assert.equal(pensionFor(3,0,9),'S/ 500.00');
  assert.equal(pensionFor(3,2,9),'S/ 450.00');
});
test('CSS original y animaciones idénticos a FRONTED FINAL',()=>{
  const baseline=execFileSync('git',['show','54241f4:estilos.css'],{encoding:'utf8'});
  const current=readFileSync(new URL('../estilos.css',import.meta.url),'utf8');
  assert.equal(current.replace(/\r\n/g,'\n'),baseline.replace(/\r\n/g,'\n'));
});
test('consulta DNI: nombres, dirección ausente, fallos y token solo en Authorization',async()=>{
  const result=normalizePerson({dni:'00012345',nombres:'NOMBRE PRUEBA',apellidoPaterno:'APELLIDO',apellidoMaterno:'SEGUNDO'},'00012345');
  assert.equal(result.nombre,'APELLIDO SEGUNDO NOMBRE PRUEBA');assert.equal(result.direccion,'');
  assert.throws(()=>normalizePerson({success:false},'00012345'));
  await assert.rejects(()=>lookupDni('123',{token:'secreto'}));
  await assert.rejects(()=>lookupDni('00012345',{token:''}));
  let inspected=false;
  await lookupDni('00012345',{token:'secreto',fetcher:async(url,opts)=>{
    assert.ok(!url.includes('secreto'));assert.equal(opts.headers.Authorization,'Bearer secreto');inspected=true;
    return {ok:true,json:async()=>({dni:'00012345',nombres:'PRUEBA',apellidoPaterno:'APELLIDO'})};
  }});assert.equal(inspected,true);
});
test('API: registro confirmado, error real de Google, validación y rutas privadas',async t=>{
  const received=[];
  const attached=[];
  const server=createApp({attachPdf:async pdf=>attached.push(pdf),lookup:async dni=>({dni,nombre:'CONTACTO PRUEBA',direccion:''}),save:async(data,id)=>{received.push({data,id});if(data.correo==='error@example.com'){const e=new Error('Google no confirmó');e.status=502;throw e;}}}).listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));
  t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(path,data,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'10000000-0000-4000-8000-000000000001',...headers},body:JSON.stringify(data)});
  assert.equal((await post('/api/matriculas',sample)).status,200);
  assert.equal(received[0].data.estudiantes[0].dni,'00123456');
  assert.equal((await post('/api/matriculas',{...sample,correo:'error@example.com'})).status,502);
  assert.equal((await post('/api/matriculas',{})).status,400);
  assert.equal((await post('/api/dni',{dni:'123'})).status,400);
  assert.equal((await (await post('/api/dni',{dni:'00012345'})).json()).nombre,'CONTACTO PRUEBA');
  assert.equal((await fetch(base+'/.env')).status,404);
  assert.equal((await fetch(base+'/google-apps-script/Code.gs')).status,404);
  const pdf=await post('/api/pdf',sample);
  assert.match(pdf.headers.get('content-type'),/application\/pdf/);
  assert.equal((await pdf.arrayBuffer()).byteLength>1000,true);
  const savedPdf = await post('/api/matriculas', sample, {Accept: 'application/pdf'});
  assert.equal(savedPdf.status, 200);
  assert.match(savedPdf.headers.get('content-type'), /application\/pdf/);
  const savedBytes = Buffer.from(await savedPdf.arrayBuffer());
  assert.equal(savedBytes.subarray(0, 5).toString(), '%PDF-');
  const attach = (origin, body = savedBytes) => fetch(base+'/api/whatsapp/adjuntar', {
    method:'POST', headers:{'Content-Type':'application/pdf', ...(origin ? {Origin:origin} : {})}, body
  });
  assert.equal((await attach()).status, 403);
  assert.equal((await attach('https://example.com')).status, 403);
  assert.equal((await attach(base, 'archivo inválido')).status, 400);
  assert.equal((await attach(base)).status, 200);
  assert.deepEqual(attached, [savedBytes]);
  const failedPdf = await post('/api/matriculas', {...sample, correo: 'error@example.com'}, {Accept: 'application/pdf'});
  assert.equal(failedPdf.status, 502);
  assert.match(failedPdf.headers.get('content-type'), /application\/json/);
});
