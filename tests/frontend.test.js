import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

function setup(shareSupported=true){
  const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost:3000',runScripts:'outside-only'});
  const {window}=dom,doc=window.document;
  window.scrollTo=()=>{};
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.URL.createObjectURL=()=> 'blob:test';window.URL.revokeObjectURL=()=>{};
  window.File=File;
  let shared=null,downloads=0;
  Object.defineProperty(window.navigator,'canShare',{value:()=>shareSupported});
  Object.defineProperty(window.navigator,'share',{value:async payload=>{shared=payload;}});
  window.fetch=async(path,options)=>{
    const body=JSON.parse(options.body);
    if(path==='/api/dni')return new Response(JSON.stringify({dni:body.dni,nombre:'CONTACTO CONSULTADO',direccion:''}));
    if(path==='/api/pdf')return new Response('%PDF-prueba',{headers:{'Content-Type':'application/pdf'}});
    throw new Error('No debe escribir matrículas durante esta prueba');
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
  return {dom,doc,shared:()=>shared,downloads:()=>downloads};
}
async function prepared(doc){
  doc.querySelector('#whatsapp').click();
  for(let i=0;i<100 && doc.querySelector('#delivery').hidden;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(doc.querySelector('#delivery').hidden,false,doc.querySelector('#status').textContent);
}
test('celular: comparte el archivo PDF y texto sin descargarlo; nombres desde DNI',async t=>{
  const {dom,doc,shared,downloads}=setup();t.after(()=>dom.window.close());
  await prepared(doc);
  assert.equal(doc.querySelector('#primary [data-key=nombre]').value,'CONTACTO CONSULTADO');
  assert.equal(doc.querySelector('#address-field').hidden,false);
  assert.equal(doc.querySelector('#share-pdf').hidden,false);
  assert.equal(downloads(),0);
  doc.querySelector('#share-pdf').click();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(shared().files[0].type,'application/pdf');
  assert.equal(await shared().files[0].text(),'%PDF-prueba');
  assert.match(shared().text,/ESTUDIANTE 1.*ESTUDIANTE 2/);
  assert.match(doc.querySelector('#status').textContent,/no recibe confirmación/);
});
test('sin soporte: explica la limitación y no anuncia archivo enviado',async t=>{
  const {dom,doc,shared}=setup(false);t.after(()=>dom.window.close());
  await prepared(doc);
  assert.equal(doc.querySelector('#share-pdf').hidden,true);
  assert.match(doc.querySelector('#share-help').textContent,/no permite compartir archivos/);
  assert.equal(shared(),null);
});
