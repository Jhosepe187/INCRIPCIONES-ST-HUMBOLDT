<?php
declare(strict_types=1);

// Registro en el Google Sheet a través del Apps Script de google-apps-script/Code.gs.

namespace Matriculas;

if (count(get_included_files()) === 1) { http_response_code(404); exit; }

const SHEETS_RETRY = 'Google Sheets no confirmó el envío. Puedes reintentar sin duplicar la solicitud.';

/** Guarda la matrícula. El identificador permite reintentar sin duplicar filas. */
function save_to_sheets(array $data, string $id): void
{
    $url = config('google_script_url');
    $secret = config('google_script_secret');
    if ($url === '' || $secret === '') {
        throw new HttpError(503, 'Falta activar la conexión con Google Sheets en el servidor.');
    }
    $payload = json_encode(['secret' => $secret, 'id' => $id, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    try {
        [$status, $body] = http_request('POST', $url, ['Content-Type: application/json'], $payload, 55);
    } catch (NetworkError $error) {
        throw new HttpError(502, SHEETS_RETRY);
    }
    if ($status < 200 || $status >= 300) throw new HttpError(502, SHEETS_RETRY);
    $result = json_decode($body, true);
    if (!is_array($result)) throw new HttpError(502, SHEETS_RETRY);
    if (empty($result['ok'])) {
        $message = is_string($result['error'] ?? null) && $result['error'] !== '' ? $result['error'] : 'Google Sheets no confirmó el registro.';
        throw new HttpError(($result['status'] ?? null) === 409 ? 409 : 502, $message);
    }
}
