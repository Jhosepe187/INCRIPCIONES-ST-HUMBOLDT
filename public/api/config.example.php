<?php
// Copia este archivo como config.php (en esta misma carpeta api/) y completa los valores.
// config.php no se sube a Git y PHP nunca lo muestra como texto: solo devuelve estos datos al backend.
// También se pueden definir como variables de entorno del hosting (GOOGLE_SCRIPT_URL, etc.).

if (count(get_included_files()) === 1) { http_response_code(404); exit; }

return [
    // URL de la implementación del Apps Script del Google Sheet (termina en /exec).
    'google_script_url' => '',
    // Misma clave guardada en el Apps Script como propiedad BACKEND_SECRET (32 caracteres o más).
    'google_script_secret' => '',
    // Token de ApisPerú para completar nombres desde el DNI. Si queda vacío, se completan a mano.
    'apisperu_token' => '',
];
