import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const CHAT = /^https:\/\/wa\.me\/51901648212\?text=/;
const DOWNLOADED = /Envía la ficha por WhatsApp para terminar/;
const FILE = 'matricula-2027-estudiante-1.pdf';

// touch: celular o tablet (pointer: coarse). share: el navegador permite compartir archivos.
function setup({saveSucceeds = true, url = 'http://localhost:3000', touch = false, share = false, shareError, beforeSave, consent = true, fatherDni = '00054321'} = {}){
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
  const downloaded = [];
  const chats = [];
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
  doc.querySelector('#whatsapp-open').addEventListener('click',e=>{e.preventDefault();chats.push({href:e.currentTarget.href,target:e.currentTarget.target});});
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
  if (fatherDni) {fill('#secondary [data-key=dni]',fatherDni);fill('#secondary [data-key=celular]','911111111');}
  fill('[name=correo]','prueba@example.com');fill('[name=direccion]','Dirección de demostración');
  doc.querySelector('[name=consentimiento]').checked = consent;
  return {dom,doc,fill,submissions,nativeShares,downloaded,chats,downloads:()=>downloaded.length};
}
async function submit(doc, expectedStatus){
  const buttons = doc.querySelectorAll('.action-area button');
  assert.equal(buttons.length, 1);
  buttons[0].click();
  await waitFor(doc, expectedStatus);
}
async function waitFor(doc, expectedStatus){
  const status = doc.querySelector('#status');
  for (let i = 0; i < 100 && !expectedStatus.test(status.textContent); i++) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.match(status.textContent, expectedStatus);
}
const label = doc => doc.querySelector('#submit-label').textContent;
const dialog = doc => doc.querySelector('#whatsapp');

for (const url of ['http://localhost:3000', 'https://matriculas.example']) {
  test(`computadora (${url}): un clic guarda, descarga la ficha y abre el cuadro con el botón de WhatsApp`, async t => {
    const {dom, doc, submissions, downloaded, chats} = setup({url});
    t.after(() => dom.window.close());
    await submit(doc, DOWNLOADED);
    assert.equal(submissions.length, 1);
    assert.equal(submissions[0].headers.Accept, 'application/pdf');
    assert.equal(submissions[0].body.estudiantes.length, 2);
    assert.equal(doc.querySelector('#primary [data-key=nombre]').value,'CONTACTO CONSULTADO');
    assert.deepEqual(submissions[0].body.contactos.map(c=>[c.parentesco,c.dni,c.celular]),[['Madre','00012345','900000000'],['Padre','00054321','911111111']]);
    assert.equal(doc.querySelector('#address-field').hidden,false);
    assert.deepEqual(downloaded, [FILE]);
    assert.equal(label(doc), 'Enviar a WhatsApp');
    assert.equal(doc.querySelector('#delivery').hidden, false);
    assert.match(doc.querySelector('#whatsapp-chat').href, CHAT);
    // Cuadro flotante: instrucciones, nombre del archivo y botón de WhatsApp juntos.
    assert.equal(dialog(doc).open, true);
    assert.equal(doc.querySelector('#whatsapp-help').textContent, `La ficha ya se descargó. En el chat del colegio, adjunta «${FILE}» (clip › Documento) y pulsa Enviar.`);
    assert.equal(doc.querySelector('#whatsapp-file').textContent, FILE);
    assert.equal(doc.querySelector('#whatsapp-open').hidden, false);
    assert.equal(doc.querySelector('#whatsapp-share').hidden, true);
    assert.equal(doc.querySelector('#whatsapp-download').download, FILE);
    doc.querySelector('#whatsapp-open').click();
    assert.equal(chats.length, 1);
    assert.match(chats[0].href, CHAT);
    assert.equal(chats[0].target, '_blank');
    assert.equal(dialog(doc).open, false);
    assert.match(doc.querySelector('#status').textContent, new RegExp(`Se abrió el chat del colegio. Adjunta «${FILE.replaceAll('.', '\\.')}»`));
    // El botón principal vuelve a mostrar el cuadro sin repetir la matrícula ni la descarga.
    await submit(doc, /Se abrió el chat/);
    assert.equal(dialog(doc).open, true);
    assert.equal(downloaded.length, 1, 'no vuelve a descargar la ficha');
    assert.equal(submissions.length, 1, 'no repite la matrícula');
  });
}
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
  assert.equal(dialog(doc).open, false);
  saved.resolve();
  for (let i=0; i<100 && button.disabled; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(button.disabled, false);
  assert.equal(form.getAttribute('aria-busy'), 'false');
  assert.match(doc.querySelector('#status').textContent, DOWNLOADED);
  assert.equal(dialog(doc).open, true);
  assert.equal(submissions.length, 1);
});
test('celular HTTPS: se comparte el PDF con el menú del dispositivo sin cuadro extra', async t => {
  const {dom, doc, submissions, nativeShares, downloads} = setup({url: 'https://matriculas.example', touch: true, share: true});
  t.after(() => dom.window.close());
  await submit(doc, /Confirma el envío/);
  assert.equal(submissions.length, 1);
  assert.equal(nativeShares.length, 1);
  assert.equal(nativeShares[0].files[0].name, FILE);
  assert.equal(await nativeShares[0].files[0].text(), '%PDF-prueba');
  assert.match(nativeShares[0].text, /ficha de matrícula 2027/);
  assert.equal(downloads(), 0);
  assert.equal(dialog(doc).open, false);
});
test('si el celular pide otro toque, el cuadro ofrece Enviar a WhatsApp con el menú compartir', async t => {
  const {dom, doc, submissions, nativeShares, downloads} = setup({url: 'https://matriculas.example', touch: true, share: true, shareError: 'NotAllowedError'});
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  assert.equal(nativeShares.length, 0);
  assert.equal(dialog(doc).open, true);
  assert.equal(doc.querySelector('#whatsapp-share').hidden, false);
  assert.equal(doc.querySelector('#whatsapp-open').hidden, true);
  assert.match(doc.querySelector('#whatsapp-help').textContent, /elige el chat del colegio \(\+51 901 648 212\)/);
  doc.querySelector('#whatsapp-share').click();
  await waitFor(doc, /Confirma el envío/);
  assert.equal(nativeShares.length, 1);
  assert.equal(dialog(doc).open, false);
  assert.equal(submissions.length, 1);
  assert.equal(downloads(), 0);
});
test('si el celular no logra compartir el archivo, se descarga y el cuadro ofrece el chat', async t => {
  const {dom, doc, nativeShares, downloads} = setup({url: 'https://matriculas.example', touch: true, share: true, shareError: 'DataError'});
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  assert.equal(nativeShares.length, 0);
  assert.equal(downloads(), 1);
  assert.equal(dialog(doc).open, true);
  assert.equal(doc.querySelector('#whatsapp-open').hidden, false);
  assert.equal(doc.querySelector('#whatsapp-share').hidden, true);
});
test('en computadora no se usa el menú compartir aunque el navegador lo ofrezca', async t => {
  const {dom, doc, nativeShares, downloads} = setup({url: 'https://matriculas.example', share: true});
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  assert.equal(nativeShares.length, 0);
  assert.equal(downloads(), 1);
  assert.equal(doc.querySelector('#whatsapp-open').hidden, false);
});
test('editar el formulario después de enviar cierra el cuadro y vuelve a Enviar matrícula', async t => {
  const {dom, doc, fill} = setup();
  t.after(() => dom.window.close());
  await submit(doc, DOWNLOADED);
  fill('[name=correo]', 'otro@example.com');
  assert.equal(label(doc), 'Enviar matrícula');
  assert.equal(dialog(doc).open, false);
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
  const {dom, doc, submissions, downloads, chats} = setup({saveSucceeds: false});
  t.after(() => dom.window.close());
  await submit(doc, /Google Sheets no confirmó/);
  await submit(doc, /Google Sheets no confirmó/);
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].headers['Idempotency-Key'], submissions[1].headers['Idempotency-Key']);
  assert.equal(doc.querySelector('#delivery').hidden, true);
  assert.equal(downloads(), 0);
  assert.equal(chats.length, 0);
  assert.equal(doc.querySelector('#whatsapp').open, false);
});
test('el formulario muestra siempre los datos de la madre y del padre', async t => {
  const {dom, doc} = setup();
  t.after(() => dom.window.close());
  assert.deepEqual([...doc.querySelectorAll('.contact legend')].map(l => l.textContent), ['Datos de la madre', 'Datos del padre']);
  assert.equal(doc.querySelector('#additional'), null);
  assert.equal(doc.querySelector('#secondary').hidden, false);
  for (const field of doc.querySelectorAll('#secondary [data-key=dni], #secondary [data-key=celular]')) {
    assert.equal(field.required, true);
    assert.equal(field.disabled, false);
  }
});
test('sin los datos del padre no se envía la matrícula', async t => {
  const {dom, doc, submissions} = setup({fatherDni: ''});
  t.after(() => dom.window.close());
  await submit(doc, /Revisa el campo «DNI» \(Datos del padre\)/);
  assert.equal(submissions.length, 0);
});
test('la madre y el padre no pueden tener el mismo DNI', async t => {
  const {dom, doc, submissions} = setup({fatherDni: '00012345'});
  t.after(() => dom.window.close());
  await submit(doc, /no pueden tener el mismo DNI/);
  assert.equal(submissions.length, 0);
});
