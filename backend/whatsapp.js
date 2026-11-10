import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright-core';

const chatUrl = 'https://web.whatsapp.com/send?phone=51901648212';
const profile = fileURLToPath(new URL('../work/whatsapp-profile/', import.meta.url));
let context;
let tab;
let lastFileName;
let attaching = false;

function whatsappError(status, message) {
  return Object.assign(new Error(message), {status});
}

async function openBrowser() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launchPersistentContext(profile, {channel, headless: false, timeout: 10000});
    } catch (error) {
      // Fall back to Edge only when Chrome is unavailable, not when the profile is in use.
      if (!error.message.includes('Executable doesn\'t exist')) break;
    }
  }
  throw whatsappError(503, 'No se pudo abrir la sesión de WhatsApp. Comprueba que Chrome o Edge esté instalado y cierra cualquier ventana de WhatsApp del portal que haya quedado abierta.');
}

export async function attachEnrollmentPdf(pdf) {
  if (attaching) throw whatsappError(409, 'Ya se está preparando un PDF en WhatsApp. Espera a que termine.');
  attaching = true;
  try {
    if (!context) {
      context = await openBrowser();
      context.on('close', () => { context = undefined; tab = undefined; });
    }
    if (!tab || tab.isClosed()) {
      tab = context.pages().find(page => page.url() === 'about:blank') || await context.newPage();
    }
    const page = tab;
    await page.bringToFront();
    const send = page.getByRole('button', {name: /^(Enviar|Send)$/i});
    if (lastFileName && await page.getByText(lastFileName, {exact: true}).first().isVisible() && await send.first().isVisible()) {
      throw whatsappError(409, 'Ya hay una ficha pendiente en WhatsApp. Envíala o cierra la vista previa antes de adjuntar otra.');
    }
    await page.goto(chatUrl, {waitUntil: 'domcontentloaded', timeout: 15000});
    const attach = page.locator('#main footer').getByRole('button', {name: /^(Adjuntar|Attach)$/i});
    try {
      await attach.waitFor({state: 'visible', timeout: 20000});
    } catch {
      throw whatsappError(409, 'Revisa la ventana de WhatsApp Web. Si aparece el QR, vincula tu cuenta con el celular y vuelve a pulsar Compartir PDF.');
    }
    const header = page.locator('#main header');
    const chat = await header.innerText({timeout: 5000});
    await attach.click({timeout: 5000});
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', {timeout: 5000}),
      page.getByRole('menuitem', {name: /^(Documento|Document)$/i}).click({timeout: 5000})
    ]);
    if (await header.innerText({timeout: 5000}) !== chat) {
      throw whatsappError(409, 'El chat cambió durante la preparación. Pulsa Compartir PDF para volver al chat del colegio.');
    }
    lastFileName = `matricula-2027-${randomUUID().slice(0, 8)}.pdf`;
    await chooser.setFiles({name: lastFileName, mimeType: 'application/pdf', buffer: pdf}, {timeout: 5000});
    await page.getByText(lastFileName, {exact: true}).waitFor({state: 'visible', timeout: 7000});
    await send.first().waitFor({state: 'visible', timeout: 5000});
    await page.bringToFront();
  } catch (error) {
    if (error.status) throw error;
    throw whatsappError(502, 'No pude confirmar que el PDF quedó adjunto. Revisa la ventana de WhatsApp Web antes de volver a intentar.');
  } finally {
    attaching = false;
  }
}
