import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {fileURLToPath} from 'node:url';
import {validate} from './validation.js';
import {createPdf} from './pdf.js';
import {lookupDni} from './dni.js';

export function createApp({save=saveToSheets,lookup=lookupDni}={}) {
  const app=express();
  app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{'upgrade-insecure-requests':null}}, strictTransportSecurity:process.env.NODE_ENV==='production'?undefined:false}));
  app.use(express.json({limit:'128kb'}));
  app.use('/api',rateLimit({windowMs:60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false}));
  app.use('/api',(req,res,next)=>{
    res.set('Cache-Control','no-store');
    const origin=req.get('origin');
    if (origin && origin!==`${req.protocol}://${req.get('host')}`) return res.status(403).json({error:'Origen no permitido.'});
    next();
  });
  app.post('/api/dni',rateLimit({windowMs:60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res,next)=>{
    try{if(!/^\d{8}$/.test(req.body?.dni||''))return res.status(400).json({error:'El DNI debe tener 8 dígitos.'});res.json(await lookup(req.body.dni));}catch(error){next(error);}
  });
  app.post('/api/pdf',async(req,res,next)=>{
    try {const data=validate(req.body); const pdf=await createPdf(data); res.type('pdf').attachment('matricula-2027.pdf').send(pdf);} catch(e){next(e);}
  });
  app.post('/api/matriculas',async(req,res,next)=>{
    try {
      const data=validate(req.body);
      const id=req.get('Idempotency-Key');
      if(!/^[0-9a-f-]{36}$/i.test(id||'')) return res.status(400).json({error:'Falta el identificador de envío.'});
      await save(data,id);
      res.json({ok:true,id,alumnos:data.estudiantes.length});
    }catch(e){next(e);}
  });
  const root=fileURLToPath(new URL('../',import.meta.url));
  app.get('/',(_req,res)=>res.sendFile(root+'index.html'));
  for(const name of ['index.html','estilos.css','integraciones.css','inscripcion.js']) app.get('/'+name,(_req,res)=>res.sendFile(root+name));
  app.use('/assets',express.static(root+'assets'));
  app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.status?error.message:'No se pudo completar la operación. Intenta nuevamente.'}));
  return app;
}
async function saveToSheets(data,id) {
  if(!process.env.GOOGLE_SCRIPT_URL || !process.env.GOOGLE_SCRIPT_SECRET) {
    const e=new Error('Falta activar la conexión con Google Sheets en el servidor.'); e.status=503; throw e;
  }
  try {
    const response=await fetch(process.env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:process.env.GOOGLE_SCRIPT_SECRET,id,data}),signal:AbortSignal.timeout(55000)});
    if(!response.ok) throw new Error();
    const result=await response.json();
    if(!result.ok) {const e=new Error(result.error||'Google Sheets no confirmó el registro.');e.status=result.status===409?409:502;throw e;}
  } catch(e) { if(e.status) throw e; const err=new Error('Google Sheets no confirmó el envío. Puedes reintentar sin duplicar la solicitud.');err.status=502;throw err; }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) createApp().listen(Number(process.env.PORT)||3000,process.env.HOST||'127.0.0.1',()=>console.log('Matrículas: http://localhost:'+(process.env.PORT||3000)));
