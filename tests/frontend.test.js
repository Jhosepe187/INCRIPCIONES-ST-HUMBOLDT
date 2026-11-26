import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

function setup({saveSucceeds = true, url = 'http://localhost:8000/', mobileShare = false, shareNeedsTap = false, beforeSave} = {}){
  const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url,runScripts:'outside-only'});
  const {window}=dom,doc=window.document;
  window.scrollTo=()=>{};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.URL.createObjectURL=()=> 'blob:test';window.URL.revokeObjectURL=()=>{};
  let downloads=0;
  const paths = [];
  const submissions = [];
  const nativeShares = [];
  window.File = File;
  if (mobileShare) {
    window.navigator.canShare = ({files}) => files[0].type === 'application/pdf';
    let blocked = shareNeedsTap;
    window.navigator.share = async data => {
      // Algunos celulares rechazan compartir si pasó mucho tiempo desde el toque.
      if (blocked) { blocked = false; throw new window.DOMException('Requiere un toque', 'NotAllowedError'); }
      nativeShares.push(data);
    };
  }
  window.fetch=async(path,options)=>{
    paths.push(path);
    const body=JSON.parse(options.body);
    if(path==='api/dni.php')return new Response(JSON.stringify({dni:body.dni,nombre:'CONTACTO CONSULTADO',direccion:''}));
    if(path==='api/matriculas.php') {
      submissions.push({body, headers: options.headers});
      await beforeSave?.();
      if (!saveSucceeds) return new Response(JSON.stringify({error: 'Google Sheets no confirmó el registro.'}), {status: 502});
      return new Response('%PDF-prueba',{headers:{'Content-Type':'application/pdf'}});
    }
    throw new Error('Ruta inesperada: ' + path);
  };
  window.eval(readFileSync(new URL('../public/js/inscripcion.js',import.meta.url),'utf8'));
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
  return {dom,doc,submissions,paths,nativeShares,downloads:()=>downloads};
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
test('un solo clic guarda la matrícula y en computadora deja la descarga y el chat del colegio',async t=>{
  const {dom,doc,submissions,paths,downloads}=setup();t.after(()=>dom.window.close());
  await submit(doc, /Descarga la ficha y adjúntala en el chat del colegio/);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].headers.Accept, 'application/pdf');
  assert.equal(submissions[0].body.estudiantes.length, 2);
  assert.equal(doc.querySelector('#primary [data-key=nombre]').value,'CONTACTO CONSULTADO');
  assert.equal(doc.querySelector('#address-field').hidden,false);
  assert.equal(downloads(),0);
  assert.equal(doc.querySelector('#delivery').hidden, false);
  assert.match(doc.querySelector('#whatsapp-chat').href, /^https:\/\/wa\.me\/51901648212/);
  assert.deepEqual([...new Set(paths)], ['api/dni.php', 'api/matriculas.php']);
});
test('las rutas de la API son relativas para funcionar dentro de una carpeta de WordPress', async t => {
  const {dom, doc, paths} = setup({url: 'https://colegio.example/matriculas/'});
  t.after(() => dom.window.close());
  await submit(doc, /Descarga la ficha/);
  assert.ok(paths.length >= 2);
  assert.ok(paths.every(path => !path.startsWith('/') && path.startsWith('api/') && path.endsWith('.php')));
});
test('espera la confirmación de Google y bloquea envíos repetidos mientras guarda', async t => {
  const saved = Promise.withResolvers();
  const {dom, doc, submissions} = setup({beforeSave: () => saved.promise});
  t.after(() => { saved.resolve(); dom.window.close(); });
  await submit(doc, /Guardando matrícula/);
  const form = doc.querySelector('#enrollment');
  const button = doc.querySelector('.action-area button');
  const repeatSubmit = () => form.dispatchEvent(new dom.window.Event('submit', {bubbles:true, cancelable:true}));
  assert.equal(button.disabled, true);
  assert.equal(doc.querySelector('#back').disabled, true);
  repeatSubmit();
  assert.equal(submissions.length, 1);
  saved.resolve();
  for (let i=0; i<100 && button.disabled; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(button.disabled, false);
  assert.equal(form.getAttribute('aria-busy'), 'false');
  assert.equal(submissions.length, 1);
  assert.match(doc.querySelector('#status').textContent, /Matrícula guardada/);
});
test('en celular HTTPS se comparte el PDF con el menú del dispositivo', async t => {
  const {dom, doc, submissions, nativeShares} = setup({url: 'https://matriculas.example', mobileShare: true});
  t.after(() => dom.window.close());
  await submit(doc, /Confirma el envío/);
  assert.equal(submissions.length, 1);
  assert.equal(nativeShares.length, 1);
  assert.equal(await nativeShares[0].files[0].text(), '%PDF-prueba');
});
test('si el celular pide otro toque para compartir, queda el botón Compartir PDF', async t => {
  const {dom, doc, submissions, nativeShares} = setup({url: 'https://matriculas.example', mobileShare: true, shareNeedsTap: true});
  t.after(() => dom.window.close());
  await submit(doc, /Pulsa Compartir PDF y elige WhatsApp/);
  assert.equal(nativeShares.length, 0);
  await submit(doc, /Confirma el envío/);
  assert.equal(submissions.length, 1);
  assert.equal(nativeShares.length, 1);
});
test('en un navegador sin compartir archivos quedan la descarga y el chat', async t => {
  const {dom, doc} = setup({url: 'https://matriculas.example'});
  t.after(() => dom.window.close());
  await submit(doc, /Descarga la ficha y adjúntala/);
  assert.equal(doc.querySelector('#delivery').hidden, false);
  assert.match(doc.querySelector('#whatsapp-chat').href, /^https:\/\/wa\.me\/51901648212/);
});
test('un campo obligatorio vacío muestra por qué el botón no envía', async t => {
  const {dom, doc, submissions} = setup();
  t.after(() => dom.window.close());
  doc.querySelector('[name=correo]').value = '';
  await submit(doc, /Revisa el campo «Correo electrónico»/);
  assert.equal(submissions.length, 0);
});
test('si falla el registro no se ofrece compartir y el reintento usa la misma clave', async t => {
  const {dom, doc, submissions} = setup({saveSucceeds: false});
  t.after(() => dom.window.close());
  await submit(doc, /Google Sheets no confirmó/);
  await submit(doc, /Google Sheets no confirmó/);
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].headers['Idempotency-Key'], submissions[1].headers['Idempotency-Key']);
  assert.equal(doc.querySelector('#delivery').hidden, true);
});
