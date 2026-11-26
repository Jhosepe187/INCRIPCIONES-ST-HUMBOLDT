<?php
declare(strict_types=1);

// POST api/matriculas.php  (cabecera Idempotency-Key: UUID)
// Valida, prepara el PDF si se pide con Accept: application/pdf, guarda en Google Sheets
// y solo entonces devuelve la ficha. Si Google no confirma, no se entrega el PDF.

namespace Matriculas;

require __DIR__ . '/lib/bootstrap.php';

// Apps Script puede tardar; se da margen por encima de los 55 s de espera a Google.
if (function_exists('set_time_limit')) @set_time_limit(80);

handle(static function (): void {
    $data = validate(read_json());
    $id = $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '';
    if (!is_string($id) || !preg_match('/^[0-9a-f-]{36}$/i', $id)) throw new HttpError(400, 'Falta el identificador de envío.');
    // Preparar el archivo antes de guardar evita un registro incompleto si falla el PDF.
    $pdf = ($_SERVER['HTTP_ACCEPT'] ?? '') === 'application/pdf' ? create_pdf($data) : null;
    save_to_sheets($data, $id);
    if ($pdf !== null) {
        send_pdf($pdf);
        return;
    }
    send_json(200, ['ok' => true, 'id' => $id, 'alumnos' => count($data['estudiantes'])]);
});
