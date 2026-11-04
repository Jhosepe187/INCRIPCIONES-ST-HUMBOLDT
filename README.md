# Inscripciones y matrículas 2027

Frontend del colegio, servidor Node.js, fichas familiares PDF, consulta de DNI con ApisPerú y registro en el Google Sheet existente. `estilos.css` conserva exactamente el commit `54241f4` (FRONTED FINAL), incluidas sus animaciones; los estilos nuevos están en `integraciones.css`.

## Ejecutar

Requiere Node.js 22 o superior. Instalar dependencias con `pnpm install --frozen-lockfile` (o `npm install`). Copiar `.env.example` a `.env` y ejecutar `npm start`. Abrir http://localhost:3000. No abrir index.html directamente ni usar Live Server: las rutas `/api` requieren el servidor.

`npm test` ejecuta validación, generación PDF, consulta DNI simulada y pruebas de la API sin escribir en Google ni consumir consultas de ApisPerú. También verifica que el CSS original sea idéntico a FRONTED FINAL.

En esta PC también se puede ejecutar `.\iniciar.ps1` desde PowerShell: usa Node instalado o el runtime local de Codex. Mantener la terminal abierta mientras se usa el sitio. La conexión de Google ya fue configurada localmente en `.env`; ese archivo no se comparte por Git.

## Conectar el Google Sheet

1. En el archivo https://docs.google.com/spreadsheets/d/1sN5DaUygQIv3lwXmCOyZjHo--saJAkkYYlA-DkXW5iQ/edit abrir **Extensiones → Apps Script**.
2. Copiar `google-apps-script/Code.gs` al editor. Configurar el manifiesto según `appsscript.json` para usar únicamente el permiso de hojas de cálculo.
3. Generar una clave aleatoria larga (32 bytes o más). Guardarla en **Configuración del proyecto → Propiedades del script**, nombre `BACKEND_SECRET`. Guardar la misma clave en `.env` como `GOOGLE_SCRIPT_SECRET`. Nunca incluirla en el frontend ni en Git.
4. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como propietario, acceso **Cualquier usuario**. Autorizar el acceso a Google Sheets. El script verifica la clave del servidor antes de acceder al documento y no ofrece lectura pública.
5. Pegar la URL terminada en `/exec` en `GOOGLE_SCRIPT_URL` de `.env` y reiniciar el servidor. Al cambiar el script, actualizar la implementación a una versión nueva.

### Datos y plantilla

- Cada alumno se ubica según grado y nivel: `1° PRIMARIA` a `6° PRIMARIA`, `1° SECUNDARIA` a `5° SECUNDARIA`.
- Se llena la primera fila libre desde la 6, columnas B:L: número, nombre, grado, DNI, colegio de procedencia, madre/apoderado y celular, padre/apoderado y celular, dirección, correo.
- Nunca se escriben las columnas de pagos M en adelante. Los importes del PDF siguen las imágenes de referencia y no son comprobantes de pago. En promovidos, inscripción no aplica. Confirmar tarifas con el colegio antes de producción.
- La pestaña `REGISTROS WEB` conserva la solicitud completa en JSON (todos los alumnos, parentescos, DNI, teléfonos, correo, dirección, ocupación), fecha, tipo e identificador. Las notas de los nombres guardan el identificador para recuperar envíos interrumpidos.
- Se usa un bloqueo para escrituras simultáneas y un identificador para reintentos. Un DNI ya registrado en el mismo grado no se sobrescribe. Los errores o filas agotadas aparecen en el formulario; no se anuncia éxito sin confirmación de Google.
- Si se agotan las filas preparadas, ampliar la plantilla con su formato antes de volver a enviar.

## Consulta DNI y formulario

Activar el plan de Consultas DNI/RUC en ApisPerú y configurar `APISPERU_TOKEN` en `.env`. La cuenta de esta PC ya quedó activada en el plan gratuito y el token está configurado. No incluir `.env` en Git.

El servidor consulta `https://dniruc.apisperu.com/api/v1/dni/{dni}` con `Authorization: Bearer` y devuelve únicamente nombres y dirección, si existe. El frontend consulta al completar 8 dígitos, reutiliza resultados en memoria y descarta respuestas anteriores si el DNI cambió. El DNI se envía en el cuerpo del POST, no en la URL de la web. El endpoint tiene un límite adicional de 10 consultas por minuto por IP.

La [documentación oficial de DNI](https://dniruc.apisperu.com/doc#tag/dni) incluye nombres y apellidos, **no dirección**. Por eso la dirección se solicita aparte después de la consulta; nunca se inventa ni se considera la dirección de una empresa obtenida por RUC como domicilio personal. Si falla la consulta o se agota el cupo gratuito, se ofrece completar los nombres manualmente. Se retiró el encabezado “Datos de la familia”; los datos principales de contacto son DNI, celular, correo y ocupación. Los botones Madre/Padre/Apoderado identifican correctamente cada contacto en Sheets y en la ficha.

## WhatsApp y PDF familiar

El botón WhatsApp prepara un PDF en memoria. Luego **Compartir PDF adjunto** abre el menú nativo del celular con el archivo y el texto incluidos. El usuario elige WhatsApp y el colegio **+51 901 648 212**. No tiene que descargar ni buscar el archivo. Se utiliza un segundo clic porque Web Share requiere activación directa del usuario. El sistema no puede seleccionar el destinatario ni confirmar entrega desde el menú nativo.

Requiere un dispositivo/navegador con soporte de `navigator.canShare({files})` y un contexto seguro (HTTPS en el sitio publicado). En navegadores sin soporte se explica la limitación y se conservan enlaces para descargar una copia y abrir el chat. El enlace `wa.me` por sí solo solo prepara el texto: no adjunta el PDF. El flujo con archivo adjunto se eligió expresamente para celular, sin WhatsApp Business Platform.

- Un alumno: una ficha individual, inscripción S/ 250, matrícula S/ 450 y pensión S/ 500.
- Dos hermanos: una página familiar, dos inscripciones de S/ 250 y una fila de matrícula de S/ 450; pensiones de S/ 500 y S/ 470. Diciembre del primer alumno figura en S/ 480, tal como en la imagen recibida.
- Tres hermanos: una página familiar, tres inscripciones de S/ 250 y una fila de matrícula de S/ 450; pensiones de S/ 500, S/ 470 y S/ 450.
- Más de tres: se conservan todos los alumnos en grupos de hasta tres por página; desde el cuarto la tarifa indica “Consultar”, porque no se suministró una tarifa para esos casos.

Las tablas tienen espacios para B/V, operación y fecha; no se marcan pagos como realizados. La ficha conserva nombres, DNI, grado y nivel de cada alumno y los datos de sus contactos. Para guardar en Google Sheets se debe pulsar **Enviar matrícula**. Ningún botón acredita una vacante.

## Publicar

Se requiere un alojamiento que ejecute Node.js; GitHub Pages no ejecuta el backend. Configurar `HOST=0.0.0.0`, `PORT` y las dos variables de Google como secretos del alojamiento. Usar HTTPS y conservar frontend y API en el mismo origen. Para un proxy inverso, configurar `trust proxy` de Express según la topología real antes de habilitar tráfico público, para que límites de IP y comprobación de origen funcionen correctamente.

Antes de recibir datos reales, revisar los permisos del Sheet: contiene DNI y datos de menores y sus contactos. Mantener acceso solo para las personas autorizadas del colegio. No registrar cuerpos de solicitudes ni claves en los logs. El servidor limita solicitudes y no publica el repositorio ni `.env` como archivos estáticos.

No se necesita WhatsApp Business Platform para el flujo manual elegido.
