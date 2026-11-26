<?php
declare(strict_types=1);

// Validación de la solicitud de matrícula. Mismas reglas y mensajes que la versión Node.

namespace Matriculas;

if (count(get_included_files()) === 1) { http_response_code(404); exit; }

const GRADE_LIMITS = ['Primaria' => 6, 'Secundaria' => 5];
const RELATIONSHIPS = ['Madre', 'Padre', 'Apoderado/a'];

function validation_error(string $message): HttpError
{
    return new HttpError(400, $message);
}

/** Quita espacios al inicio y al final, incluidos los espacios Unicode (como trim() de JavaScript). */
function trim_text(string $value): string
{
    return preg_replace('/(*UCP)^\s+|\s+$/u', '', $value) ?? trim($value);
}

function text_length(string $value): int
{
    return (int) preg_match_all('/./su', $value);
}

function is_list_array($value): bool
{
    return is_array($value) && ($value === [] || array_keys($value) === range(0, count($value) - 1));
}

function clean_text($value, string $name, int $max = 160, bool $optional = false): string
{
    if ($optional && ($value === null || $value === '')) return '';
    if (!is_string($value)) throw validation_error("Revisa {$name}.");
    $trimmed = trim_text($value);
    if ($trimmed === '' || text_length($trimmed) > $max || preg_match('/[\x00-\x1f]/', $value)) {
        throw validation_error("Revisa {$name}.");
    }
    return $trimmed;
}

function clean_digits($value, string $name, int $length): string
{
    $result = clean_text($value, $name, $length);
    if (!preg_match('/^[0-9]{' . $length . '}$/', $result)) {
        throw validation_error("Revisa {$name}: debe tener {$length} dígitos.");
    }
    return $result;
}

/** Devuelve la solicitud limpia o lanza HttpError 400 con el motivo. */
function validate($input): array
{
    if (!is_array($input) || !in_array($input['tipo'] ?? null, ['nuevo', 'promovido'], true)) {
        throw validation_error('Selecciona el tipo de matrícula.');
    }
    $students = $input['estudiantes'] ?? null;
    if (!is_list_array($students) || count($students) < 1 || count($students) > 50) {
        throw validation_error('Ingresa entre 1 y 50 estudiantes.');
    }
    $contacts = $input['contactos'] ?? null;
    if (!is_list_array($contacts) || count($contacts) < 1 || count($contacts) > 2) {
        throw validation_error('Ingresa uno o dos contactos.');
    }

    $estudiantes = [];
    foreach ($students as $student) {
        $student = is_array($student) ? $student : [];
        $nivel = clean_text($student['nivel'] ?? null, 'el nivel');
        $grado = clean_text($student['grado'] ?? null, 'el grado');
        $max = GRADE_LIMITS[$nivel] ?? 0;
        $grades = $max > 0 ? array_map(static fn (int $n): string => $n . '.º', range(1, $max)) : [];
        if (!in_array($grado, $grades, true)) throw validation_error('El grado no corresponde al nivel.');
        $estudiantes[] = [
            'nombre' => clean_text($student['nombre'] ?? null, 'el nombre del estudiante', 140),
            'dni' => clean_digits($student['dni'] ?? null, 'el DNI del estudiante', 8),
            'nivel' => $nivel,
            'grado' => $grado,
            'procedencia' => clean_text($student['procedencia'] ?? null, 'el colegio de procedencia', 160, true),
        ];
    }
    if (count(array_unique(array_column($estudiantes, 'dni'))) !== count($estudiantes)) {
        throw validation_error('Hay estudiantes con el mismo DNI en este formulario.');
    }

    $contactos = [];
    foreach ($contacts as $contact) {
        $contact = is_array($contact) ? $contact : [];
        if (!in_array($contact['parentesco'] ?? null, RELATIONSHIPS, true)) {
            throw validation_error('Selecciona el parentesco del contacto.');
        }
        $contactos[] = [
            'parentesco' => $contact['parentesco'],
            'nombre' => clean_text($contact['nombre'] ?? null, 'el nombre del contacto', 140),
            'dni' => clean_digits($contact['dni'] ?? null, 'el DNI del contacto', 8),
            'celular' => clean_digits($contact['celular'] ?? null, 'el celular', 9),
        ];
    }

    $correo = clean_text($input['correo'] ?? null, 'el correo', 200);
    if (count($contactos) === 2 && $contactos[0]['parentesco'] === $contactos[1]['parentesco'] && $contactos[0]['parentesco'] !== 'Apoderado/a') {
        throw validation_error('Selecciona un parentesco diferente para el segundo contacto.');
    }
    if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/u', $correo)) throw validation_error('Ingresa un correo válido.');

    return [
        'tipo' => $input['tipo'],
        'estudiantes' => $estudiantes,
        'contactos' => $contactos,
        'correo' => $correo,
        'direccion' => clean_text($input['direccion'] ?? null, 'la dirección', 200),
        'ocupacion' => clean_text($input['ocupacion'] ?? null, 'la ocupación', 160, true),
    ];
}
