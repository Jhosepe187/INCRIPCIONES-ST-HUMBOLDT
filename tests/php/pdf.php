<?php
declare(strict_types=1);

// Utilidad de pruebas (solo línea de comandos): genera la ficha PDF desde JSON en la entrada estándar.
//   php tests/php/pdf.php < datos.json > ficha.pdf
//   php tests/php/pdf.php pension 2 0 9

namespace Matriculas;

if (PHP_SAPI !== 'cli') exit(1);
require __DIR__ . '/../../public/api/lib/bootstrap.php';

if (($argv[1] ?? '') === 'pension') {
    echo pension_for((int) $argv[2], (int) $argv[3], (int) $argv[4]);
    exit;
}
echo create_pdf(validate(json_decode((string) stream_get_contents(STDIN), true)));
