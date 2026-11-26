<?php
declare(strict_types=1);

// Consulta de DNI en ApisPerú. El token viaja solo en la cabecera Authorization, nunca en la URL ni al navegador.

namespace Matriculas;

if (count(get_included_files()) === 1) { http_response_code(404); exit; }

const DNI_UNAVAILABLE = 'La consulta de DNI no está disponible en este momento. Puedes completar los datos manualmente.';

/** Extrae nombres y dirección de la respuesta de ApisPerú. ApisPerú no devuelve dirección: queda vacía. */
function normalize_person(array $payload, string $dni): array
{
    $person = !empty($payload['data']) && is_array($payload['data']) ? $payload['data'] : $payload;
    // Como «a || b» en JavaScript: si el primer nombre de campo viene vacío, se usa el alternativo.
    $pick = static function (string ...$keys) use ($person): string {
        foreach ($keys as $key) {
            if (is_string($person[$key] ?? null) && $person[$key] !== '') return $person[$key];
        }
        return '';
    };
    $parts = array_filter([
        $pick('apellidoPaterno', 'apellido_paterno'),
        $pick('apellidoMaterno', 'apellido_materno'),
        $pick('nombres'),
    ], static fn (string $part): bool => $part !== '');
    $nombre = trim(implode(' ', $parts));
    $wrongDni = isset($person['dni']) && $person['dni'] !== '' && (string) $person['dni'] !== $dni;
    if ($nombre === '' || ($person['success'] ?? null) === false || $wrongDni) {
        throw new HttpError(404, 'No se encontraron nombres para ese DNI. Revisa el número o completa los datos manualmente.');
    }
    return ['dni' => $dni, 'nombre' => $nombre, 'direccion' => is_string($person['direccion'] ?? null) ? trim($person['direccion']) : ''];
}

function lookup_dni(string $dni): array
{
    if (!preg_match('/^\d{8}$/', $dni)) throw new HttpError(400, 'El DNI debe tener 8 dígitos.');
    $token = config('apisperu_token');
    if ($token === '') throw new HttpError(503, 'La consulta de DNI no está configurada. Puedes completar los datos manualmente.');
    try {
        [$status, $body] = http_request('GET', rtrim(config('apisperu_url'), '/') . '/' . $dni, [
            'Authorization: Bearer ' . $token,
            'Accept: application/json',
        ], null, 12);
    } catch (NetworkError $error) {
        throw new HttpError(502, DNI_UNAVAILABLE);
    }
    if ($status < 200 || $status >= 300) {
        throw new HttpError($status === 404 ? 404 : 502, $status === 429
            ? 'Se alcanzó el límite de consultas de DNI. Completa los datos manualmente.'
            : 'ApisPerú no pudo consultar ese DNI. Revisa el número o completa los datos manualmente.');
    }
    $payload = json_decode($body, true);
    if (!is_array($payload)) throw new HttpError(502, DNI_UNAVAILABLE);
    return normalize_person($payload, $dni);
}
