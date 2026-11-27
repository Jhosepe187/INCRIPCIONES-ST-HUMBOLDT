# Inscripciones y matrículas 2027

Frontend del colegio, servidor Node.js, fichas familiares PDF, consulta de DNI con ApisPerú y registro en el Google Sheet existente. `public/css/estilos.css` conserva exactamente el commit `54241f4` (FRONTED FINAL), incluidas sus animaciones; los estilos del formulario están en `integraciones.css` y los de la portada en `inicio.css`.

## Estructura del proyecto

```
.
├── public/                    Frontend estático (lo único que publica el servidor)
│   ├── index.html
│   ├── css/
│   │   ├── estilos.css        Estilos originales (FRONTED FINAL, no modificar)
│   │   ├── integraciones.css  Formulario, contactos y entrega del PDF
│   │   └── inicio.css         Portada, pantalla de carga y animaciones
│   ├── js/
│   │   ├── inscripcion.js     Formulario, consulta DNI, envío y entrega por WhatsApp
│   │   └── inicio.js          Pantalla de carga e inclinación 3D de la portada
│   └── assets/img/            Escudo, fondos e imágenes de la portada (inicio/)
├── api/index.js               Entrada de Vercel (expone la app Express como función)
├── backend/                   Servidor Express: API, validación, PDF y DNI
├── google-apps-script/        Script que escribe en el Google Sheet
├── scripts/iniciar.ps1        Arranque en Windows
├── docs/                      Guías de despliegue (Vercel y subdominio)
├── tests/                     Pruebas con node:test
├── vercel.json                Configuración de Vercel (rutas, función y encabezados)
├── .vscode/launch.json        Perfil F5 de Visual Studio Code
└── .env.example               Variables de entorno necesarias
```

## Portada

La portada sigue el diseño “Portal de Matrículas 2027”: fondo del patio en azul, alumnos a la izquierda, titular con bandas amarilla y roja y los botones **Alumno nuevo** y **Alumno promovido**. Al entrar se muestra una pantalla de carga con el progreso real de imágenes y fuente; luego los elementos aparecen escalonados. Con mouse o trackpad, los alumnos y el titular se inclinan en 3D hacia el puntero. En pantallas táctiles o con “reducir movimiento” activado no hay inclinación, y con “reducir movimiento” tampoco hay animaciones. En celulares la portada se apila en vertical. Las imágenes son WebP optimizados (unos 350 KB en total) y la tipografía Poppins se carga desde Google Fonts.

## Ejecutar

Requiere Node.js 22 o superior. Instalar dependencias con `pnpm install --frozen-lockfile` (o `npm install`). Copiar `.env.example` a `.env` y ejecutar `npm start`. Abrir http://localhost:3000. No abrir `public/index.html` directamente ni usar Live Server: las rutas `/api` requieren el servidor.

En Visual Studio Code, abre la carpeta raíz del proyecto y pulsa **F5** con el perfil **Matrículas: servidor y API de DNI**. Cuando la terminal muestre `Matrículas: http://localhost:3000`, abre o recarga esa dirección. En Windows, el perfil usa `scripts/iniciar.ps1`, que también puede encontrar el Node.js de Codex si no hay una instalación en el PATH. Para que ApisPerú responda, el archivo local `.env` debe contener `APISPERU_TOKEN`.

`npm test` ejecuta validación, generación PDF, consulta DNI simulada y pruebas de la API sin escribir en Google ni consumir consultas de ApisPerú. También verifica que el CSS original sea idéntico a FRONTED FINAL.

En esta PC también se puede ejecutar `.\scripts\iniciar.ps1` desde PowerShell: usa Node instalado o el runtime local de Codex. Mantener la terminal abierta mientras se usa el sitio. La conexión de Google ya fue configurada localmente en `.env`; ese archivo no se comparte por Git.

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

La [documentación oficial de DNI](https://dniruc.apisperu.com/doc#tag/dni) incluye nombres y apellidos, **no dirección**. Por eso la dirección se solicita aparte después de la consulta; nunca se inventa ni se considera la dirección de una empresa obtenida por RUC como domicilio personal. Si falla la consulta o se agota el cupo gratuito, se ofrece completar los nombres manualmente. El formulario pide siempre **los datos de la madre y los del padre** (bloques «Datos de la madre» y «Datos del padre»): DNI y celular de cada uno son obligatorios y los nombres se completan con la consulta de DNI o manualmente. No se puede enviar la matrícula sin ambos, y la madre y el padre no pueden tener el mismo DNI; el servidor vuelve a comprobarlo. El correo, la dirección y la ocupación (opcional) son de la familia. En Sheets y en la ficha PDF, cada uno ocupa su columna y su fila.

## WhatsApp y PDF familiar

**Enviar matrícula** funciona con un solo clic: guarda los datos en Google Sheets y, en cuanto Google confirma el registro, entrega la ficha PDF para enviarla al chat del colegio **+51 901 648 212**. Si Google no confirma el registro, no se entrega la ficha. Todo el envío ocurre en el navegador de la familia, así que funciona igual en `localhost` y publicado en Vercel; el servidor no abre navegadores ni guarda sesiones de WhatsApp.

- **Computadora:** la ficha se descarga como `matricula-2027-<nombre-del-alumno>.pdf` y aparece un **cuadro flotante** con las instrucciones («En el chat del colegio, adjunta … (clip › Documento) y pulsa Enviar»), el nombre del archivo y el botón **Enviar a WhatsApp**, que abre el chat del colegio (WhatsApp Web o la aplicación) con el mensaje escrito. Es un enlace normal, así que el navegador no lo bloquea.
- **Celular o tablet:** se abre directamente el menú **Compartir** del dispositivo con la ficha adjunta. Si el celular exige un toque más, aparece el mismo cuadro flotante con **Enviar a WhatsApp**, que vuelve a abrir el menú Compartir.
- **Respaldo:** si el dispositivo no puede compartir el archivo, se usa el flujo de computadora. El botón principal (**Enviar a WhatsApp**) vuelve a mostrar el cuadro, y los enlaces **Descargar ficha PDF** y **Abrir chat del colegio** siempre quedan visibles bajo el formulario.

WhatsApp nunca envía nada solo: el mensaje sale únicamente cuando la familia pulsa **Enviar**. Si después de enviar se edita el formulario, el botón vuelve a **Enviar matrícula** y el siguiente envío es una solicitud nueva.

- Un alumno: una ficha individual, inscripción S/ 250, matrícula S/ 450 y pensión S/ 500.
- Dos hermanos: una página familiar, dos inscripciones de S/ 250 y una fila de matrícula de S/ 450; pensiones de S/ 500 y S/ 470. Diciembre del primer alumno figura en S/ 480, tal como en la imagen recibida.
- Tres hermanos: una página familiar, tres inscripciones de S/ 250 y una fila de matrícula de S/ 450; pensiones de S/ 500, S/ 470 y S/ 450.
- Más de tres: se conservan todos los alumnos en grupos de hasta tres por página; desde el cuarto la tarifa indica “Consultar”, porque no se suministró una tarifa para esos casos.

Las tablas tienen espacios para B/V, operación y fecha; no se marcan pagos como realizados. La ficha conserva nombres, DNI, grado y nivel de cada alumno y los datos de sus contactos. El registro no acredita una vacante.

## Publicar

El portal se publica en **Vercel** y se enlaza desde la landing de WordPress con un subdominio (por ejemplo `matricula.<dominio-del-colegio>`). La guía completa, con los registros DNS que debe crear el equipo de WordPress, está en [docs/DESPLIEGUE-VERCEL.md](docs/DESPLIEGUE-VERCEL.md).

- `public/` lo sirve la CDN de Vercel y `/api/*` lo atiende la función `api/index.js`, que usa la misma app Express que `npm start`.
- `vercel.json` repite en las páginas estáticas los encabezados de seguridad que `helmet` aplica a la API.
- En Vercel, la app confía en el proxy de Vercel (`trust proxy`) para que la comprobación de origen y los límites por IP vean al visitante real. En otro alojamiento detrás de un proxy, ajusta `trust proxy` según la topología antes de abrir el tráfico.
- Las variables `GOOGLE_SCRIPT_URL`, `GOOGLE_SCRIPT_SECRET` y `APISPERU_TOKEN` se cargan en **Vercel → Settings → Environment Variables**, nunca en el repositorio.

Antes de recibir datos reales, revisar los permisos del Sheet: contiene DNI y datos de menores y sus contactos. Mantener acceso solo para las personas autorizadas del colegio. No registrar cuerpos de solicitudes ni claves en los logs. El servidor limita solicitudes y solo publica la carpeta `public/`; el código del servidor, los scripts y `.env` no son accesibles como archivos estáticos.

No se necesita WhatsApp Business Platform: la familia envía la ficha desde su propio WhatsApp.
