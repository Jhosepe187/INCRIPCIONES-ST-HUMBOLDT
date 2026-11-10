import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

function setup({shareSupported = true, active = true, saveSucceeds = true} = {}){
  const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost:3000',runScripts:'outside-only'});
  const {window}=dom,doc=window.document;
  window.scrollTo=()=>{};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.URL.createObjectURL=()=> 'blob:test';window.URL.revokeObjectURL=()=>{};
  window.File=File;
  let shared=null,downloads=0;
  const chatUrls = [];
  window.open = url => { chatUrls.push(url); return null; };
  const submissions = [];
  const activation = {isActive: active};
  Object.defineProperty(window.navigator,'userActivation',{value:activation});
  Object.defineProperty(window.navigator,'canShare',{value:()=>shareSupported});
  Object.defineProperty(window.navigator,'share',{value:async payload=>{shared=payload;}});
  window.fetch=async(path,options)=>{
    const body=JSON.parse(options.body);
    if(path==='/api/dni')return new Response(JSON.stringify({dni:body.dni,nombre:'CONTACTO CONSULTADO',direccion:''}));
    if(path==='/api/matriculas') {
      submissions.push({body, headers: options.headers});
      if (!saveSucceeds) return new Response(JSON.stringify({error: 'Google Sheets no confirmó el registro.'}), {status: 502});
      return new Response('%PDF-prueba',{headers:{'Content-Type':'application/pdf'}});
    }
    throw new Error('Ruta inesperada: ' + path);
  };
  window.eval(readFileSync(new URL('../inscripcion.js',import.meta.url),'utf8'));
  doc.querySelector('#pdf-download').addEventListener('click',e=>{e.preventDefault();downloads++;});
  doc.querySelector('#new').click();
  doc.querySelector('#count').value='2';
  doc.querySelector('#quantity-form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  const fill=(selector,value,event='input')=>{const el=doc.querySelector(selector);el.value=value;el.dispatchEvent(new window.Event(event,{bubbles:true}));};
  for(let i=0;i<2;i++){
    const root=`#students fieldset:nth-child(${i+1})`;
    fill(root+' [data-key=nombre]',`ESTUDIANTE ${i+1}`);fill(root+' [data-key=dni]',`0012345${i}`);
    fill(root+' [data-key=nivel]','Primaria','change');fill(root+' [data-key=grado]','1.º');
  }
  fill('#primary [data-key=dni]','00012345');fill('#primary [data-key=celular]','900000000');
  fill('[name=correo]','prueba@example.com');fill('[name=direccion]','Dirección de demostración');
  return {dom,doc,submissions,activation,chatUrls,shared:()=>shared,downloads:()=>downloads};
}
async function submit(doc, expectedStatus){
  const buttons = doc.querySelectorAll('.action-area button');
  assert.equal(buttons.length, 1);
  buttons[0].click();
  const status = doc.querySelector('#status');
  for (let i = 0; i < 100 && !expectedStatus.test(status.textContent); i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.match(status.textContent, expectedStatus);
}
test('un clic registra la matrícula y abre compartir con el PDF confirmado',async t=>{
  const {dom,doc,submissions,shared,downloads}=setup();t.after(()=>dom.window.close());
  await submit(doc, /Comprueba el envío/);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].headers.Accept, 'application/pdf');
  assert.equal(submissions[0].body.estudiantes.length, 2);
  assert.equal(doc.querySelector('#primary [data-key=nombre]').value,'CONTACTO CONSULTADO');
  assert.equal(doc.querySelector('#address-field').hidden,false);
  assert.equal(downloads(),0);
  assert.equal(shared().files[0].type,'application/pdf');
  assert.equal(await shared().files[0].text(),'%PDF-prueba');
});
test('si expira el clic, el mismo botón comparte la ficha sin volver a guardar', async t => {
  const {dom, doc, submissions, activation, shared} = setup({active: false});
  t.after(() => dom.window.close());
  await submit(doc, /Pulsa Compartir PDF/);
  assert.equal(shared(), null);
  activation.isActive = true;
  await submit(doc, /Comprueba el envío/);
  assert.equal(submissions.length, 1);
  assert.equal(shared().files.length, 1);
});
test('en escritorio, descarga el PDF y abre WhatsApp después de guardar', async t => {
  const {dom, doc, submissions, shared, downloads, chatUrls} = setup({shareSupported: false});
  t.after(() => dom.window.close());
  await submit(doc, /Matrícula guardada. Adjunta/);
  assert.equal(submissions.length, 1);
  assert.equal(doc.querySelector('#delivery').hidden, false);
  assert.equal(downloads(), 1);
  assert.match(chatUrls[0], /^https:\/\/wa\.me\/51901648212\?text=/);
  assert.equal(shared(), null);
});
test('un campo obligatorio vacío muestra por qué el botón no envía', async t => {
  const {dom, doc, submissions, chatUrls} = setup({shareSupported: false});
  t.after(() => dom.window.close());
  doc.querySelector('[name=correo]').value = '';
  await submit(doc, /Revisa el campo «Correo electrónico»/);
  assert.equal(submissions.length, 0);
  assert.equal(chatUrls.length, 0);
});
test('si falla el registro no se ofrece compartir y el reintento usa la misma clave', async t => {
  const {dom, doc, submissions, shared} = setup({saveSucceeds: false});
  t.after(() => dom.window.close());
  await submit(doc, /Google Sheets no confirmó/);
  await submit(doc, /Google Sheets no confirmó/);
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].headers['Idempotency-Key'], submissions[1].headers['Idempotency-Key']);
  assert.equal(doc.querySelector('#delivery').hidden, true);
  assert.equal(shared(), null);
});
