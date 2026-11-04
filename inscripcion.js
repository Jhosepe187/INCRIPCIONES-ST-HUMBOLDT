'use strict';

const $ = selector => document.querySelector(selector);
const quantity = $('#quantity');
const count = $('#count');
const students = $('#students');
const drafts = { nuevo: [], promovido: [] };
const grades = {
  Inicial: ['3 años', '4 años', '5 años'],
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
  $('#home').hidden = true;
  $('#registration').hidden = false;
  window.scrollTo(0, 0);
  $('#form-title').focus({ preventScroll: true });
}

function updateStepper() {
  $('#less').disabled = count.valueAsNumber <= 1;
  $('#more').disabled = count.valueAsNumber >= Number(count.max);
}

$('#new').onclick = () => quantity.showModal();
$('.close').onclick = () => quantity.close();
count.oninput = updateStepper;
$('#less').onclick = () => { count.stepDown(); updateStepper(); };
$('#more').onclick = () => { count.stepUp(); updateStepper(); };
updateStepper();

$('#quantity-form').onsubmit = event => {
  event.preventDefault();
  quantity.close();
  showRegistration('nuevo', count.valueAsNumber);
};
$('#returning').onclick = () => showRegistration('promovido', 1);
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

// Puntos de conexión para el equipo de integraciones.
$('#whatsapp').onclick = () => {
  $('#status').textContent = 'WhatsApp estará disponible cuando el colegio habilite el contacto.';
};
$('#enrollment').onsubmit = event => {
  event.preventDefault();
  $('#status').textContent = 'Formulario revisado. El envío a Google Sheets aún no está habilitado. Los datos siguen en esta página.';
};
