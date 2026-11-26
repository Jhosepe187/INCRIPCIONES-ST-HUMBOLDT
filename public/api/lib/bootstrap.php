<?php
declare(strict_types=1);

// Base común de los endpoints: configuración, respuestas JSON y controles de seguridad.
// Compatible con PHP 8.0 o superior. No usa extensiones fuera de las habituales en WordPress.

namespace Matriculas;

if (count(get_included_files()) === 1) { http_response_code(404); exit; }

require __DIR__ . '/validacion.php';
require __DIR__ . '/dni.php';
require __DIR__ . '/sheets.php';
require __DIR__ . '/pdf.php';

/** Error con código HTTP y mensaje que se puede mostrar al usuario. */
final class HttpError extends \RuntimeException
{
    public int $status;

    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

/** Fallo de red al hablar con un servicio externo (Google, ApisPerú). */
final class NetworkError extends \RuntimeException
{
}

const DEFAULTS = [
    'google_script_url' => '',
    'google_script_secret' => '',
    'apisperu_token' => '',
    'apisperu_url' => 'https://dniruc.apisperu.com/api/v1/dni/',
];

const ENV_NAMES = [
    'google_script_url' => 'GOOGLE_SCRIPT_URL',
    'google_script_secret' => 'GOOGLE_SCRIPT_SECRET',
    'apisperu_token' => 'APISPERU_TOKEN',
    'apisperu_url' => 'APISPERU_URL',
];

/**
 * Lee la configuración de api/config.php (o de la ruta en MATRICULAS_CONFIG).
 * Las variables de entorno, si existen, tienen prioridad.
 */
function config(string $key): string
{
    static $values = null;
    if ($values === null) {
        $values = DEFAULTS;
        $path = getenv('MATRICULAS_CONFIG') ?: dirname(__DIR__) . '/config.php';
        if (is_file($path)) {
            $file = require $path;
            if (is_array($file)) {
                foreach (DEFAULTS as $name => $_) {
                    if (isset($file[$name]) && is_string($file[$name])) $values[$name] = trim($file[$name]);
                }
            }
        }
        foreach (ENV_NAMES as $name => $env) {
            $value = getenv($env);
            if (is_string($value) && $value !== '') $values[$name] = trim($value);
        }
    }
    return $values[$key] ?? '';
}

/** Ejecuta un endpoint POST con las mismas protecciones para todos. */
function handle(callable $action): void
{
    header_remove('X-Powered-By');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    try {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            header('Allow: POST');
            throw new HttpError(405, 'Método no permitido.');
        }
        check_origin();
        rate_limit('api', 30);
        $action();
    } catch (HttpError $error) {
        send_json($error->status, ['error' => $error->getMessage()]);
    } catch (\Throwable $error) {
        // Nunca se registran cuerpos de solicitud ni claves: solo el tipo y el mensaje técnico.
        error_log('[matriculas] ' . get_class($error) . ': ' . $error->getMessage());
        send_json(500, ['error' => 'No se pudo completar la operación. Intenta nuevamente.']);
    }
}

/** Rechaza solicitudes enviadas desde otra web. Se compara solo el host, porque el hosting puede terminar HTTPS en un proxy. */
function check_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') return;
    $parts = parse_url($origin);
    $originHost = strtolower(($parts['host'] ?? '') . (isset($parts['port']) ? ':' . $parts['port'] : ''));
    $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
    if ($originHost === '' || $originHost !== $host) throw new HttpError(403, 'Origen no permitido.');
}

/**
 * Límite simple por IP y ventana de 60 s, guardado en archivos temporales.
 * Guarda un hash de la IP, no la IP. Si el hosting no permite escribir, no bloquea el servicio.
 */
function rate_limit(string $bucket, int $limit, int $window = 60): void
{
    $dir = getenv('MATRICULAS_RATE_DIR') ?: sys_get_temp_dir() . '/matriculas-limites';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) return;
    $handle = @fopen($dir . '/' . hash('sha256', $bucket . '|' . ($_SERVER['REMOTE_ADDR'] ?? '')), 'c+');
    if ($handle === false) return;
    try {
        flock($handle, LOCK_EX);
        $now = time();
        $hits = array_values(array_filter(
            array_map('intval', explode(',', (string) stream_get_contents($handle))),
            static fn (int $time): bool => $time > $now - $window
        ));
        if (count($hits) >= $limit) {
            header('Retry-After: ' . max(1, $hits[0] + $window - $now));
            throw new HttpError(429, 'Hiciste demasiadas solicitudes seguidas. Espera un minuto y vuelve a intentar.');
        }
        $hits[] = $now;
        ftruncate($handle, 0);
        rewind($handle);
        fwrite($handle, implode(',', $hits));
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

/** Lee el cuerpo JSON (máximo 128 KB). */
function read_json(): array
{
    $max = 131072;
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $max) throw new HttpError(413, 'La solicitud es demasiado grande.');
    $raw = (string) file_get_contents('php://input', false, null, 0, $max + 1);
    if (strlen($raw) > $max) throw new HttpError(413, 'La solicitud es demasiado grande.');
    $data = json_decode($raw, true);
    if (!is_array($data)) throw new HttpError(400, 'La solicitud no tiene un formato válido.');
    return $data;
}

function send_json(int $status, array $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function send_pdf(string $pdf): void
{
    http_response_code(200);
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="matricula-2027.pdf"');
    header('Content-Length: ' . strlen($pdf));
    echo $pdf;
}

/**
 * Petición HTTP saliente. Usa cURL (presente en casi todo hosting de WordPress)
 * y, si falta, los streams de PHP. Sigue redirecciones: Apps Script responde a
 * los POST con un 302 y el resultado se pide con GET, como hacen los navegadores.
 *
 * @return array{0:int,1:string} código HTTP y cuerpo
 */
function http_request(string $method, string $url, array $headers, ?string $body, int $timeout): array
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => $timeout,
        ]);
        if ($method === 'POST') {
            curl_setopt($curl, CURLOPT_POST, true);
            curl_setopt($curl, CURLOPT_POSTFIELDS, $body ?? '');
        }
        $response = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        if ($response === false) throw new NetworkError($error !== '' ? $error : 'Sin respuesta');
        return [$status, (string) $response];
    }
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => implode("\r\n", $headers),
        'content' => $body ?? '',
        'timeout' => $timeout,
        'ignore_errors' => true,
        'follow_location' => 1,
        'max_redirects' => 5,
    ]]);
    $response = @file_get_contents($url, false, $context);
    $lines = $http_response_header ?? [];
    if ($response === false || $lines === []) throw new NetworkError('Sin respuesta');
    $status = 0;
    foreach ($lines as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $match)) $status = (int) $match[1];
    }
    return [$status, $response];
}
