import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const CHAT = /^https:\/\/wa\.me\/51901648212\?text=/;
const DOWNLOADED = /se descargó como «matricula-2027-estudiante-1\.pdf»/;

// touch: celular o tablet (pointer: coarse). share: el navegador permite compartir archivos.
function setup({saveSucceeds = true, url = 'http://localhost:3000', touch = false, share = false, shareError, popupBlocked = false, beforeSave, consent = true} = {}){
  const dom=new JSDOM(readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),{url,runScripts:'outside-only'});
  const {window}=dom,doc=window.document;
  window.scrollTo=()=>{};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.URL.createObjectURL=()=> 'blob:test';window.URL.revokeObjectURL=()=>{};
  window.matchMedia = query => ({matches: touch && query === '(pointer: coarse)'});
  window.File = File;
  const submissions = [];
  const nativeShares = [];
  const opens = [];
  const downloaded = [];
  window.open = (href, target) => {
    if (popupBlocked) return null;
    const tab = {href, target, opener: window};
    opens.push(tab);
    return tab;
  };
  if (share) {
    window.navigator.canShare = ({files}) => files[0].type === 'application/pdf';
    let pending = shareError;
    window.navigator.share = async data => {
      // Algunos celulares rechazan compartir si pasó mucho tiempo desde el toque.
      if (pending) { const name = pending; pending = undefined; throw new window.DOMException('Fallo simulado', name); }
      nativeShares.push(data);
    };
  }
  window.fetch=async(path,options)=>{
    const body=JSON.parse(options.body);
    if(path==='/api/dni')return new Response(JSON.stringify({dni:body.dni,nombre:'CONTACTO CONSULTADO',direccion:''}));
    if(path==='/api/matriculas') {
      submissions.push({body, headers: options.headers});
      await beforeSave?.();
      if (!saveSucceeds) return new Response(JSON.stringify({error: 'Google Sheets no confirmó el registro.'}), {status: 502});
      return new Response('%PDF-prueba',{headers:{'Content-Type':'application/pdf'}});
    }
    throw new Error('Ruta inesperada: ' + path);
  };
  window.eval(readFileSync(new URL('../public/js/inscripcion.js',import.meta.url),'utf8'));
  doc.querySelector('#pdf-download').addEventListener('click',e=>{e.preventDefault();downloaded.push(e.currentTarget.download);});
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
  doc.querySelector('[name=consentimiento]').checked = consent;
  return {dom,doc,fill,submissions,nativeShares,opens,downloaded,downloads:()=>downloaded.length};
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
const label = doc => doc.querySelector('#submit-label').textContent;

for (const url of ['http://localhost:3000', 'https://matriculas.example']) {
  test(`computadora (${url}): un clic guarda y descarga la ficha; el siguiente abre el chat del colegio`, async t => {
    const {dom, doc, submissions, opens, downloaded} = setup({url});
    t.after(() => dom.window.close());
    await submit(doc, DOWNLOADED);
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].headers.Accept, 'application/pdf');
    assert.equal(submissions[0].body.estudiantes.length, 2);
    assert.equal(doc.querySelector('#primary [data-key=nombre]').value,'CONTACTO CONSULTADO');
    assert.equal(doc.querySelector('#address-field').hidden,false);
    assert.deepEqual(downloaded, ['matricula-2027-estudiante-1.pdf']);
    assert.equal(opens.length, 0);
    assert.equal(label(doc), 'Abrir WhatsApp');
    assert.equal(doc.querySelector('#delivery').hidden, false);
    assert.match(doc.querySelector('#whatsapp-chat').href, CHAT);
    await submit(doc, /En el chat del colegio, adjunta «matricula-2027-estudiante-1\.pdf»/);
    assert.equal(opens.length, 1);
    assert.match(opens[0].href, CHAT);
    assert.equal(opens[0].target, '_blank');
    assert.equal(opens[0].opener, null);
    assert.equal(downloaded.length, 1, 'no vuelve a descargar la ficha');
    assert.equal(submissions.length, 1, 'no repite la matrícula');
  });
}
test('si el navegador bloquea la ventana, se indica usar el enlace del chat', async t => {
  const {dom, doc} = setup({popupBlocked: true});
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  await submit(doc, /bloqueó la ventana. Usa el enlace «Abrir chat del colegio»/);
  assert.equal(label(doc), 'Abrir WhatsApp');
});
test('espera la confirmación de Google y bloquea envíos repetidos mientras guarda', async t => {
  const saved = Promise.withResolvers();
  const {dom, doc, submissions, downloads} = setup({beforeSave: () => saved.promise});
  t.after(() => { saved.resolve(); dom.window.close(); });
  await submit(doc, /Guardando matrícula/);
  const form = doc.querySelector('#enrollment');
  const button = doc.querySelector('.action-area button');
  const repeatSubmit = () => form.dispatchEvent(new dom.window.Event('submit', {bubbles:true, cancelable:true}));
  assert.equal(button.disabled, true);
  assert.equal(doc.querySelector('#back').disabled, true);
  repeatSubmit();
  assert.equal(submissions.length, 1);
  assert.equal(downloads(), 0, 'no entrega la ficha antes de que Google confirme');
  saved.resolve();
  for (let i=0; i<100 && button.disabled; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(button.disabled, false);
  assert.equal(form.getAttribute('aria-busy'), 'false');
  assert.match(doc.querySelector('#status').textContent, DOWNLOADED);
  assert.equal(submissions.length, 1);
});
test('celular HTTPS: se comparte el PDF con el menú del dispositivo', async t => {
  const {dom, doc, submissions, nativeShares, downloads, opens} = setup({url: 'https://matriculas.example', touch: true, share: true});
  t.after(() => dom.window.close());
  await submit(doc, /Confirma el envío/);
  assert.equal(submissions.length, 1);
  assert.equal(nativeShares.length, 1);
  assert.equal(nativeShares[0].files[0].name, 'matricula-2027-estudiante-1.pdf');
  assert.equal(await nativeShares[0].files[0].text(), '%PDF-prueba');
  assert.match(nativeShares[0].text, /ficha de matrícula 2027/);
  assert.equal(downloads(), 0);
  assert.equal(opens.length, 0);
});
test('si el celular pide otro toque para compartir, queda el botón Compartir PDF', async t => {
  const {dom, doc, submissions, nativeShares} = setup({url: 'https://matriculas.example', touch: true, share: true, shareError: 'NotAllowedError'});
  t.after(() => dom.window.close());
  await submit(doc, /Pulsa Compartir PDF y elige WhatsApp/);
  assert.equal(label(doc), 'Compartir PDF');
  assert.equal(nativeShares.length, 0);
  await submit(doc, /Confirma el envío/);
  assert.equal(submissions.length, 1);
  assert.equal(nativeShares.length, 1);
});
test('si el celular no logra compartir el archivo, se descarga y se ofrece el chat', async t => {
  const {dom, doc, nativeShares, downloads} = setup({url: 'https://matriculas.example', touch: true, share: true, shareError: 'DataError'});
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  assert.equal(nativeShares.length, 0);
  assert.equal(downloads(), 1);
  assert.equal(label(doc), 'Abrir WhatsApp');
});
test('en computadora no se usa el menú compartir aunque el navegador lo ofrezca', async t => {
  const {dom, doc, nativeShares, downloads} = setup({url: 'https://matriculas.example', share: true});
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  assert.equal(nativeShares.length, 0);
  assert.equal(downloads(), 1);
});
test('editar el formulario después de enviar vuelve al botón Enviar matrícula', async t => {
  const {dom, doc, fill} = setup();
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  fill('[name=correo]', 'otro@example.com');
  assert.equal(label(doc), 'Enviar matrícula');
  assert.equal(doc.querySelector('#delivery').hidden, true);
  assert.equal(doc.querySelector('#status').textContent, '');
});
test('un campo obligatorio vacío muestra por qué el botón no envía', async t => {
  const {dom, doc, submissions} = setup();
  t.after(() => dom.window.close());
  doc.querySelector('[name=correo]').value = '';
  await submit(doc, /Revisa el campo «Correo electrónico»/);
  assert.equal(submissions.length, 0);
});
test('sin la autorización de la Ley 29733 no se envía la matrícula', async t => {
  const {dom, doc, submissions} = setup({consent: false});
  t.after(() => dom.window.close());
  await submit(doc, /autorización de tratamiento de datos personales \(Ley N\.° 29733\)/);
  assert.equal(submissions.length, 0);
  doc.querySelector('[name=consentimiento]').checked = true;
  await submit(doc, DOWNLOADED);
  assert.equal(submissions.length, 1);
});
test('los términos se muestran al cargar el portal y no se cierran sin aceptar', async t => {
  const {dom, doc} = setup();
  t.after(() => dom.window.close());
  const terms = doc.querySelector('#terms');
  assert.equal(terms.open, false);
  doc.dispatchEvent(new dom.window.Event('portal:listo'));
  assert.equal(terms.open, true);
  assert.equal(doc.querySelector('#terms-continue').disabled, true);
  const cancel = new dom.window.Event('cancel', {cancelable: true});
  terms.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  const accept = doc.querySelector('#terms-accept');
  accept.checked = true;
  accept.dispatchEvent(new dom.window.Event('change'));
  assert.equal(doc.querySelector('#terms-continue').disabled, false);
  doc.querySelector('#terms-form').dispatchEvent(new dom.window.Event('submit', {cancelable: true}));
  assert.equal(dom.window.sessionStorage.getItem('terminos-aceptados'), '1');
});
test('ningún texto visible menciona al proveedor de DNI', async t => {
  const {dom, doc} = setup();
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  assert.doesNotMatch(doc.body.textContent, /apis\s*per/i);
});
test('si falla el registro no se ofrece compartir y el reintento usa la misma clave', async t => {
  const {dom, doc, submissions, downloads, opens} = setup({saveSucceeds: false});
  t.after(() => dom.window.close());
  await submit(doc, /Google Sheets no confirmó/);
  await submit(doc, /Google Sheets no confirmó/);
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].headers['Idempotency-Key'], submissions[1].headers['Idempotency-Key']);
  assert.equal(doc.querySelector('#delivery').hidden, true);
  assert.equal(downloads(), 0);
  assert.equal(opens.length, 0);
});
