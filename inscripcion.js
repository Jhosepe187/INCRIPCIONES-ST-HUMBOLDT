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
  resetDelivery();
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
        manual.hidden=false;manual.open=true;name.required=true;
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
      const manual = group.querySelector('.manual-contact');
      if (!manual.hidden) {
        manual.open = true;
        group.querySelector('[data-key=nombre]').focus();
      } else {
        group.querySelector('[data-key=dni]').focus();
      }
      return false;
    }
  }
  showAddress();
  return validateForm();
}

function validateForm() {
  const form = $('#enrollment');
  if (form.reportValidity()) return true;
  const field = form.querySelector('input:invalid, select:invalid');
  const label = field?.labels?.[0]?.firstChild?.textContent.trim();
  $('#status').textContent = label
    ? `Revisa el campo «${label}». ${field.validationMessage}`
    : 'Revisa los campos obligatorios del formulario.';
  return false;
}

// Integración: datos en memoria; nunca guardar DNI o contactos en localStorage.
let submission = null;
let pdfUrl = null;
let preparedShare = null;
let busy = false;
const localWhatsApp = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
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
  $('#enrollment').setAttribute('aria-busy', String(value));
  $('#enrollment').querySelectorAll('input,select,button').forEach(el => {
    if(value) {el.dataset.wasDisabled=String(el.disabled); el.disabled=true;}
    else {el.disabled=el.dataset.wasDisabled==='true'; delete el.dataset.wasDisabled;}
  });
  $('#back').disabled=value;
}
async function request(path, data, headers = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...headers},
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(path === '/api/dni' ? 18000 : 65000)
    });
  } catch (error) {
    const message = error.name === 'TimeoutError'
      ? 'El servidor tardó demasiado en responder. Puedes volver a intentar con los datos del formulario.'
      : 'No se pudo contactar al servidor de matrículas. Abre el formulario desde http://localhost:3000/ con el servidor iniciado y vuelve a intentar.';
    throw new Error(message);
  }
  if(!response.ok) {
    const result=await response.json().catch(()=>({}));
    throw new Error(result.error || 'No se pudo completar la operación. Inicia el proyecto con npm start.');
  }
  return response;
}
function resetDelivery() {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = null;
  preparedShare = null;
  $('#delivery').hidden = true;
  $('#submit-label').textContent = 'Enviar matrícula';
  $('#status').textContent = '';
}
$('#enrollment').addEventListener('input', resetDelivery);
$('#enrollment').addEventListener('change', resetDelivery);

function prepareDelivery(pdf) {
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = URL.createObjectURL(pdf);
  $('#pdf-download').href = pdfUrl;
  const message = 'Hola, adjunto la ficha de matrícula 2027 con los datos completos.';
  $('#whatsapp-chat').href = 'https://wa.me/51901648212?text=' + encodeURIComponent(message);
  $('#delivery').hidden = false;
  if (localWhatsApp) {
    preparedShare = {pdf};
    $('#submit-label').textContent = 'Compartir PDF';
    $('#status').textContent = 'Matrícula guardada. Pulsa Compartir PDF para dejar la ficha adjunta en el chat del colegio.';
    return;
  }
  const files = [new File([pdf], 'matricula-2027.pdf', {type: 'application/pdf'})];
  if (navigator.share && navigator.canShare?.({files})) {
    preparedShare = {files, title: 'Ficha de matrícula 2027', text: message};
    $('#submit-label').textContent = 'Compartir PDF';
    $('#status').textContent = 'Matrícula guardada. Pulsa Compartir PDF y elige WhatsApp y el chat del colegio (+51 901 648 212).';
    return;
  }
  $('#status').textContent = 'Matrícula guardada. Descarga la ficha y adjúntala en el chat del colegio.';
}

async function sharePdf() {
  if (!localWhatsApp) {
    try {
      await navigator.share(preparedShare);
      $('#status').textContent = 'Matrícula guardada. Confirma el envío de la ficha en WhatsApp.';
    } catch (error) {
      $('#status').textContent = error.name === 'AbortError'
        ? 'Matrícula guardada. Puedes volver a pulsar Compartir PDF.'
        : 'Matrícula guardada. Descarga la ficha y adjúntala en el chat del colegio.';
    }
    return;
  }
  $('#status').textContent = 'Abriendo el chat del colegio y preparando el adjunto…';
  try {
    const response = await fetch('/api/whatsapp/adjuntar', {
      method: 'POST',
      headers: {'Content-Type': 'application/pdf'},
      body: preparedShare.pdf,
      signal: AbortSignal.timeout(80000)
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Revisa la ventana de WhatsApp Web.');
    $('#status').textContent = 'PDF adjunto en el chat del colegio. Pulsa Enviar en WhatsApp.';
  } catch (error) {
    const message = ['TimeoutError', 'SyntaxError', 'TypeError'].includes(error.name)
      ? 'No se pudo confirmar el adjunto. Revisa WhatsApp Web y vuelve a pulsar Compartir PDF si la ficha no aparece.'
      : error.message;
    $('#status').textContent = `Matrícula guardada. ${message}`;
  }
}

$('#enrollment').onsubmit = async event => {
  event.preventDefault();
  if (busy) return;
  $('#status').textContent = '';
  if (!preparedShare && !validateForm()) return;
  busy = true;
  let controlsLocked = false;
  try {
    if (!preparedShare) {
      $('#status').textContent = 'Verificando los datos de contacto…';
      $('#back').disabled = true;
      if (!await ensureFamily()) return;
    }
    setBusy(true);
    controlsLocked = true;
    if (preparedShare) {
      await sharePdf();
    } else {
      const data = readEnrollment();
      const fingerprint = JSON.stringify(data);
      if (submission?.fingerprint !== fingerprint) submission = {fingerprint, id: crypto.randomUUID()};
      if (!submission.pdf) {
        $('#status').textContent = 'Guardando matrícula y preparando el PDF…';
        const response = await request('/api/matriculas', data, {
          Accept: 'application/pdf',
          'Idempotency-Key': submission.id
        });
        if (!response.headers.get('Content-Type')?.startsWith('application/pdf')) {
          throw new Error('No se recibió la ficha PDF. Vuelve a pulsar Enviar matrícula.');
        }
        submission.pdf = await response.blob();
      }
      prepareDelivery(submission.pdf);
    }
  } catch (error) {
    $('#status').textContent = error.message;
  } finally {
    if (controlsLocked) setBusy(false);
    else $('#back').disabled = false;
    busy = false;
  }
};
