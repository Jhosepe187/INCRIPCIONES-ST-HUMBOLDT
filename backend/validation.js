export function validate(input) {
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  const str = (value, name, max = 160, optional = false) => {
    if (optional && (value == null || value === '')) return '';
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f]/.test(value)) fail(`Revisa ${name}.`);
    return value.trim();
  };
  const digits = (value, name, length) => {
    const result = str(value, name, length);
    if (!new RegExp(`^[0-9]{${length}}$`).test(result)) fail(`Revisa ${name}: debe tener ${length} dígitos.`);
    return result;
  };
  if (!input || !['nuevo', 'promovido'].includes(input.tipo)) fail('Selecciona el tipo de matrícula.');
  if (!Array.isArray(input.estudiantes) || input.estudiantes.length < 1 || input.estudiantes.length > 50) fail('Ingresa entre 1 y 50 estudiantes.');
  if (!Array.isArray(input.contactos) || input.contactos.length !== 2) fail('Ingresa los datos de la madre y del padre.');
  const estudiantes = input.estudiantes.map(s => {
    const nivel = str(s.nivel, 'el nivel');
    const grado = str(s.grado, 'el grado');
    const max = nivel === 'Primaria' ? 6 : nivel === 'Secundaria' ? 5 : 0;
    if (!Array.from({length:max}, (_, i) => `${i + 1}.º`).includes(grado)) fail('El grado no corresponde al nivel.');
    return { nombre:str(s.nombre, 'el nombre del estudiante', 140), dni:digits(s.dni, 'el DNI del estudiante', 8), nivel, grado, procedencia:str(s.procedencia, 'el colegio de procedencia', 160, true) };
  });
  if (new Set(estudiantes.map(s => s.dni)).size !== estudiantes.length) fail('Hay estudiantes con el mismo DNI en este formulario.');
  const contactos = input.contactos.map(c => {
    if (!['Madre', 'Padre'].includes(c?.parentesco)) fail('Ingresa los datos de la madre y del padre.');
    return {parentesco:c.parentesco, nombre:str(c.nombre, 'el nombre del contacto', 140), dni:digits(c.dni, 'el DNI del contacto', 8), celular:digits(c.celular, 'el celular', 9)};
  });
  const correo = str(input.correo, 'el correo', 200);
  // La madre y el padre son obligatorios: uno de cada uno y con DNI distintos.
  if (contactos[0].parentesco === contactos[1].parentesco) fail('Ingresa los datos de la madre y del padre.');
  if (contactos[0].dni === contactos[1].dni) fail('La madre y el padre no pueden tener el mismo DNI.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) fail('Ingresa un correo válido.');
  return {tipo:input.tipo, estudiantes, contactos, correo, direccion:str(input.direccion, 'la dirección', 200), ocupacion:str(input.ocupacion, 'la ocupación', 160, true)};
}
