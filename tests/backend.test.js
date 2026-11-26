// Pruebas del backend PHP. Levantan el servidor integrado de PHP sobre public/ y servicios
// falsos de Google Apps Script y ApisPerú: no escriben en Google ni consumen consultas reales.
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const KEY = '10000000-0000-4000-8000-000000000001';
export const sample = {tipo:'nuevo',estudiantes:[{nombre:'ESTUDIANTE DE PRUEBA',dni:'00123456',grado:'1.º',nivel:'Primaria',procedencia:'Colegio de prueba'}],contactos:[{parentesco:'Madre',nombre:'CONTACTO DE PRUEBA',dni:'00012345',celular:'900000000'}],correo:'prueba@example.com',direccion:'Dirección de prueba',ocupacion:'Docente'};

const googleCalls = [];
const dniCalls = [];
let upstream, upstreamBase, server, tempDir;

async function freePort() {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const {port} = probe.address();
  await new Promise(resolve => probe.close(resolve));
  return port;
}
async function startPhp(env) {
  const port = await freePort();
  const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(GOOGLE_SCRIPT_|APISPERU_|MATRICULAS_)/.test(name)));
  const child = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', join(root, 'public')], {env: {...clean, ...env}, stdio: 'ignore'});
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { await fetch(base + '/'); return {base, stop: () => child.kill()}; } catch { await sleep(50); }
  }
  child.kill();
  throw new Error('No se pudo iniciar PHP. Instálalo (PHP 8.0 o superior) para ejecutar las pruebas.');
}
const post = (base, path, data, headers = {}) => fetch(base + path, {
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Idempotency-Key': KEY, ...headers},
  body: typeof data === 'string' ? data : JSON.stringify(data),
});

before(async () => {
  upstream = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    if (req.method === 'POST' && url.pathname === '/google') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      googleCalls.push(payload);
      const result = payload.secret !== 'clave-de-prueba' ? {ok: false, error: 'Clave incorrecta'}
        : payload.data.correo === 'error@example.com' ? {ok: false, error: 'Google no confirmó'}
        : payload.data.correo === 'duplicado@example.com' ? {ok: false, error: 'Ese DNI ya está registrado en ese grado.', status: 409}
        : {ok: true};
      // Como Apps Script: responde 302 y el resultado se obtiene con GET.
      res.writeHead(302, {Location: '/google-result?r=' + encodeURIComponent(JSON.stringify(result))});
      return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/google-result') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      return res.end(url.searchParams.get('r'));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/dni/')) {
      const dni = url.pathname.slice(5);
      dniCalls.push({url: req.url, authorization: req.headers.authorization});
      if (dni === '00000404') { res.writeHead(404); return res.end('{}'); }
      res.writeHead(200, {'Content-Type': 'application/json'});
      return res.end(JSON.stringify({dni, nombres: 'NOMBRE PRUEBA', apellidoPaterno: 'APELLIDO', apellidoMaterno: 'SEGUNDO'}));
    }
    res.writeHead(404);
    res.end();
  }).listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  upstreamBase = `http://127.0.0.1:${upstream.address().port}`;
  tempDir = mkdtempSync(join(tmpdir(), 'matriculas-pruebas-'));
  server = await startPhp({
    GOOGLE_SCRIPT_URL: upstreamBase + '/google',
    GOOGLE_SCRIPT_SECRET: 'clave-de-prueba',
    APISPERU_TOKEN: 'token-secreto',
    APISPERU_URL: upstreamBase + '/dni/',
    MATRICULAS_RATE_DIR: join(tempDir, 'limites'),
    MATRICULAS_CONFIG: join(tempDir, 'sin-config.php'),
  });
});
after(() => {
  server?.stop();
  upstream?.close();
  if (tempDir) rmSync(tempDir, {recursive: true, force: true});
});

test('validación conserva ceros y rechaza grados, DNI duplicados y parentescos inválidos', async () => {
  const ok = await post(server.base, '/api/matriculas.php', sample);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), {ok: true, id: KEY, alumnos: 1});
  const saved = googleCalls.at(-1);
  assert.equal(saved.id, KEY);
  assert.equal(saved.data.estudiantes[0].dni, '00123456');
  assert.equal(saved.data.estudiantes[0].grado, '1.º');
  const rejected = async (data, pattern, headers) => {
    const response = await post(server.base, '/api/matriculas.php', data, headers);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, pattern);
  };
  await rejected({...sample, estudiantes: [{...sample.estudiantes[0], nivel: 'Secundaria', grado: '6.º'}]}, /grado no corresponde/);
  await rejected({...sample, estudiantes: [...sample.estudiantes, ...sample.estudiantes]}, /mismo DNI/);
  await rejected({...sample, contactos: [{...sample.contactos[0], parentesco: 'otro'}]}, /parentesco/);
  await rejected({}, /tipo de matrícula/);
  await rejected('{no es json', /formato válido/);
  await rejected(sample, /identificador de envío/, {'Idempotency-Key': 'corto'});
});

test('fichas de 1, 2, 3 y 4 hermanos: una página por cada tres y tarifas de las referencias', () => {
  const php = (args, input) => spawnSync('php', [join(root, 'tests/php/pdf.php'), ...args], {input, maxBuffer: 1 << 24});
  for (const total of [1, 2, 3, 4]) {
    const data = {...sample, estudiantes: Array.from({length: total}, (_, i) => ({...sample.estudiantes[0], dni: String(i).padStart(8, '0')}))};
    const result = php([], JSON.stringify(data));
    assert.equal(result.status, 0, result.stderr.toString());
    const pdf = result.stdout;
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, Math.ceil(total / 3));
  }
  const pension = (...args) => php(['pension', ...args.map(String)]).stdout.toString();
  assert.equal(pension(2, 0, 9), 'S/ 480.00');
  assert.equal(pension(2, 1, 9), 'S/ 470.00');
  assert.equal(pension(3, 0, 9), 'S/ 500.00');
  assert.equal(pension(3, 2, 9), 'S/ 450.00');
  assert.equal(pension(4, 3, 0), 'Consultar');
});

test('CSS original y animaciones idénticos a FRONTED FINAL', () => {
  const baseline = execFileSync('git', ['show', '54241f4:estilos.css'], {encoding: 'utf8'});
  const current = readFileSync(new URL('../public/css/estilos.css', import.meta.url), 'utf8');
  assert.equal(current.replace(/\r\n/g, '\n'), baseline.replace(/\r\n/g, '\n'));
});

test('consulta DNI: nombres, dirección ausente, fallos y token solo en Authorization', async () => {
  assert.equal((await post(server.base, '/api/dni.php', {dni: '123'})).status, 400);
  const found = await post(server.base, '/api/dni.php', {dni: '00012345'});
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), {dni: '00012345', nombre: 'APELLIDO SEGUNDO NOMBRE PRUEBA', direccion: ''});
  const call = dniCalls.at(-1);
  assert.ok(!call.url.includes('token-secreto'));
  assert.equal(call.authorization, 'Bearer token-secreto');
  const missing = await post(server.base, '/api/dni.php', {dni: '00000404'});
  assert.equal(missing.status, 404);
  assert.match((await missing.json()).error, /completa los datos manualmente/);
});

test('API: PDF solo tras confirmar Google, errores reales, origen y rutas privadas', async () => {
  const pdf = await post(server.base, '/api/matriculas.php', sample, {Accept: 'application/pdf'});
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  assert.match(pdf.headers.get('content-disposition'), /matricula-2027\.pdf/);
  const bytes = Buffer.from(await pdf.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 1000);

  const failed = await post(server.base, '/api/matriculas.php', {...sample, correo: 'error@example.com'}, {Accept: 'application/pdf'});
  assert.equal(failed.status, 502);
  assert.match(failed.headers.get('content-type'), /application\/json/);
  assert.equal((await failed.json()).error, 'Google no confirmó');
  const duplicate = await post(server.base, '/api/matriculas.php', {...sample, correo: 'duplicado@example.com'});
  assert.equal(duplicate.status, 409);

  assert.equal((await fetch(server.base + '/api/matriculas.php')).status, 405);
  assert.equal((await post(server.base, '/api/matriculas.php', sample, {Origin: 'https://otro-sitio.example'})).status, 403);
  assert.equal((await post(server.base, '/api/matriculas.php', sample, {Origin: server.base})).status, 200);

  // El código interno de PHP responde 404 aunque se pida directamente.
  for (const path of ['/api/lib/bootstrap.php', '/api/lib/pdf.php', '/api/lib/validacion.php', '/api/lib/fuentes.php', '/api/lib/dni.php', '/api/lib/sheets.php', '/api/config.example.php']) {
    const response = await fetch(server.base + path);
    assert.equal(response.status, 404, path);
    assert.equal(await response.text(), '', path);
  }
  // Lo que está fuera de public/ no se publica: el servidor de pruebas de PHP devuelve la portada en su lugar.
  for (const path of ['/.env', '/google-apps-script/Code.gs', '/tests/php/pdf.php', '/package.json']) {
    const body = await (await fetch(server.base + path)).text();
    assert.equal(/BACKEND_SECRET|GOOGLE_SCRIPT|<\?php|"devDependencies"/.test(body), false, path);
  }
});

test('sin configuración responde con un mensaje claro y sin exponer detalles', async t => {
  const bare = await startPhp({MATRICULAS_CONFIG: join(tempDir, 'sin-config.php'), MATRICULAS_RATE_DIR: join(tempDir, 'limites-sin-config')});
  t.after(() => bare.stop());
  const dni = await post(bare.base, '/api/dni.php', {dni: '00012345'});
  assert.equal(dni.status, 503);
  assert.match((await dni.json()).error, /no está configurada/);
  const save = await post(bare.base, '/api/matriculas.php', sample);
  assert.equal(save.status, 503);
  assert.match((await save.json()).error, /Google Sheets/);
});

test('límite de consultas DNI: después de 10 por minuto responde 429', async () => {
  let response;
  for (let i = 0; i < 12; i++) {
    response = await post(server.base, '/api/dni.php', {dni: '00012345'});
    if (response.status === 429) break;
  }
  assert.equal(response.status, 429);
  assert.ok(Number(response.headers.get('retry-after')) > 0);
});
