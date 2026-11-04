export function normalizePerson(payload,dni){
  const person=payload?.data||payload;
  const nombre=[person?.apellidoPaterno||person?.apellido_paterno,person?.apellidoMaterno||person?.apellido_materno,person?.nombres].filter(Boolean).join(' ').trim();
  if(!nombre||person?.success===false||(person?.dni&&String(person.dni)!==dni)){
    const e=new Error('No se encontraron nombres para ese DNI. Revisa el número o completa los datos manualmente.');e.status=404;throw e;
  }
  return {dni,nombre,direccion:typeof person.direccion==='string'?person.direccion.trim():''};
}
export async function lookupDni(dni,{token=process.env.APISPERU_TOKEN,fetcher=fetch}={}){
  if(!/^\d{8}$/.test(dni||'')){const e=new Error('El DNI debe tener 8 dígitos.');e.status=400;throw e;}
  if(!token){const e=new Error('La consulta de DNI no está configurada. Puedes completar los datos manualmente.');e.status=503;throw e;}
  try{
    const response=await fetcher(`https://dniruc.apisperu.com/api/v1/dni/${dni}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!response.ok){const e=new Error(response.status===429?'Se alcanzó el límite de consultas de DNI. Completa los datos manualmente.':'ApisPerú no pudo consultar ese DNI. Revisa el número o completa los datos manualmente.');e.status=response.status===404?404:502;throw e;}
    return normalizePerson(await response.json(),dni);
  }catch(error){if(error.status)throw error;const e=new Error('La consulta de DNI no está disponible en este momento. Puedes completar los datos manualmente.');e.status=502;throw e;}
}
