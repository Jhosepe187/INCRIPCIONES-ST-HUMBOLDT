'use strict';

const $ = selector => document.querySelector(selector);
const quantity = $('#quantity');
const count = $('#count');
const students = $('#students');
const drafts = { nuevo: [], promovido: [] };
const grades = {
  Primaria: ['1.º', '2.º', '3.º', '4.º', '5.º', '6.º'],
  Secundaria: ['1.º', '2.º', '3.º', '4.º', '5.º']
};

function fields(template, prefix) {
  const fragment = $(template).content.cloneNode(true);
  for (const input of fragment.querySelectorAll('[data-key]')) {
    input.name = prefix + '[' + input.dataset.key + ']';
  }
  return fragment.firstElementChild;
}

function createStudent(index) {
  const group = fields('#student-template', 'estudiantes[' + index + ']');
  group.querySelector('legend').textContent = 'Datos del estudiante ' + (index + 1);
  const level = group.querySelector('[data-key=nivel]');
  const grade = group.querySelector('[data-key=grado]');
  level.addEventListener('change', () => {
    const options = grades[level.value] || [];
    grade.replaceChildren(new Option(options.length ? 'Selecciona el grado' : 'Primero elige el nivel', ''));
    options.forEach(value => grade.add(new Option(value, value)));
    grade.disabled = !options.length;
  });
  return group;
}

function showRegistration(route, total) {
  const records = drafts[route];
  while (records.length < total) records.push(createStudent(records.length));
  students.replaceChildren(...records.slice(0, total));
  const isNew = route === 'nuevo';
  $('#payment').textContent = isNew ? 'Alumno nuevo · Inscripción y matrícula' : 'Alumno promovido · Solo matrícula';
  $('#form-title').textContent = isNew ? 'Ficha de inscripción' : 'Ficha de matrícula';
  $('#enrollment').dataset.tipo = route;
  $('#status').textContent = '';
  $('#delivery').hidden = true;
  $('#home').hidden = true;
  $('#registration').hidden = false;
  window.scrollTo(0, 0);
  $('#form-title').focus({ preventScroll: true });
}

function updateStepper() {
  $('#less').disabled = count.valueAsNumber <= 1;
  $('#more').disabled = count.valueAsNumber >= Number(count.max);
}

const quantities = { nuevo: 1, promovido: 1 };
let selectedRoute;

function chooseQuantity(route) {
  selectedRoute = route;
  count.value = quantities[route];
  $('.route').textContent = 'Alumno ' + route;
  $('.dialog-icon use').setAttribute('href', route === 'nuevo' ? '#person' : '#cap');
  updateStepper();
  quantity.showModal();
}

$('#new').onclick = () => chooseQuantity('nuevo');
$('#returning').onclick = () => chooseQuantity('promovido');
$('.close').onclick = () => quantity.close();
count.oninput = updateStepper;
$('#less').onclick = () => { count.stepDown(); updateStepper(); };
$('#more').onclick = () => { count.stepUp(); updateStepper(); };
updateStepper();

$('#quantity-form').onsubmit = event => {
  event.preventDefault();
  quantity.close();
  quantities[selectedRoute] = count.valueAsNumber;
  showRegistration(selectedRoute, count.valueAsNumber);
};
$('#back').onclick = () => {
  const isNew = $('#enrollment').dataset.tipo === 'nuevo';
  $('#registration').hidden = true;
  $('#home').hidden = false;
  $(isNew ? '#new' : '#returning').focus();
  window.scrollTo(0, 0);
};

$('#primary').append(fields('#contact-template', 'contactos[0]'));
$('#secondary').append(fields('#contact-template', 'contactos[1]'));
function toggleContact() {
  const enabled = $('#additional').checked;
  $('#secondary').hidden = !enabled;
  $('#secondary').querySelectorAll('input,select').forEach(field => { field.disabled = !enabled; });
}
$('#additional').onchange = toggleContact;
toggleContact();

// Consultas desde el servidor: el token de ApisPerú nunca llega al navegador.
const dniCache = new Map();
const lookupTasks = new Map();
function showAddress() {
  $('#address-field').hidden=false;
  $('#enrollment').elements.direccion.disabled=false;
  $('#enrollment').elements.direccion.required=true;
}
function setupContact(group, initialRole) {
  const dni=group.querySelector('[data-key=dni]');
  const name=group.querySelector('[data-key=nombre]');
  const output=group.querySelector('.lookup-name');
  const status=group.querySelector('.lookup-status');
  const manual=group.querySelector('.manual-contact');
  const role=group.querySelector('[data-key=parentesco]');
  function setRole(value) {
    role.value=value;
    group.querySelectorAll('[data-role]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.role===value)));
  }
  setRole(initialRole);
  group.querySelectorAll('[data-role]').forEach(button=>button.onclick=()=>{setRole(button.dataset.role);role.dispatchEvent(new Event('input',{bubbles:true}));});
  let timer, sequence=0;
  async function lookup(value, version) {
    status.textContent='Consultando DNI…';
    const task=(async()=>{
      try {
        const person=dniCache.get(value)||await (await request('/api/dni',{dni:value})).json();
        dniCache.set(value,person);
        if(sequence!==version || dni.value!==value)return;
        name.value=person.nombre;
        output.textContent=person.nombre;output.hidden=false;
        manual.hidden=true;manual.open=false;name.required=false;
        status.textContent='Nombres completados con ApisPerú.';
        if(person.direccion && !$('#enrollment').elements.direccion.value)$('#enrollment').elements.direccion.value=person.direccion;
        showAddress();
      }catch(error){
        if(sequence!==version || dni.value!==value)return;
        status.textContent=error.message;
        manual.hidden=false;name.required=true;
        showAddress();
      }
    })();
    lookupTasks.set(group,task);
    await task;
    if(lookupTasks.get(group)===task)lookupTasks.delete(group);
  }
  dni.addEventListener('input',()=>{
    clearTimeout(timer);sequence++;
    name.value='';name.required=false;output.hidden=true;manual.hidden=true;manual.open=false;
    status.textContent='Los nombres se completarán al ingresar los 8 dígitos del DNI.';
    if(/^\d{8}$/.test(dni.value)) {
      const value=dni.value,version=sequence;
      timer=setTimeout(()=>lookup(value,version),450);
    }
  });
  group.lookupNow=()=>{
    clearTimeout(timer);
    if(!name.value && /^\d{8}$/.test(dni.value) && !lookupTasks.has(group))return lookup(dni.value,sequence);
    return lookupTasks.get(group);
  };
}
setupContact($('#primary'),'Madre');
setupContact($('#secondary'),'Padre');
async function ensureFamily() {
  const groups=[$('#primary'),...($('#additional').checked?[$('#secondary')]:[])];
  await Promise.all(groups.map(group=>group.lookupNow()));
  for(const group of groups) {
    if(!group.querySelector('[data-key=nombre]').value.trim()) {
      $('#status').textContent='Consulta el DNI del contacto o completa sus nombres manualmente.';
      group.querySelector('[data-key=dni]').focus();return false;
    }
  }
  showAddress();
  return $('#enrollment').reportValidity();
}

// Integración: datos en memoria; nunca guardar DNI o contactos en localStorage.
let submission = null;
let savedFingerprint = null;
let pdfUrl = null;
let preparedShare = null;
let busy = false;
function readEnrollment() {
  const readGroup = group => Object.fromEntries([...group.querySelectorAll('[data-key]')].map(field => [field.dataset.key, field.value.trim()]));
  return {
    tipo: $('#enrollment').dataset.tipo,
    estudiantes: [...students.children].map(readGroup),
    contactos: [readGroup($('#primary')), ...($('#additional').checked ? [readGroup($('#secondary'))] : [])],
    correo: $('#enrollment').elements.correo.value.trim(),
    direccion: $('#enrollment').elements.direccion.value.trim(),
    ocupacion: $('#enrollment').elements.ocupacion.value.trim()
  };
}
function setBusy(value) {
  busy=value;
  $('#enrollment').setAttribute('aria-busy', String(value));
  $('#enrollment').querySelectorAll('input,select,button').forEach(el => {
    if(value) {el.dataset.wasDisabled=String(el.disabled); el.disabled=true;}
    else {el.disabled=el.dataset.wasDisabled==='true'; delete el.dataset.wasDisabled;}
  });
  $('#back').disabled=value;
}
async function request(path, data, key) {
  let response;
  try {response = await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(data)});}
  catch {throw new Error('No hay conexión con el servidor. Conservamos los datos en el formulario; vuelve a intentar.');}
  if(!response.ok) {
    const result=await response.json().catch(()=>({}));
    throw new Error(result.error || 'No se pudo completar la operación. Inicia el proyecto con npm start.');
  }
  return response;
}
$('#enrollment').addEventListener('input',()=>{
  $('#delivery').hidden=true;
  preparedShare=null;
  $('#status').textContent='';
});
$('#whatsapp').onclick = async () => {
  if(busy || !$('#enrollment').reportValidity() || !await ensureFamily()) return;
  const data=readEnrollment();
  setBusy(true);
  $('#status').textContent='Generando la ficha PDF…';
  try {
    const response=await request('/api/pdf',data);
    const blob=await response.blob();
    if(pdfUrl) URL.revokeObjectURL(pdfUrl);
    pdfUrl=URL.createObjectURL(blob);
    const download=$('#pdf-download');
    download.href=pdfUrl;
    const message=`Hola, deseo ${data.tipo==='nuevo'?'inscribir y matricular':'matricular'} para 2027 a: ${data.estudiantes.map(s=>`${s.nombre} (${s.grado} ${s.nivel})`).join('; ')}. Adjunto la ficha PDF con los datos completos.`;
    const url='https://wa.me/51901648212?text='+encodeURIComponent(message);
    $('#whatsapp-chat').href=url;
    $('#delivery').hidden=false;
    const file=new File([blob],'matricula-2027.pdf',{type:'application/pdf'});
    preparedShare={files:[file],title:'Ficha de matrícula 2027',text:message};
    const canShare=!!(navigator.share && navigator.canShare?.({files:[file]}));
    $('#share-pdf').hidden=!canShare;
    $('#share-help').textContent=canShare?'Pulsa Compartir PDF adjunto, elige WhatsApp y selecciona al colegio: +51 901 648 212. El archivo ya está incluido.':'Este navegador no permite compartir archivos adjuntos. Abre el sitio desde un celular compatible para compartir el PDF ya adjunto. También puedes descargar una copia; abrir el chat por enlace solo prepara el texto.';
    $('#status').textContent=canShare?'Ficha familiar lista. Pulsa Compartir PDF adjunto para enviarla desde el celular.':'Ficha familiar lista. Este navegador permite descargar el PDF; el envío con archivo adjunto requiere un celular compatible.';
  }catch(error){$('#status').textContent=error.message;}
  finally{setBusy(false);}
};
// Un segundo clic conserva la activación del usuario requerida por Web Share.
$('#share-pdf').onclick=async()=>{
  if(!preparedShare)return;
  try{await navigator.share(preparedShare);$('#status').textContent='Se completó la acción de compartir. Comprueba en WhatsApp el destinatario y el envío; la web no recibe confirmación de entrega.';}
  catch(error){$('#status').textContent=error.name==='AbortError'?'Se canceló la acción de compartir. Puedes intentarlo de nuevo.':'No se pudo compartir el archivo desde este dispositivo. Puedes descargar una copia del PDF.';}
};
$('#enrollment').onsubmit = async event => {
  event.preventDefault();
  if(busy || !await ensureFamily()) return;
  const data=readEnrollment();
  const fingerprint=JSON.stringify(data);
  if(savedFingerprint===fingerprint){$('#status').textContent='Esta matrícula ya se registró correctamente.';return;}
  if(!submission || submission.fingerprint!==fingerprint) submission={fingerprint,id:crypto.randomUUID()};
  setBusy(true);
  $('#status').textContent='Guardando matrícula en Google Sheets…';
  try {
    await request('/api/matriculas',data,submission.id);
    savedFingerprint=fingerprint;
    $('#status').textContent=`Matrícula registrada correctamente: ${data.estudiantes.length} estudiante(s). Puedes descargar la ficha y compartirla por WhatsApp.`;
  }catch(error){$('#status').textContent=error.message;}
  finally{setBusy(false);}
};
