import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8');
const data={tipo:'nuevo',estudiantes:[{nombre:'=FORMULA()',dni:'00123456',grado:'1.º',nivel:'Primaria'}],contactos:[{parentesco:'Madre',nombre:'Contacto',dni:'00012345',celular:'900000000'}],correo:'prueba@example.com',direccion:'Dirección',ocupacion:'Docente'};
function setup(){
  const sheets=new Map();
  let failWrite=false;
  function makeSheet(name){
    const values=[],notes=[];
    const sheet={values,notes,setFrozenRows(){},getLastRow:()=>name==='REGISTROS WEB'?values.length:Math.max(values.length,25),appendRow(row){values.push(row);},getDataRange(){return {getValues:()=>Array.from({length:values.length},(_,i)=>values[i]?[...values[i]]:[])};},getRange(r,c,n=1,m=1){return {
      getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(values[r+i-1]?.[c+j-1]??''))),
      getNotes:()=>Array.from({length:n},(_,i)=>[notes[r+i-1]||'']),
      setNote(value){notes[r-1]=value;return this;},setNumberFormat(){return this;},
      setValues(rows){if(failWrite&&name!=='REGISTROS WEB'){failWrite=false;throw new Error('Fallo simulado');}rows.forEach((row,i)=>row.forEach((v,j)=>{values[r+i-1]??=[];values[r+i-1][c+j-1]=v;}));return this;},
      setValue(value){return this.setValues([[value]]);}
    };}};
    sheets.set(name,sheet);return sheet;
  }
  const target=makeSheet('1° PRIMARIA');
  target.values[5]=Array(16).fill('');target.values[5][12]='PAGO EXISTENTE';
  const context=vm.createContext({ContentService:{MimeType:{JSON:'json'},createTextOutput:JSON.parse},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'secret'})},LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},SpreadsheetApp:{openById:()=>({getSheetByName:name=>sheets.get(name),insertSheet:makeSheet}),flush(){}},Date,Set,JSON});
  // El mock conserva el encadenamiento de ContentService.
  context.ContentService.createTextOutput=value=>({setMimeType:()=>JSON.parse(value)});
  vm.runInContext(source,context);
  const send=(payload=data,id='10000000-0000-4000-8000-000000000001',secret='secret')=>context.doPost({postData:{contents:JSON.stringify({secret,id,data:payload})}});
  return {send,target,sheets,failNext:()=>{failWrite=true;}};
}
test('Google bridge: mapeo de columnas, ceros, fórmulas neutralizadas, pagos intactos y reintento sin duplicados',()=>{
  const {send,target,sheets}=setup();
  assert.equal(send().ok,true);
  assert.equal(target.values[5][2],"'=FORMULA()");
  assert.equal(target.values[5][4],'00123456');
  assert.equal(target.values[5][12],'PAGO EXISTENTE');
  assert.equal(send().ok,true);
  assert.equal(target.values.filter(row=>row?.[4]==='00123456').length,1);
  assert.equal(sheets.get('REGISTROS WEB').values[1][2],'COMPLETO');
  assert.equal(send(data,'20000000-0000-4000-8000-000000000001').status,409);
});
test('Google bridge: recuperar envío interrumpido y rechazar clave incorrecta',()=>{
  const {send,failNext,sheets}=setup();
  assert.equal(send(data,undefined,'incorrecta').ok,false);
  assert.equal(sheets.has('REGISTROS WEB'),false);
  failNext();
  assert.equal(send().ok,false);
  assert.equal(send().ok,true);
  assert.equal(sheets.get('REGISTROS WEB').values[1][2],'COMPLETO');
});
