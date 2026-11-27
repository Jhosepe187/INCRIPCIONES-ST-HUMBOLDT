# Despliegue en Vercel con subdominio del colegio

La landing del colegio sigue en WordPress (cPanel). El portal de matrículas se publica en Vercel y se enlaza con un subdominio, por ejemplo `matricula.<dominio-del-colegio>`. En el hosting de WordPress no se sube nada: solo se crea **un registro DNS**.

```
Familia ──► matricula.<dominio>  ──CNAME──►  Vercel
                                              ├── public/      (CDN: página, CSS, JS, imágenes)
                                              └── /api/*       (función api/index.js → Express)
                                                    ├── Google Apps Script → Google Sheet
                                                    └── ApisPerú (consulta de DNI)
```

## 1. Crear el proyecto en Vercel

1. Entrar a [vercel.com](https://vercel.com) con la cuenta de GitHub y elegir **Add New → Project**.
2. Importar el repositorio y la rama de producción (`principal`).
3. **Framework Preset:** *Other*. Dejar vacíos *Build Command* e *Install Command*: `vercel.json` ya indica la carpeta `public/` y la función.
4. En **Environment Variables**, cargar (entorno *Production* y, si se usan vistas previas, *Preview*):

   | Variable | Valor |
   |---|---|
   | `GOOGLE_SCRIPT_URL` | URL `/exec` de la implementación de Apps Script |
   | `GOOGLE_SCRIPT_SECRET` | La misma clave que `BACKEND_SECRET` en el script |
   | `APISPERU_TOKEN` | Token de ApisPerú |
   | `NODE_ENV` | `production` |

   `PORT` y `HOST` no se usan en Vercel.
5. Pulsar **Deploy**. Vercel entrega una dirección del tipo `<proyecto>.vercel.app`.

## 2. Comprobar el despliegue antes de tocar el dominio

En `https://<proyecto>.vercel.app`:

- [ ] La portada carga con imágenes y tipografía.
- [ ] Al escribir el DNI de la madre y el del padre se completan sus nombres (ApisPerú).
- [ ] Una matrícula de prueba aparece en el Google Sheet y se entrega la ficha PDF con el escudo.
- [ ] En computadora: se descarga la ficha, aparece el cuadro flotante y **Enviar a WhatsApp** abre el chat del colegio.
- [ ] En celular: **Compartir** ofrece WhatsApp con el PDF adjunto.
- [ ] `https://<proyecto>.vercel.app/backend/server.js` y `/.env` responden **404** (solo se publica `public/`).

Después de la prueba, borrar la fila de prueba del Sheet y su registro en `REGISTROS WEB`.

## 3. Conectar el subdominio

### En Vercel

**Project → Settings → Domains → Add** y escribir el subdominio (`matricula.<dominio>`). Vercel muestra el registro exacto que hay que crear. Normalmente es:

| Tipo | Nombre / Host | Valor |
|---|---|---|
| CNAME | `matricula` | `cname.vercel-dns.com` (o el valor propio que muestre Vercel) |

Usar siempre el valor que aparece en esa pantalla.

### En el DNS del dominio (equipo de WordPress / proveedor del hosting)

- Crear **solo ese registro CNAME**. No cambiar nameservers ni los registros `@` o `www`: la landing de WordPress sigue igual.
- En cPanel: **Dominios → Zone Editor → + CNAME Record**.
- Si el dominio usa Cloudflare, crear el registro allí con la nube en gris (**DNS only**).
- Si existe un registro **CAA**, debe permitir `letsencrypt.org` para que Vercel emita el certificado HTTPS.
- Si Vercel pide un registro **TXT** de verificación (pasa cuando el dominio ya está en otra cuenta de Vercel), crearlo también.

La propagación tarda de minutos a unas horas. Cuando Vercel muestra **Valid Configuration**, el HTTPS se emite solo. Para comprobarlo:

```bash
dig matricula.<dominio> CNAME +short
```

### Mensaje para el equipo de WordPress

> Necesitamos crear un registro DNS para el portal de matrícula, sin tocar nada más del sitio:
> **Tipo:** CNAME · **Host:** `matricula` · **Valor:** `<valor que muestra Vercel>` · **TTL:** automático.
> Si hay un registro CAA, por favor permitan `letsencrypt.org`.

## 4. Enlazar desde la landing

En WordPress basta con un botón o elemento de menú **Matrícula 2027** que apunte a `https://matricula.<dominio>`. No conviene incrustar el portal en un `iframe`: las cabeceras de seguridad lo impiden a propósito (`X-Frame-Options: SAMEORIGIN`).

## Cómo funciona en Vercel

| Pieza | Dónde está | Qué hace |
|---|---|---|
| `public/` | CDN de Vercel | Página, estilos, scripts e imágenes |
| `api/index.js` | Vercel Function (Node.js) | Expone `createApp()` de `backend/server.js` |
| `vercel.json` | Configuración | Envía `/api/*` a la función, le da hasta 60 s (Google puede tardar), incluye el escudo para el PDF y añade los encabezados de seguridad a las páginas estáticas |
| `trust proxy` | `backend/server.js` | Solo con `VERCEL` definido: la comprobación de origen y los límites por IP ven al visitante real |

**WhatsApp:** la ficha se entrega desde el navegador de la familia (menú Compartir en celulares, descarga y chat en computadoras). El servidor no automatiza WhatsApp, así que funciona igual en Vercel que en local.

## Límites conocidos

- **Plan Hobby (gratuito):** Vercel lo reserva para uso personal y no comercial. Para producción del colegio, confirmar si aplica o usar el plan Pro.
- **Límite por IP:** el limitador vive en la memoria de cada instancia de la función. Frena abusos simples, pero no es un límite global exacto.
- **Tamaño de las solicitudes:** Vercel acepta cuerpos de hasta 4.5 MB. Una ficha PDF pesa unos 40 KB, muy por debajo.

## Actualizar

Cada `git push` a `principal` publica una nueva versión de producción. Las otras ramas generan vistas previas con su propia URL. Si una versión falla, en **Deployments** se puede volver a la anterior con **Instant Rollback**.
