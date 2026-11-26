# Publicar el portal de matrículas en el sitio de WordPress

Guía para el equipo que administra el WordPress del colegio. No hace falta instalar plugins, Node.js ni tocar el tema: el portal es una carpeta que se sube junto a WordPress.

## Qué se necesita

- Acceso para subir archivos al hosting: FTP/SFTP o el administrador de archivos del panel del hosting.
- **PHP 8.0 o superior** con la extensión **cURL** (la que usa el propio WordPress; casi todos los hostings la tienen).
- El sitio con **HTTPS** (necesario para compartir el PDF desde el celular).
- Las claves que entrega el colegio **por un canal seguro** (no por correo ni chat en texto plano):
  - URL del Apps Script del Google Sheet (termina en `/exec`).
  - Clave del Apps Script (`BACKEND_SECRET`).
  - Token de ApisPerú (opcional: sin él, los nombres se escriben a mano).

## Pasos

1. **Preparar la carpeta.** Del repositorio, tomar el contenido de `public/` y ponerlo en una carpeta llamada `matriculas`. Debe quedar así:
   ```
   matriculas/
   ├── index.html
   ├── .htaccess        (archivo oculto: subirlo también)
   ├── css/  js/  assets/
   └── api/
   ```
2. **Subirla** a la raíz del WordPress, en el mismo nivel que `wp-config.php` y `wp-content/`. El portal quedará en `https://dominio-del-colegio/matriculas/`.
3. **Crear las claves.** Dentro de `matriculas/api/`, copiar `config.example.php` como `config.php` y completar los tres valores. Guardar.
4. **Comprobar** (con el navegador):
   - `https://dominio/matriculas/` muestra la portada con la pantalla de carga.
   - `https://dominio/matriculas/api/config.php` y `.../api/lib/pdf.php` muestran una página vacía o un error 403/404, **nunca** texto con las claves.
   - Hacer una matrícula de prueba: al escribir un DNI se completan los nombres; al enviar, la fila aparece en el Google Sheet y se descarga la ficha PDF. Borrar luego la fila de prueba del Sheet.
   - Repetir la prueba desde un celular (Android y iPhone): debe abrirse el menú para compartir la ficha por WhatsApp.
5. **Enlazar desde la landing.** En la página de WordPress (Gutenberg, Elementor u otro), poner los botones de matrícula con el enlace `https://dominio/matriculas/`.

## Si algo no funciona

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| `/matriculas/` muestra la página 404 de WordPress | El hosting no usa `index.html` como página inicial | Enlazar a `/matriculas/index.html`, o pedir al hosting que active `DirectoryIndex index.html`. |
| “La consulta de DNI no está configurada” o “Falta activar la conexión con Google Sheets” | Falta `api/config.php` o tiene valores vacíos | Revisar el paso 3. |
| “Origen no permitido” | Se abrió el portal desde otro dominio o un *iframe* de otro sitio | Abrir el portal en el mismo dominio donde está subido. |
| El envío falla al minuto o se corta | Un plugin de caché o seguridad intercepta la API, o el hosting corta PHP a los 30 s | Excluir `/matriculas/api/` de la caché (WP Rocket, LiteSpeed Cache, Cloudflare) y del firewall (Wordfence u otro). Pedir `max_execution_time` de 60 s o más. |
| “Hiciste demasiadas solicitudes seguidas” en uso normal | Varias personas salen a internet con la misma IP (por ejemplo, el colegio) | Es temporal (1 minuto). Si ocurre seguido, avisar a quien mantiene el código para subir el límite. |
| El sitio usa Nginx (Kinsta, WP Engine, etc.) | Nginx ignora `.htaccess` | No afecta la seguridad de las claves: PHP ya las protege. Las cabeceras de seguridad y caché del `.htaccess` deben configurarse en el panel del hosting si se quieren. |

## Actualizar

Para publicar una versión nueva, volver a subir los archivos de `public/` **sin borrar `api/config.php`** del servidor (ese archivo no está en el repositorio).

## Recomendaciones

- Mantener el mismo dominio que la landing: así no hay problemas de origen ni de certificados.
- Agregar en la landing un enlace al aviso de privacidad del colegio: el formulario recoge DNI y datos de menores y sus padres (Ley 29733 de Protección de Datos Personales).
- Medir los clics del botón “Matricúlate” en la landing de WordPress; no agregar herramientas de seguimiento dentro del formulario.
- Limitar quién tiene acceso al Google Sheet.
