<?php
declare(strict_types=1);

// Ficha familiar de matrícula en PDF, sin bibliotecas externas.
// Reproduce la maquetación de la versión Node (pdfkit): mismas coordenadas, métricas de
// Helvetica, saltos de línea y reducción automática del tamaño de letra.

namespace Matriculas;

if (count(get_included_files()) === 1) { http_response_code(404); exit; }

const GREEN = '#00a651';
const BLUE = '#353292';
const MONTHS = ['MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Pensión mensual según cantidad de hermanos, posición del alumno y mes (0 = marzo). */
function pension_for(int $total, int $index, int $month): string
{
    if ($index > 2) return 'Consultar';
    if ($total === 2 && $index === 0 && $month === 9) return 'S/ 480.00';
    return ['S/ 500.00', 'S/ 470.00', 'S/ 450.00'][$index];
}

/** Escritor PDF mínimo con la misma API y semántica que usa la ficha en pdfkit. */
final class PdfDocument
{
    private const WIDTH = 595.28;   // A4 en puntos
    private const HEIGHT = 841.89;
    private const ASCENDER = 718;   // Helvetica y Helvetica-Bold
    private const LINE_HEIGHT = ['F1' => 1.156, 'F2' => 1.190]; // (bbox alto) / 1000, como pdfkit
    private const KAPPA = 0.5522847498307936;

    private static ?array $fonts = null;
    private const CP1252 = [
        0x20AC => 0x80, 0x201A => 0x82, 0x0192 => 0x83, 0x201E => 0x84, 0x2026 => 0x85, 0x2020 => 0x86,
        0x2021 => 0x87, 0x02C6 => 0x88, 0x2030 => 0x89, 0x0160 => 0x8A, 0x2039 => 0x8B, 0x0152 => 0x8C,
        0x017D => 0x8E, 0x2018 => 0x91, 0x2019 => 0x92, 0x201C => 0x93, 0x201D => 0x94, 0x2022 => 0x95,
        0x2013 => 0x96, 0x2014 => 0x97, 0x02DC => 0x98, 0x2122 => 0x99, 0x0161 => 0x9A, 0x203A => 0x9B,
        0x0153 => 0x9C, 0x017E => 0x9E, 0x0178 => 0x9F,
    ];

    /** @var string[] */
    private array $pages = [];
    private string $content = '';
    private string $path = '';
    private string $font = 'F1';
    private float $size = 12;
    private bool $usesImage = false;
    private string $title;

    public function __construct(string $title)
    {
        $this->title = $title;
        if (self::$fonts === null) self::$fonts = require __DIR__ . '/fuentes.php';
    }

    public function addPage(): self
    {
        $this->flushPage();
        return $this;
    }

    // ---------- Estado gráfico ----------

    public function lineWidth(float $width): self
    {
        return $this->op(self::num($width) . ' w');
    }

    public function fillColor(string $hex): self
    {
        return $this->op(self::rgb($hex) . ' rg');
    }

    public function strokeColor(string $hex): self
    {
        return $this->op(self::rgb($hex) . ' RG');
    }

    public function font(bool $bold): self
    {
        $this->font = $bold ? 'F2' : 'F1';
        return $this;
    }

    public function fontSize(float $size): self
    {
        $this->size = $size;
        return $this;
    }

    // ---------- Trazados ----------

    public function moveTo(float $x, float $y): self
    {
        $this->path .= self::num($x) . ' ' . self::num(self::HEIGHT - $y) . " m\n";
        return $this;
    }

    public function lineTo(float $x, float $y): self
    {
        $this->path .= self::num($x) . ' ' . self::num(self::HEIGHT - $y) . " l\n";
        return $this;
    }

    private function curveTo(float $x1, float $y1, float $x2, float $y2, float $x, float $y): void
    {
        $this->path .= implode(' ', array_map([self::class, 'num'], [$x1, self::HEIGHT - $y1, $x2, self::HEIGHT - $y2, $x, self::HEIGHT - $y])) . " c\n";
    }

    public function rect(float $x, float $y, float $w, float $h): self
    {
        $this->path .= self::num($x) . ' ' . self::num(self::HEIGHT - $y - $h) . ' ' . self::num($w) . ' ' . self::num($h) . " re\n";
        return $this;
    }

    public function roundedRect(float $x, float $y, float $w, float $h, float $r): self
    {
        $r = min($r, 0.5 * $w, 0.5 * $h);
        $c = $r * (1.0 - self::KAPPA);
        $this->moveTo($x + $r, $y);
        $this->lineTo($x + $w - $r, $y);
        $this->curveTo($x + $w - $c, $y, $x + $w, $y + $c, $x + $w, $y + $r);
        $this->lineTo($x + $w, $y + $h - $r);
        $this->curveTo($x + $w, $y + $h - $c, $x + $w - $c, $y + $h, $x + $w - $r, $y + $h);
        $this->lineTo($x + $r, $y + $h);
        $this->curveTo($x + $c, $y + $h, $x, $y + $h - $c, $x, $y + $h - $r);
        $this->lineTo($x, $y + $r);
        $this->curveTo($x, $y + $c, $x + $c, $y, $x + $r, $y);
        $this->path .= "h\n";
        return $this;
    }

    public function fill(?string $color = null): self
    {
        if ($color !== null) $this->fillColor($color);
        return $this->paint('f');
    }

    public function stroke(): self
    {
        return $this->paint('S');
    }

    public function fillAndStroke(string $fill, string $stroke): self
    {
        return $this->fillColor($fill)->strokeColor($stroke)->paint('B');
    }

    // ---------- Texto ----------

    public function widthOfString(string $encoded): float
    {
        $metrics = self::$fonts[$this->font];
        $width = 0;
        $length = strlen($encoded);
        for ($i = 0; $i < $length; $i++) {
            $code = ord($encoded[$i]);
            $width += $metrics['w'][$code];
            if ($i + 1 < $length) $width += $metrics['k'][$code * 256 + ord($encoded[$i + 1])] ?? 0;
        }
        return $width * $this->size / 1000;
    }

    public function lineHeight(): float
    {
        return self::LINE_HEIGHT[$this->font] * $this->size;
    }

    public function heightOfString(string $text, float $width): float
    {
        return count($this->wrap(self::encode($text), $width)) * $this->lineHeight();
    }

    /** Escribe el texto en líneas dentro de $width; las líneas que no caben en $height no se dibujan. */
    public function text(string $text, float $x, float $y, float $width, float $height): self
    {
        $lines = $this->wrap(self::encode($text), $width);
        $lineHeight = $this->lineHeight();
        $visible = max(1, (int) floor($height / $lineHeight + 1e-9));
        foreach (array_slice($lines, 0, $visible) as $index => $line) {
            if ($line === '') continue;
            $baseline = self::HEIGHT - ($y + $index * $lineHeight + self::ASCENDER / 1000 * $this->size);
            $this->content .= "BT\n/{$this->font} " . self::num($this->size) . " Tf\n"
                . self::num($x) . ' ' . self::num($baseline) . " Td\n" . $this->showText($line) . " TJ\nET\n";
        }
        return $this;
    }

    // ---------- Imagen ----------

    /** Escudo del colegio (331×405 px con transparencia), ajustado dentro de la caja como fit:[w,h] de pdfkit. */
    public function crest(float $x, float $y, float $boxWidth, float $boxHeight): self
    {
        $imageRatio = 331 / 405;
        if ($imageRatio > $boxWidth / $boxHeight) {
            $w = $boxWidth;
            $h = $boxWidth / $imageRatio;
        } else {
            $h = $boxHeight;
            $w = $boxHeight * $imageRatio;
        }
        $this->usesImage = true;
        $this->content .= "q\n" . self::num($w) . ' 0 0 ' . self::num($h) . ' ' . self::num($x) . ' ' . self::num(self::HEIGHT - $y - $h) . " cm\n/I1 Do\nQ\n";
        return $this;
    }

    // ---------- Salida ----------

    public function output(): string
    {
        $this->flushPage();
        $objects = [];
        $add = static function (string $body) use (&$objects): int {
            $objects[] = $body;
            return count($objects);
        };
        $catalog = $add('');
        $pagesId = $add('');
        $helvetica = $add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        $helveticaBold = $add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
        $xobjects = '';
        if ($this->usesImage) {
            $alpha = (string) file_get_contents(__DIR__ . '/escudo.alpha.z');
            $rgb = (string) file_get_contents(__DIR__ . '/escudo.rgb.z');
            $mask = $add("<< /Type /XObject /Subtype /Image /Width 331 /Height 405 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length " . strlen($alpha) . " >>\nstream\n{$alpha}\nendstream");
            $image = $add("<< /Type /XObject /Subtype /Image /Width 331 /Height 405 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /SMask {$mask} 0 R /Length " . strlen($rgb) . " >>\nstream\n{$rgb}\nendstream");
            $xobjects = " /XObject << /I1 {$image} 0 R >>";
        }
        $resources = "<< /Font << /F1 {$helvetica} 0 R /F2 {$helveticaBold} 0 R >>{$xobjects} >>";
        $kids = [];
        foreach ($this->pages as $page) {
            $filter = '';
            if (function_exists('gzcompress')) {
                $page = gzcompress($page, 6);
                $filter = ' /Filter /FlateDecode';
            }
            $contents = $add("<<{$filter} /Length " . strlen($page) . " >>\nstream\n{$page}\nendstream");
            $kids[] = $add("<< /Type /Page /Parent {$pagesId} 0 R /MediaBox [0 0 " . self::num(self::WIDTH) . ' ' . self::num(self::HEIGHT) . "] /Resources {$resources} /Contents {$contents} 0 R >>");
        }
        $objects[$pagesId - 1] = '<< /Type /Pages /Kids [' . implode(' ', array_map(static fn (int $id): string => "{$id} 0 R", $kids)) . '] /Count ' . count($kids) . ' >>';
        $objects[$catalog - 1] = "<< /Type /Catalog /Pages {$pagesId} 0 R >>";
        $info = $add('<< /Title ' . self::textString($this->title) . ' /Producer (Matriculas Humboldt) /CreationDate (D:' . gmdate('YmdHis') . "Z) >>");

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objects as $index => $body) {
            $offsets[] = strlen($pdf);
            $pdf .= ($index + 1) . " 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        foreach ($offsets as $offset) $pdf .= sprintf("%010d 00000 n \n", $offset);
        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root {$catalog} 0 R /Info {$info} 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
        return $pdf;
    }

    // ---------- Internos ----------

    /** Las operaciones de estado se escriben antes de un trazado pendiente, para que el PDF sea válido. */
    private function op(string $operator): self
    {
        $this->content .= $operator . "\n";
        return $this;
    }

    private function paint(string $operator): self
    {
        $this->content .= $this->path . $operator . "\n";
        $this->path = '';
        return $this;
    }

    private function flushPage(): void
    {
        if ($this->content !== '' || $this->path !== '') {
            $this->pages[] = $this->content . $this->path;
        }
        $this->content = '';
        $this->path = '';
    }

    /**
     * Partición en líneas equivalente a LineWrapper de pdfkit para este contenido:
     * las palabras incluyen sus espacios finales, se puede cortar tras un guion y
     * una palabra más ancha que la línea se divide por caracteres.
     *
     * @return string[] líneas (en cp1252)
     */
    private function wrap(string $text, float $lineWidth): array
    {
        $lines = [];
        $buffer = '';
        $spaceLeft = $lineWidth;
        $previousRequired = true;
        $place = function (string $word, float $w, bool $required) use (&$lines, &$buffer, &$spaceLeft, &$previousRequired, $lineWidth): void {
            if ($previousRequired) $spaceLeft = $lineWidth;
            $fits = $w <= $spaceLeft;
            if ($fits) $buffer .= $word;
            if ($required || !$fits) {
                if ($required && $w > $spaceLeft) {
                    $lines[] = $buffer;
                    $buffer = $word;
                }
                $lines[] = $buffer;
                if ($required) {
                    $spaceLeft = $lineWidth;
                    $buffer = '';
                } else {
                    $spaceLeft = $lineWidth - $w;
                    $buffer = $word;
                }
            } else {
                $spaceLeft -= $w;
            }
            $previousRequired = $required;
        };
        foreach (self::words($text) as $word) {
            $w = $this->widthOfString($word);
            if ($w <= $lineWidth) {
                $place($word, $w, false);
                continue;
            }
            // Palabra más ancha que la línea: se corta en trozos que quepan.
            while ($word !== '') {
                $length = strlen($word);
                $mightGrow = false;
                if ($w > $spaceLeft) {
                    $l = (int) ceil($spaceLeft / ($w / $length));
                    $w = $this->widthOfString(substr($word, 0, $l));
                    $mightGrow = $w <= $spaceLeft && $l < $length;
                } else {
                    $l = $length;
                }
                $mustShrink = $w > $spaceLeft && $l > 0;
                while ($mustShrink || $mightGrow) {
                    if ($mustShrink) {
                        $w = $this->widthOfString(substr($word, 0, --$l));
                        $mustShrink = $w > $spaceLeft && $l > 0;
                    } else {
                        $w = $this->widthOfString(substr($word, 0, ++$l));
                        $mustShrink = $w > $spaceLeft && $l > 0;
                        $mightGrow = $w <= $spaceLeft && $l < $length;
                    }
                }
                if ($l === 0 && $spaceLeft === $lineWidth) $l = 1;
                $place(substr($word, 0, $l), $w, $l < $length);
                $word = (string) substr($word, $l);
                $w = $this->widthOfString($word);
            }
        }
        if ($buffer !== '') $lines[] = $buffer;
        return $lines;
    }

    /** Divide en palabras con sus espacios finales; también corta después de un guion seguido de texto. */
    private static function words(string $text): array
    {
        preg_match_all('/[^ -]*-(?=[^ -])|[^ ]+ *| +/', $text, $matches);
        return $matches[0];
    }

    /** Texto para el operador TJ, con los ajustes de kerning entre letras. */
    private function showText(string $line): string
    {
        $kerning = self::$fonts[$this->font]['k'];
        $parts = [];
        $run = '';
        $length = strlen($line);
        for ($i = 0; $i < $length; $i++) {
            $run .= $line[$i];
            $kern = $i + 1 < $length ? ($kerning[ord($line[$i]) * 256 + ord($line[$i + 1])] ?? 0) : 0;
            if ($kern !== 0) {
                $parts[] = '(' . self::escape($run) . ') ' . (-$kern);
                $run = '';
            }
        }
        if ($run !== '') $parts[] = '(' . self::escape($run) . ')';
        return '[' . implode(' ', $parts) . ']';
    }

    /** UTF-8 a Windows-1252 (codificación WinAnsi de las fuentes estándar). Los caracteres sin equivalente se cambian por «?». */
    private static function encode(string $text): string
    {
        $out = '';
        foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $char) {
            $code = self::codePoint($char);
            if ($code < 0x80 || ($code >= 0xA0 && $code <= 0xFF)) $out .= chr($code);
            elseif (isset(self::CP1252[$code])) $out .= chr(self::CP1252[$code]);
            else $out .= '?';
        }
        return $out;
    }

    private static function codePoint(string $char): int
    {
        $bytes = array_values(unpack('C*', $char));
        $count = count($bytes);
        if ($count === 1) return $bytes[0];
        if ($count === 2) return (($bytes[0] & 0x1F) << 6) | ($bytes[1] & 0x3F);
        if ($count === 3) return (($bytes[0] & 0x0F) << 12) | (($bytes[1] & 0x3F) << 6) | ($bytes[2] & 0x3F);
        return (($bytes[0] & 0x07) << 18) | (($bytes[1] & 0x3F) << 12) | (($bytes[2] & 0x3F) << 6) | ($bytes[3] & 0x3F);
    }

    private static function escape(string $text): string
    {
        return strtr($text, ['\\' => '\\\\', '(' => '\\(', ')' => '\\)', "\r" => '\\r']);
    }

    /** Cadena de metadatos en UTF-16BE, para que el título conserve las tildes. */
    private static function textString(string $text): string
    {
        $utf16 = '';
        foreach (preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $char) {
            $code = self::codePoint($char);
            if ($code > 0xFFFF) {
                $code -= 0x10000;
                $utf16 .= pack('n2', 0xD800 | ($code >> 10), 0xDC00 | ($code & 0x3FF));
            } else {
                $utf16 .= pack('n', $code);
            }
        }
        return '<FEFF' . strtoupper(bin2hex($utf16)) . '>';
    }

    private static function rgb(string $hex): string
    {
        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        return implode(' ', array_map(static fn (string $pair): string => self::num(hexdec($pair) / 255), str_split($hex, 2)));
    }

    private static function num(float $value): string
    {
        $text = rtrim(rtrim(sprintf('%.4F', $value), '0'), '.');
        return $text === '-0' ? '0' : $text;
    }
}

/** Genera la ficha familiar: una página por cada grupo de hasta tres hermanos. */
function create_pdf(array $data): string
{
    $doc = new PdfDocument('Ficha familiar de matrícula 2027');
    $x = 34;
    $w = 527;

    $text = static function ($value, float $left, float $top, float $width, float $size = 9, bool $bold = false, string $color = '#222', float $height = 25) use ($doc): void {
        $content = (string) ($value ?? '');
        $doc->font($bold);
        while ($size > 5 && $doc->fontSize($size)->heightOfString($content, $width) > $height) $size -= .25;
        $doc->fontSize($size)->fillColor($color)->text($content, $left, $top, $width, $height);
    };
    $bar = static function (string $label, float $top, string $color = GREEN, float $width = 527) use ($doc, $text, $x): void {
        $doc->roundedRect($x, $top, $width, 24, 5)->fill($color);
        $text($label, $x + 6, $top + 7, $width - 12, 10, true, '#fff', 15);
    };
    $field = static function (string $label, $value, float $left, float $top, float $width, float $labelWidth = 90) use ($doc, $text): void {
        $text($label, $left, $top + 7, $labelWidth - 4, 8, true, '#222', 20);
        $doc->roundedRect($left + $labelWidth, $top, $width - $labelWidth, 24, 5)->lineWidth(.8)->strokeColor('#333')->stroke();
        $text($value, $left + $labelWidth + 5, $top + 4, $width - $labelWidth - 10, 9, false, '#222', 19);
    };
    $table = static function (float $top, array $widths, array $rows, callable $colors, float $rowHeight = 19) use ($doc, $text, $x): float {
        $y = $top;
        foreach ($rows as $r => $row) {
            $left = $x;
            foreach ($row as $c => $value) {
                $fill = $colors($r, $c);
                $doc->lineWidth(.5)->rect($left, $y, $widths[$c], $rowHeight)->fillAndStroke($fill, '#555');
                $color = $fill !== '#fff' ? '#fff' : (strncmp((string) $value, 'B01-', 4) === 0 ? '#e22' : '#222');
                $text($value, $left + 4, $y + 6, $widths[$c] - 8, $c === 0 ? 8 : 8.5, $c < 2, $color, $rowHeight - 5);
                $left += $widths[$c];
            }
            $y += $rowHeight;
        }
        return $y;
    };

    $total = count($data['estudiantes']);
    $inscription = $data['tipo'] === 'nuevo' ? 'S/ 250.00' : 'No aplica';
    for ($offset = 0; $offset < $total; $offset += 3) {
        $siblings = array_slice($data['estudiantes'], $offset, 3);
        $n = count($siblings);
        $doc->addPage();
        $bar('DATOS INFORMATIVOS', 28, GREEN, 405);
        $doc->roundedRect(484, 18, 77, 76, 6)->fill(BLUE);
        $doc->crest(493, 23, 59, 65);
        $bar('DATOS ESTUDIANTE', 66, BLUE, 128);
        foreach ($siblings as $i => $student) {
            $y = 100 + $i * 28;
            $field('Apellidos y nombres', $student['nombre'], $x, $y, 345, 94);
            $field('Grado', $student['grado'] . ' ' . $student['nivel'], 386, $y, 79, 28);
            $field('DNI', $student['dni'], 472, $y, 89, 22);
        }

        $familyTop = 108 + $n * 28;
        $bar('DATOS MADRE/PADRE Y/O APODERADO', $familyTop);
        $mother = $father = null;
        $guardians = [];
        foreach ($data['contactos'] as $contact) {
            if ($contact['parentesco'] === 'Madre' && $mother === null) $mother = $contact;
            if ($contact['parentesco'] === 'Padre' && $father === null) $father = $contact;
            if ($contact['parentesco'] === 'Apoderado/a') $guardians[] = $contact;
        }
        $contacts = [$mother ?? ($guardians[0] ?? null), $father ?? ($guardians[$mother !== null ? 0 : 1] ?? null)];
        foreach ($contacts as $i => $contact) {
            $y = $familyTop + 32 + $i * 31;
            $field($contact['parentesco'] ?? ($i ? 'Padre' : 'Madre'), $contact['nombre'] ?? null, $x, $y, 423, 94);
            $field('DNI', $contact['dni'] ?? null, 464, $y, 97, 23);
        }
        $field('Cel. contacto 1', $contacts[0]['celular'] ?? null, 150, $familyTop + 94, 194, 78);
        $field('Cel. contacto 2', $contacts[1]['celular'] ?? null, 355, $familyTop + 94, 206, 78);
        $field('Correo electrónico', $data['correo'], $x, $familyTop + 126, $w, 94);
        $field('Dirección actual', $data['direccion'], $x, $familyTop + 158, $w, 94);
        $field('Ocupación', $data['ocupacion'], $x, $familyTop + 190, $w, 94);

        $paymentTop = $familyTop + 229;
        $bar('CONTROL DE PAGOS 2027', $paymentTop, BLUE);
        if ($total === 1) {
            $rows = [['2027', 'MONTO', 'B/V', 'OPERACIÓN', 'F/OPERACIÓN'], ['INSCRIPCIÓN', $inscription, 'B01-', '', ''], ['MATRÍCULA', 'S/ 450.00', 'B01-', '', '']];
            foreach (MONTHS as $i => $month) $rows[] = [$month, pension_for(1, 0, $i), 'B01-', '', ''];
            $bottom = $table($paymentTop + 32, [78, 90, 85, 143, 131], $rows,
                static fn (int $r, int $c): string => $r === 0 ? GREEN : ($c === 0 ? ($r <= 2 ? GREEN : BLUE) : '#fff'));
        } else {
            $fees = [['2027', 'MONTO', 'B/V', 'OPERACIÓN', 'F/OPERACIÓN', 'GRADO']];
            foreach ($siblings as $student) $fees[] = ['INSCRIPCIÓN', $inscription, 'B01-', '', '', $student['grado'] . ' ' . $student['nivel']];
            $fees[] = ['MATRÍCULA', 'S/ 450.00', 'B01-', '', '', ''];
            $feesBottom = $table($paymentTop + 32, [78, 78, 62, 98, 94, 117], $fees,
                static fn (int $r, int $c): string => $r === 0 || $c === 0 ? GREEN : '#fff');
            $moneyWidth = $n === 3 ? 58 : 85;
            $receiptWidth = 55;
            $remaining = $w - 78 - $n * ($moneyWidth + $receiptWidth);
            $widths = [78];
            $header = ['PENSIONES'];
            foreach ($siblings as $_) {
                array_push($widths, $moneyWidth, $receiptWidth);
                array_push($header, 'MONTO', 'B/V');
            }
            array_push($widths, $remaining / 2, $remaining / 2);
            array_push($header, 'OPERACIÓN', 'F/OPERACIÓN');
            $rows = [$header];
            foreach (MONTHS as $i => $month) {
                $row = [$month];
                foreach ($siblings as $j => $_) array_push($row, pension_for($total, $offset + $j, $i), 'B01-');
                array_push($row, '', '');
                $rows[] = $row;
            }
            $bottom = $table($feesBottom, $widths, $rows, static fn (int $r, int $c): string => $r === 0 || $c === 0 ? BLUE : '#fff', 18);
        }

        $observationTop = $bottom + 10;
        $observationHeight = min(62, 814 - $observationTop);
        $doc->rect($x, $observationTop, 86, $observationHeight)->fillAndStroke(BLUE, '#555');
        $text('OBSERVACIONES', $x + 3, $observationTop + 6, 80, 7.5, true, '#fff', 15);
        $doc->rect($x + 86, $observationTop, $w - 86, $observationHeight)->strokeColor('#555')->stroke();
        $details = [];
        foreach ($siblings as $student) {
            if ($student['procedencia'] !== '') $details[] = $student['nombre'] . ': ' . $student['procedencia'];
        }
        $text(implode('; ', $details), $x + 91, $observationTop + 5, $w - 96, 7, false, '#222', $observationHeight - 8);
        for ($i = 1; $i < 3; $i++) {
            $lineY = $observationTop + $i * $observationHeight / 3;
            $doc->moveTo($x + 86, $lineY)->lineTo($x + $w, $lineY)->stroke();
        }
        $footer = 'Montos según ficha de referencia. No acredita pagos.'
            . ($total > 3 ? ' Grupo ' . ($offset / 3 + 1) . '; desde el cuarto alumno, consultar tarifa.' : '');
        $text($footer, $x, 824, $w, 7, false, '#555', 12);
    }
    return $doc->output();
}
