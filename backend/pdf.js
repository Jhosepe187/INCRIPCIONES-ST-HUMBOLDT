import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
const crest=fileURLToPath(new URL('../assets/escudo.png',import.meta.url));
const GREEN='#00a651',BLUE='#353292';
const MONTHS=['MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SETIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
export function pensionFor(total,index,month) {
  if(index>2)return 'Consultar';
  if(total===2&&index===0&&month===9)return 'S/ 480.00';
  return ['S/ 500.00','S/ 470.00','S/ 450.00'][index];
}
export function createPdf(data) {
  return new Promise((resolve,reject)=>{
    const doc=new PDFDocument({size:'A4',margin:0,autoFirstPage:false,info:{Title:'Ficha familiar de matrícula 2027'}});
    const chunks=[];
    doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
    const x=34,w=527;
    function text(value,left,top,width,size=9,bold=false,color='#222',height=25){
      const content=String(value??'');doc.font(bold?'Helvetica-Bold':'Helvetica');
      while(size>5&&doc.fontSize(size).heightOfString(content,{width})>height)size-=.25;
      doc.fontSize(size).fillColor(color).text(content,left,top,{width,height,lineBreak:true});
    }
    function bar(label,top,color=GREEN,width=w){
      doc.roundedRect(x,top,width,24,5).fill(color);text(label,x+6,top+7,width-12,10,true,'#fff',15);
    }
    function field(label,value,left,top,width,labelWidth=90){
      text(label,left,top+7,labelWidth-4,8,true,'#222',20);
      doc.roundedRect(left+labelWidth,top,width-labelWidth,24,5).lineWidth(.8).strokeColor('#333').stroke();
      text(value,left+labelWidth+5,top+4,width-labelWidth-10,9,false,'#222',19);
    }
    function table(top,widths,rows,colors,rowHeight=19){
      let y=top;
      rows.forEach((row,r)=>{let left=x;row.forEach((value,c)=>{
        const fill=colors(r,c);doc.lineWidth(.5).rect(left,y,widths[c],rowHeight).fillAndStroke(fill,'#555');
        const color=fill!=='#fff'?'#fff':String(value).startsWith('B01-')?'#e22':'#222';
        text(value,left+4,y+6,widths[c]-8,c===0?8:8.5,c<2,color,rowHeight-5);left+=widths[c];
      });y+=rowHeight;});return y;
    }
    const total=data.estudiantes.length;
    for(let offset=0;offset<total;offset+=3){
      const siblings=data.estudiantes.slice(offset,offset+3),n=siblings.length;doc.addPage();
      bar('DATOS INFORMATIVOS',28,GREEN,405);
      doc.roundedRect(484,18,77,76,6).fill(BLUE);doc.image(crest,493,23,{fit:[59,65]});
      bar('DATOS ESTUDIANTE',66,BLUE,128);
      siblings.forEach((s,i)=>{const y=100+i*28;
        field('Apellidos y nombres',s.nombre,x,y,345,94);
        field('Grado',`${s.grado} ${s.nivel}`,386,y,79,28);
        field('DNI',s.dni,472,y,89,22);
      });
      const familyTop=108+n*28;bar('DATOS MADRE/PADRE Y/O APODERADO',familyTop);
      const mother=data.contactos.find(c=>c.parentesco==='Madre'),father=data.contactos.find(c=>c.parentesco==='Padre');
      const guardians=data.contactos.filter(c=>c.parentesco==='Apoderado/a');
      const contacts=[mother||guardians[0],father||guardians[mother?0:1]];
      contacts.forEach((c,i)=>{const y=familyTop+32+i*31;
        field(c?.parentesco||(i?'Padre':'Madre'),c?.nombre,x,y,423,94);field('DNI',c?.dni,464,y,97,23);
      });
      field('Cel. contacto 1',contacts[0]?.celular,150,familyTop+94,194,78);
      field('Cel. contacto 2',contacts[1]?.celular,355,familyTop+94,206,78);
      field('Correo electrónico',data.correo,x,familyTop+126,w,94);
      field('Dirección actual',data.direccion,x,familyTop+158,w,94);
      field('Ocupación',data.ocupacion,x,familyTop+190,w,94);
      const paymentTop=familyTop+229;bar('CONTROL DE PAGOS 2027',paymentTop,BLUE);let bottom;
      if(total===1){
        const rows=[['2027','MONTO','B/V','OPERACIÓN','F/OPERACIÓN'],['INSCRIPCIÓN',data.tipo==='nuevo'?'S/ 250.00':'No aplica','B01-','',''],['MATRÍCULA','S/ 450.00','B01-','',''],...MONTHS.map((m,i)=>[m,pensionFor(1,0,i),'B01-','',''])];
        bottom=table(paymentTop+32,[78,90,85,143,131],rows,(r,c)=>r===0?GREEN:c===0?(r<=2?GREEN:BLUE):'#fff');
      }else{
        const fees=[['2027','MONTO','B/V','OPERACIÓN','F/OPERACIÓN','GRADO'],...siblings.map(s=>['INSCRIPCIÓN',data.tipo==='nuevo'?'S/ 250.00':'No aplica','B01-','','',`${s.grado} ${s.nivel}`]),['MATRÍCULA','S/ 450.00','B01-','','','']];
        const feesBottom=table(paymentTop+32,[78,78,62,98,94,117],fees,(r,c)=>r===0||c===0?GREEN:'#fff');
        const moneyWidth=n===3?58:85,receiptWidth=55,remaining=w-78-n*(moneyWidth+receiptWidth);
        const widths=[78,...siblings.flatMap(()=>[moneyWidth,receiptWidth]),remaining/2,remaining/2];
        const rows=[['PENSIONES',...siblings.flatMap(()=>['MONTO','B/V']),'OPERACIÓN','F/OPERACIÓN'],...MONTHS.map((m,i)=>[m,...siblings.flatMap((_s,j)=>[pensionFor(total,offset+j,i),'B01-']),'',''])];
        bottom=table(feesBottom,widths,rows,(r,c)=>r===0||c===0?BLUE:'#fff',18);
      }
      const observationTop=bottom+10,observationHeight=Math.min(62,814-observationTop);
      doc.rect(x,observationTop,86,observationHeight).fillAndStroke(BLUE,'#555');text('OBSERVACIONES',x+3,observationTop+6,80,7.5,true,'#fff',15);
      doc.rect(x+86,observationTop,w-86,observationHeight).strokeColor('#555').stroke();
      const detail=siblings.filter(s=>s.procedencia).map(s=>`${s.nombre}: ${s.procedencia}`).join('; ');
      text(detail,x+91,observationTop+5,w-96,7,false,'#222',observationHeight-8);
      for(let i=1;i<3;i++)doc.moveTo(x+86,observationTop+i*observationHeight/3).lineTo(x+w,observationTop+i*observationHeight/3).stroke();
      text(`Montos según ficha de referencia. No acredita pagos.${total>3?` Grupo ${offset/3+1}; desde el cuarto alumno, consultar tarifa.`:''}`,x,824,w,7,false,'#555',12);
    }
    doc.end();
  });
}
