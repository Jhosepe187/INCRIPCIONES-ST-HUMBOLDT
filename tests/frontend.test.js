import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

function setup({saveSucceeds = true, attachSucceeds = true, url = 'http://localhost:3000', mobileShare = false} = {}){
  const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url,runScripts:'outside-only'});
  const {window}=dom,doc=window.document;
  window.scrollTo=()=>{};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.URL.createObjectURL=()=> 'blob:test';window.URL.revokeObjectURL=()=>{};
  let downloads=0;
  const attachments = [];
  const submissions = [];
  const nativeShares = [];
  window.File = File;
  if (mobileShare) {
    window.navigator.canShare = ({files}) => files[0].type === 'application/pdf';
    window.navigator.share = async data => nativeShares.push(data);
  }
  window.fetch=async(path,options)=>{
    if (path === '/api/whatsapp/adjuntar') {
      attachments.push(options);
      if (!attachSucceeds && attachments.length === 1) {
        return new Response(JSON.stringify({error:'Vincula el QR y vuelve a pulsar Compartir PDF.'}), {status:409});
      }
      return new Response(JSON.stringify({ok:true}));
    }
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
  return {dom,doc,submissions,attachments,nativeShares,downloads:()=>downloads};
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
test('Compartir PDF prepara la ficha guardada en el chat sin descargarla ni volver a guardar',async t=>{
  const {dom,doc,submissions,attachments,downloads}=setup();t.after(()=>dom.window.close());
  await submit(doc, /Pulsa Compartir PDF/);
  assert.equal(attachments.length, 0);
  await submit(doc, /PDF adjunto en el chat del colegio/);
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].headers.Accept, 'application/pdf');
  assert.equal(submissions[0].body.estudiantes.length, 2);
  assert.equal(doc.querySelector('#primary [data-key=nombre]').value,'CONTACTO CONSULTADO');
  assert.equal(doc.querySelector('#address-field').hidden,false);
  assert.equal(downloads(),0);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].headers['Content-Type'], 'application/pdf');
  assert.equal(await attachments[0].body.text(),'%PDF-prueba');
});
test('después de vincular el QR se reintenta el adjunto sin duplicar la matrícula', async t => {
  const {dom, doc, submissions, attachments} = setup({attachSucceeds: false});
  t.after(() => dom.window.close());
  await submit(doc, /Pulsa Compartir PDF/);
  await submit(doc, /Vincula el QR/);
  await submit(doc, /PDF adjunto en el chat del colegio/);
  assert.equal(submissions.length, 1);
  assert.equal(attachments.length, 2);
});
test('en celular HTTPS se comparte el PDF con el menú del dispositivo', async t => {
  const {dom, doc, submissions, attachments, nativeShares} = setup({url: 'https://matriculas.example', mobileShare: true});
  t.after(() => dom.window.close());
  await submit(doc, /elige WhatsApp y el chat del colegio/);
  await submit(doc, /Confirma el envío/);
  assert.equal(submissions.length, 1);
  assert.equal(attachments.length, 0);
  assert.equal(nativeShares.length, 1);
  assert.equal(await nativeShares[0].files[0].text(), '%PDF-prueba');
});
test('en un navegador sin compartir archivos quedan la descarga y el chat', async t => {
  const {dom, doc, attachments} = setup({url: 'https://matriculas.example'});
  t.after(() => dom.window.close());
  await submit(doc, /Descarga la ficha y adjúntala/);
  assert.equal(doc.querySelector('#delivery').hidden, false);
  assert.match(doc.querySelector('#whatsapp-chat').href, /^https:\/\/wa\.me\/51901648212/);
  assert.equal(attachments.length, 0);
});
test('un campo obligatorio vacío muestra por qué el botón no envía', async t => {
  const {dom, doc, submissions, attachments} = setup();
  t.after(() => dom.window.close());
  doc.querySelector('[name=correo]').value = '';
  await submit(doc, /Revisa el campo «Correo electrónico»/);
  assert.equal(submissions.length, 0);
  assert.equal(attachments.length, 0);
});
test('si falla el registro no se ofrece compartir y el reintento usa la misma clave', async t => {
  const {dom, doc, submissions, attachments} = setup({saveSucceeds: false});
  t.after(() => dom.window.close());
  await submit(doc, /Google Sheets no confirmó/);
  await submit(doc, /Google Sheets no confirmó/);
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0].headers['Idempotency-Key'], submissions[1].headers['Idempotency-Key']);
  assert.equal(doc.querySelector('#delivery').hidden, true);
  assert.equal(attachments.length, 0);
});
