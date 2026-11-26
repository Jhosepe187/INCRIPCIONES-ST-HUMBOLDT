<?php
declare(strict_types=1);

// POST api/dni.php  {"dni":"12345678"}  →  {"dni","nombre","direccion"}

namespace Matriculas;

require __DIR__ . '/lib/bootstrap.php';

handle(static function (): void {
    rate_limit('dni', 10);
    $body = read_json();
    $dni = is_string($body['dni'] ?? null) ? $body['dni'] : '';
    if (!preg_match('/^\d{8}$/', $dni)) throw new HttpError(400, 'El DNI debe tener 8 dígitos.');
    send_json(200, lookup_dni($dni));
});
