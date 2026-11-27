// Punto de entrada en Vercel: publica la app Express como una Vercel Function.
// vercel.json envía aquí todas las rutas /api/*; el frontend (public/) lo sirve la CDN de Vercel.
// En local se sigue usando `npm start` (backend/server.js).
import {createApp} from '../backend/server.js';

export default createApp();
