# Inscripciones y matrículas 2027

Portal de matrículas del colegio Alexander Von Humboldt: portada, formulario, consulta de DNI con ApisPerú, registro en el Google Sheet existente y ficha familiar en PDF. Está hecho para publicarse **dentro del sitio de WordPress** del colegio, como una carpeta (por ejemplo `https://dominio/matriculas/`), sin servidor Node.js ni acceso a cPanel.

- Frontend estático (HTML, CSS y JavaScript sin dependencias).
- Backend en **PHP 8.0 o superior**, sin bibliotecas externas: lo ejecuta cualquier hosting de WordPress.

`public/css/estilos.css` conserva exactamente el commit `54241f4` (FRONTED FINAL), incluidas sus animaciones; los estilos del formulario están en `integraciones.css` y los de la portada en `inicio.css`.

**Para publicar, ver [docs/PUBLICAR-EN-WORDPRESS.md](docs/PUBLICAR-EN-WORDPRESS.md).**

## Estructura del proyecto

```
.
├── public/                       Carpeta que se sube al hosting (se publica como /matriculas/)
│   ├── index.html
│   ├── .htaccess                 Cabeceras de seguridad y caché (Apache)
│   ├── css/
│   │   ├── estilos.css           Estilos originales (FRONTED FINAL, no modificar)
│   │   ├── integraciones.css     Formulario, contactos y entrega del PDF
│   │   └── inicio.css            Portada, pantalla de carga y animaciones
│   ├── js/
│   │   ├── inscripcion.js        Formulario, consulta DNI, envío y compartir PDF
│   │   └── inicio.js             Pantalla de carga e inclinación 3D de la portada
│   ├── assets/img/               Escudo, fondos e imágenes de la portada (inicio/)
│   └── api/
│       ├── dni.php               POST: consulta de nombres por DNI
│       ├── matriculas.php        POST: valida, guarda en Google Sheets y devuelve el PDF
│       ├── config.example.php    Plantilla de claves (se copia como config.php)
│       └── lib/                  Código interno: validación, DNI, Sheets, PDF, seguridad
├── google-apps-script/           Script que escribe en el Google Sheet
├── docs/                         Guía de publicación para el equipo de WordPress
├── scripts/iniciar.ps1           Servidor local en Windows (pruebas)
├── tests/                        Pruebas (node:test + servidor PHP integrado)
└── .vscode/launch.json           Perfil F5 de Visual Studio Code
```

## Portada

La portada sigue el diseño “Portal de Matrículas 2027”: fondo del patio en azul, alumnos a la izquierda, titular con bandas amarilla y roja y los botones **Alumno nuevo** y **Alumno promovido**. Al entrar se muestra una pantalla de carga con el progreso real de imágenes y fuente; luego los elementos aparecen escalonados. Con mouse o trackpad, los alumnos y el titular se inclinan en 3D hacia el puntero. En pantallas táctiles o con “reducir movimiento” activado no hay inclinación, y con “reducir movimiento” tampoco hay animaciones. En celulares la portada se apila en vertical. Las imágenes son WebP optimizados (unos 350 KB en total) y la tipografía Poppins se carga desde Google Fonts.

## Desarrollo local

Requiere PHP 8.0 o superior (con cURL). Para las pruebas también Node.js 22 o superior.

1. Copiar `public/api/config.example.php` como `public/api/config.php` y completar las claves. Sin claves, el portal funciona pero avisa que la consulta de DNI y el guardado no están configurados.
2. Ejecutar `npm start` (o `php -S localhost:8000 -t public`) y abrir http://localhost:8000. En Visual Studio Code, **F5** con el perfil **Matrículas: servidor PHP local**; en Windows también `.\scripts\iniciar.ps1`.
3. No abrir `public/index.html` directamente: las rutas `api/*.php` necesitan PHP.

`npm install` y luego `npm test` ejecutan las pruebas del formulario (jsdom) y del backend PHP: validación, fichas de 1 a 4 hermanos, consulta DNI, guardado, errores de Google, origen, rutas privadas y límites. Usan servicios falsos de Google y ApisPerú: no escriben en el Sheet ni consumen consultas. También verifican que el CSS original sea idéntico a FRONTED FINAL.

## Conectar el Google Sheet

1. En el archivo https://docs.google.com/spreadsheets/d/1sN5DaUygQIv3lwXmCOyZjHo--saJAkkYYlA-DkXW5iQ/edit abrir **Extensiones → Apps Script**.
2. Copiar `google-apps-script/Code.gs` al editor. Configurar el manifiesto según `appsscript.json` para usar únicamente el permiso de hojas de cálculo.
3. Generar una clave aleatoria larga (32 bytes o más). Guardarla en **Configuración del proyecto → Propiedades del script**, nombre `BACKEND_SECRET`. Guardar la misma clave en `config.php` como `google_script_secret`. Nunca incluirla en el frontend ni en Git.
4. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como propietario, acceso **Cualquier usuario**. Autorizar el acceso a Google Sheets. El script verifica la clave del servidor antes de acceder al documento y no ofrece lectura pública.
5. Pegar la URL terminada en `/exec` en `google_script_url` de `config.php`. Al cambiar el script, actualizar la implementación a una versión nueva.

### Datos y plantilla

- Cada alumno se ubica según grado y nivel: `1° PRIMARIA` a `6° PRIMARIA`, `1° SECUNDARIA` a `5° SECUNDARIA`.
- Se llena la primera fila libre desde la 6, columnas B:L: número, nombre, grado, DNI, colegio de procedencia, madre/apoderado y celular, padre/apoderado y celular, dirección, correo.
- Nunca se escriben las columnas de pagos M en adelante. Los importes del PDF siguen las imágenes de referencia y no son comprobantes de pago. En promovidos, inscripción no aplica. Confirmar tarifas con el colegio antes de producción.
- La pestaña `REGISTROS WEB` conserva la solicitud completa en JSON (todos los alumnos, parentescos, DNI, teléfonos, correo, dirección, ocupación), fecha, tipo e identificador. Las notas de los nombres guardan el identificador para recuperar envíos interrumpidos.
- Se usa un bloqueo para escrituras simultáneas y un identificador para reintentos. Un DNI ya registrado en el mismo grado no se sobrescribe. Los errores o filas agotadas aparecen en el formulario; no se anuncia éxito sin confirmación de Google.
- Si se agotan las filas preparadas, ampliar la plantilla con su formato antes de volver a enviar.

## Consulta DNI y formulario

Activar el plan de Consultas DNI/RUC en ApisPerú y poner el token en `apisperu_token` de `config.php`.

`api/dni.php` consulta `https://dniruc.apisperu.com/api/v1/dni/{dni}` con `Authorization: Bearer` y devuelve únicamente nombres y dirección, si existe. El token nunca llega al navegador. El frontend consulta al completar 8 dígitos, reutiliza resultados en memoria y descarta respuestas anteriores si el DNI cambió. El DNI se envía en el cuerpo del POST, no en la URL. El endpoint tiene un límite de 10 consultas por minuto por IP (y 30 solicitudes por minuto en total).

La [documentación oficial de DNI](https://dniruc.apisperu.com/doc#tag/dni) incluye nombres y apellidos, **no dirección**. Por eso la dirección se solicita aparte después de la consulta; nunca se inventa ni se considera la dirección de una empresa obtenida por RUC como domicilio personal. Si falla la consulta o se agota el cupo gratuito, se ofrece completar los nombres manualmente. Los botones Madre/Padre/Apoderado identifican correctamente cada contacto en Sheets y en la ficha.

## WhatsApp y PDF familiar

**Enviar matrícula** funciona con un solo clic: guarda los datos en Google Sheets y, solo cuando Google confirma el registro, entrega la ficha PDF. Si Google no confirma, no se entrega la ficha y se puede reintentar sin duplicar la matrícula.

- **En celulares** (portal publicado por HTTPS): se abre el menú de compartir del dispositivo con la ficha adjunta; si el celular pide otro toque, aparece **Compartir PDF**. Se elige WhatsApp y el chat del colegio **+51 901 648 212** y se confirma el envío.
- **En computadoras** o navegadores sin compartir archivos: aparecen **Descargar ficha PDF** y **Abrir chat del colegio** para adjuntarla en WhatsApp.

No se necesita WhatsApp Business Platform. La versión anterior en Node.js podía adjuntar el PDF en WhatsApp Web de forma automática, pero solo cuando el servidor corría en la misma computadora; en un hosting no es posible y se retiró.

- Un alumno: una ficha individual, inscripción S/ 250, matrícula S/ 450 y pensión S/ 500.
- Dos hermanos: una página familiar, dos inscripciones de S/ 250 y una fila de matrícula de S/ 450; pensiones de S/ 500 y S/ 470. Diciembre del primer alumno figura en S/ 480, tal como en la imagen recibida.
- Tres hermanos: una página familiar, tres inscripciones de S/ 250 y una fila de matrícula de S/ 450; pensiones de S/ 500, S/ 470 y S/ 450.
- Más de tres: se conservan todos los alumnos en grupos de hasta tres por página; desde el cuarto la tarifa indica “Consultar”, porque no se suministró una tarifa para esos casos.

Las tablas tienen espacios para B/V, operación y fecha; no se marcan pagos como realizados. La ficha conserva nombres, DNI, grado y nivel de cada alumno y los datos de sus contactos. El registro no acredita una vacante. El PDF se genera en PHP con la misma maquetación que tenía la versión Node (pdfkit).

## Seguridad y datos personales

- `config.php` (claves) y `api/lib/` nunca se muestran: PHP responde 404 si se piden directamente y, en Apache, `.htaccess` además los bloquea.
- Las solicitudes desde otra web se rechazan (comprobación de origen). Hay límites por IP; se guarda un hash de la IP, no la IP.
- No se registran cuerpos de solicitud ni claves en los logs.
- Antes de recibir datos reales, revisar los permisos del Sheet: contiene DNI y datos de menores y sus contactos. Mantener acceso solo para las personas autorizadas del colegio.
