// Instalar como script vinculado al Google Sheet indicado.
// Propiedades del script: BACKEND_SECRET (misma clave que .env).
const SHEET_ID = '1sN5DaUygQIv3lwXmCOyZjHo--saJAkkYYlA-DkXW5iQ';
const AUDIT = 'REGISTROS WEB';

function doPost(e) {
  let lock;
  const reply = value => ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('BACKEND_SECRET');
    if (!secret || body.secret !== secret) return reply({ok:false,error:'Acceso no autorizado.'});
    if (!/^[0-9a-f-]{36}$/i.test(body.id || '')) throw new Error('Solicitud inválida.');
    const data = body.data;
    if (!data || !['nuevo','promovido'].includes(data.tipo) || !Array.isArray(data.estudiantes) || !data.estudiantes.length || data.estudiantes.length>50 || !Array.isArray(data.contactos) || !data.contactos.length || data.contactos.length>2) throw new Error('Datos inválidos.');
    const clean = v => /^[=+@-]/.test(String(v || '')) ? "'"+v : String(v || '');
    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    const book = SpreadsheetApp.openById(SHEET_ID);
    let log = book.getSheetByName(AUDIT);
    if (!log) {
      log = book.insertSheet(AUDIT);
      log.appendRow(['ID','FECHA','ESTADO','TIPO','CORREO','DIRECCIÓN','OCUPACIÓN','DATOS COMPLETOS JSON']);
      log.setFrozenRows(1);
    }
    const records = log.getDataRange().getValues();
    const previous = records.findIndex((row,i)=>i>0 && row[0]===body.id);
    const json = JSON.stringify(data);
    if(previous>=0 && records[previous][7]!==json) return reply({ok:false,status:409,error:'El identificador corresponde a otra solicitud.'});
    if(previous>=0 && records[previous][2]==='COMPLETO') return reply({ok:true,id:body.id});
    const planned = [];
    const occupied = {};
    for (const s of data.estudiantes) {
      const digit = String(s.grado).match(/^([1-6])\.º$/);
      if(!digit || !['Primaria','Secundaria'].includes(s.nivel) || (s.nivel==='Secundaria' && +digit[1]>5) || !/^\d{8}$/.test(s.dni)) throw new Error('Estudiante inválido.');
      const tab = digit[1]+'° '+s.nivel.toUpperCase();
      const sheet = book.getSheetByName(tab);
      if (!sheet) throw new Error('No se encontró la pestaña '+tab+'.');
      const last = Math.max(25,sheet.getLastRow());
      const values = sheet.getRange(6,3,last-5,3).getDisplayValues();
      const notes = sheet.getRange(6,3,last-5,1).getNotes();
      const duplicate = values.findIndex(row=>row[2]===s.dni);
      if(duplicate>=0 && notes[duplicate][0]!==body.id) return reply({ok:false,status:409,error:'El DNI '+s.dni+' ya está registrado en '+tab+'. Contacta al colegio para corregirlo.'});
      occupied[tab] = occupied[tab] || new Set();
      let index = duplicate>=0?duplicate:values.findIndex((row,i)=>!row[0]&&!row[2]&&!occupied[tab].has(i));
      if(index<0) throw new Error('No quedan filas libres en '+tab+'. El colegio debe ampliar la plantilla.');
      occupied[tab].add(index);
      planned.push({sheet,row:index+6,s});
    }
    const logRow = previous>=0?previous+1:log.getLastRow()+1;
    if(previous<0) log.getRange(logRow,1,1,8).setValues([[body.id,new Date(),'PENDIENTE',data.tipo,clean(data.correo),clean(data.direccion),clean(data.ocupacion),json]]);
    SpreadsheetApp.flush();
    const mother = data.contactos.find(c=>c.parentesco==='Madre');
    const father = data.contactos.find(c=>c.parentesco==='Padre');
    const others = data.contactos.filter(c=>c.parentesco==='Apoderado/a');
    for (const {sheet,row,s} of planned) {
      // B:L. Nunca modificar las columnas M en adelante (control de pagos).
      const left = mother || others[0];
      const right = father || others[mother?0:1];
      const name = c=>c?(c.parentesco==='Apoderado/a'?'Apoderado/a: ':'')+c.nombre:'';
      // La nota permite recuperar una escritura interrumpida sin duplicar filas.
      sheet.getRange(row,3).setNote(body.id);
      sheet.getRange(row,2,1,11).setNumberFormat('@').setValues([[
        String(row-5),clean(s.nombre),clean(s.grado),s.dni,clean(s.procedencia),clean(name(left)),left?left.celular:'',clean(name(right)),right?right.celular:'',clean(data.direccion),clean(data.correo)
      ]]);
    }
    log.getRange(logRow,3).setValue('COMPLETO');
    SpreadsheetApp.flush();
    return reply({ok:true,id:body.id});
  } catch (error) {
    return reply({ok:false,error:error.message||'No se pudo guardar la matrícula.'});
  } finally {if(lock && lock.hasLock()) lock.releaseLock();}
}
