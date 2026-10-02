'use strict';
let officeVersion=0,payrollVersion=0,payrollEntries=[],activePayroll=null,payrollPreviewVersion=0,payrollTimer;
const accountingFields={gasto:'Gasto / inventario',proveedor:'Proveedores por pagar',proveedor_ds:'Documento soporte por pagar',iva19:'IVA descontable 19%',iva5:'IVA descontable 5%',retefte:'ReteFuente',reteiva:'ReteIVA',reteica:'ReteICA',comprobante:'Comprobante compras',comprobante_nc:'Comprobante notas crédito',comprobante_ds:'Comprobante documento soporte',comprobante_ajuste_ds:'Comprobante ajuste soporte',comprobante_nomina:'Comprobante nómina',centro:'Centro de costo'};
const companyExtra=document.createElement('div');
companyExtra.innerHTML='<label>Municipio de ICA<input id="companyCity" maxlength="100"></label><label><input id="companyAgent" type="checkbox"> La empresa es agente retenedor de IVA</label>';
$('#companyError').before(companyExtra);
$('#companyName').required=false;$('#companyName').placeholder='Opcional: se completa con el XML';
$('#upload').textContent='Importar';
$('#drop b').textContent='Arrastra tus archivos aquí';
$('#drop div span').textContent='Detectamos facturas, nómina, token DIAN, maestros y planos históricos.';
$('#drop .file-types').textContent='XML · ZIP · JSON · Excel · CSV';
$('#files').setAttribute('aria-label','Importar documentos y hojas de parametrización');
$('#officeImport').onclick=$('#payrollImport').onclick=chooseFiles;

async function loadOffice(){
  const company=activeCompany,version=++officeVersion;
  if(!company){$('#officeStatus').textContent='Crea o selecciona una empresa.';return;}
  try{
    const data=await api('/api/oficina?nit='+encodeURIComponent(company));
    if(version!==officeVersion||company!==activeCompany)return;
    const cfg=data.configuracion;
    $('#officeFields').innerHTML=Object.entries(accountingFields).map(([key,label])=>`<label>${label}<input data-config="${key}" value="${esc(cfg[key]||(key==='comprobante_nomina'?'00004':''))}" inputmode="numeric" maxlength="12" required><small>${esc(cfg.maestro?.[cfg[key]]?.nombre||'')}</small></label>`).join('')+`<label>Municipio de ICA<input data-config="municipio" value="${esc(cfg.municipio||'')}"></label><label><input id="officeAgent" type="checkbox" ${cfg.agente_iva?'checked':''}> Agente retenedor de IVA</label>`;
    $('#masterTable').innerHTML='<table><thead><tr><th>Cuenta</th><th>Nombre</th><th>Activa</th><th>Recibe movimientos</th></tr></thead><tbody>'+Object.entries(cfg.maestro||{}).map(([account,row])=>`<tr><td>${esc(account)}</td><td>${esc(row.nombre)}</td><td>${row.activa?'Sí':'No'}</td><td>${row.recibe?'Sí':'No'}</td></tr>`).join('')+'</tbody></table>';
    $('#tokenTable').innerHTML='<table><thead><tr><th>Documento</th><th>Fecha</th><th>Total del reporte</th><th>Conciliación</th></tr></thead><tbody>'+data.tokens.map(row=>`<tr><td>${esc(row.documento)}</td><td>${esc(row.fecha)}</td><td>${esc(money(row.total))}</td><td>${esc(row.estado)}</td></tr>`).join('')+'</tbody></table>';
    $('#officeStatus').textContent=`${Object.keys(cfg.maestro||{}).length} cuentas en el maestro · ${data.tokens.length} documentos del reporte DIAN.`;
  }catch(error){if(version===officeVersion)$('#officeStatus').textContent=error.message;}
}
$('#officeForm').onsubmit=async e=>{
  e.preventDefault();if(busy||!activeCompany)return;
  const cfg={...companyConfig(),agente_iva:$('#officeAgent').checked};
  document.querySelectorAll('[data-config]').forEach(input=>cfg[input.dataset.config]=input.value.trim());
  setBusy(true);$('#officeStatus').textContent='Guardando configuración…';
  try{await api('/api/empresas',{...cfg,_anterior:state.empresas.find(c=>c.nit===activeCompany)});await loadState();await loadInvoices();await loadOffice();$('#officeStatus').textContent='Configuración guardada. Puedes deshacerla desde Últimos cambios.';}
  catch(error){$('#officeStatus').textContent=error.message;}finally{setBusy(false);}
};
$('#importTokenPaste').onclick=async()=>{
  if(busy)return;
  const content=$('#tokenPaste').value.trim();
  try{JSON.parse(content);}catch{notify('El token debe ser JSON válido.',true);return;}
  await uploadFiles([new File([content],'token.json',{type:'application/json'})]);
};

async function loadPayroll(){
  const company=activeCompany,version=++payrollVersion;
  try{
    const rows=company?await api('/api/nominas?nit='+encodeURIComponent(company)):[];
    if(version!==payrollVersion||company!==activeCompany)return;
    payrollEntries=rows;renderPayroll();
  }catch(error){if(version===payrollVersion)$('#payrollStatus').textContent=error.message;}
}
function payrollFiltered(){return payrollEntries.filter(r=>!$('#payrollMonth').value||r.periodo===$('#payrollMonth').value);}
function renderPayroll(){
  const rows=payrollFiltered();
  $('#payrollTable').innerHTML='<table><thead><tr><th>Documento</th><th>Empleado</th><th>Período</th><th>Devengados</th><th>Deducciones</th><th>Neto</th><th>Revisión</th></tr></thead><tbody>'+rows.map(r=>`<tr><td><button class="button" data-payroll-open="${r.id}">${esc(r.documento)}</button></td><td>${esc(r.empleado)}<small>${esc(r.nit_empleado)}</small></td><td>${esc(r.periodo)}</td><td>${esc(money(r.devengado))}</td><td>${esc(money(r.deducido))}</td><td>${esc(money(r.neto))}</td><td>${esc(reviewNames[r.revision])}</td></tr>`).join('')+'</tbody></table>';
  const ready=rows.filter(r=>r.revision==='lista').length;
  $('#generatePayroll').disabled=!ready||busy;$('#generatePayroll').textContent=`Generar plano (${ready})`;
  $('#payrollStatus').textContent=`${rows.length} nóminas · ${ready} listas. Los ajustes de nómina requieren revisión de su documento de origen.`;
}
$('#payrollMonth').onchange=renderPayroll;
$('#payrollTable').onclick=e=>{
  const button=e.target.closest('[data-payroll-open]');if(!button||busy)return;
  activePayroll=payrollEntries.find(r=>r.id===button.dataset.payrollOpen);
  const row=activePayroll;
  $('#payrollTitle').textContent=row.documento+' · '+row.empleado;
  $('#payrollDetail').innerHTML=(row.errores.length?'<p class="error-text">'+row.errores.map(esc).join(' · ')+'</p>':'')+'<div class="tablewrap"><table><thead><tr><th>Concepto</th><th>Movimiento</th><th>Valor</th><th>Cuenta</th></tr></thead><tbody>'+row.conceptos.map(c=>`<tr><td>${esc(c.nombre)}</td><td>${c.tipo==='1'?'Débito':'Crédito'}</td><td>${esc(money(c.valor))}</td><td><input data-payroll-key="${esc(c.clave)}" value="${esc(row.cuentas[c.clave]||'')}" inputmode="numeric" maxlength="12" aria-label="Cuenta ${esc(c.nombre)}"></td></tr>`).join('')+'</tbody></table></div>';
  $('#rememberPayroll').checked=false;$('#payrollDialog').showModal();previewPayroll();
};
function payrollAccounts(){return Object.fromEntries([...document.querySelectorAll('[data-payroll-key]')].map(i=>[i.dataset.payrollKey,i.value.trim()]));}
function closePayroll(){if(busy)return;if(activePayroll&&JSON.stringify(payrollAccounts())!==JSON.stringify(activePayroll.cuentas)&&!confirm('Hay cuentas de nómina sin guardar. ¿Descartarlas?'))return;$('#payrollDialog').close();activePayroll=null;payrollPreviewVersion++;clearTimeout(payrollTimer);}
$('#closePayroll').onclick=closePayroll;$('#payrollDialog').addEventListener('cancel',e=>{e.preventDefault();closePayroll();});
function previewPayroll(){
  clearTimeout(payrollTimer);const version=++payrollPreviewVersion;
  if(!activePayroll)return;
  const id=activePayroll.id;$('#payrollPreview').textContent='Calculando asiento…';
  payrollTimer=setTimeout(async()=>{
    try{const result=await api('/api/nominas/preview',{nit:activeCompany,id,cuentas:payrollAccounts()});if(version!==payrollPreviewVersion||activePayroll?.id!==id)return;
      $('#payrollPreview').innerHTML='<p>✓ Asiento balanceado</p><div class="tablewrap"><table><thead><tr><th>Cuenta</th><th>Concepto</th><th>Movimiento</th><th>Valor</th></tr></thead><tbody>'+result.filas.map(r=>`<tr><td>${esc(r[0])}</td><td>${esc(r[6])}</td><td>${r[7]==='1'?'Débito':'Crédito'}</td><td>${esc(money(r[8]))}</td></tr>`).join('')+'</tbody></table></div>';
    }catch(error){if(version===payrollPreviewVersion)$('#payrollPreview').textContent=error.message;}
  },250);
}
$('#payrollDetail').oninput=previewPayroll;
$('#savePayroll').onclick=async()=>{
  if(busy||!activePayroll)return;setBusy(true);
  try{await api('/api/nominas/cuentas',{nit:activeCompany,id:activePayroll.id,cuentas:payrollAccounts(),recordar:$('#rememberPayroll').checked});await loadState();await loadPayroll();activePayroll=payrollEntries.find(r=>r.id===activePayroll.id);await loadChangeHistory();$('#payrollPreview').textContent='Cuentas guardadas. El cambio se puede deshacer.';previewPayroll();}
  catch(error){$('#payrollPreview').textContent=error.message;}finally{setBusy(false);renderPayroll();}
};
$('#generatePayroll').onclick=async()=>{
  if(busy)return;const ids=payrollFiltered().filter(r=>r.revision==='lista').map(r=>r.id);if(!ids.length)return;
  if(!confirm(`Generar una versión del plano para ${ids.length} nóminas?`))return;
  setBusy(true);$('#payrollStatus').textContent='Generando nómina…';
  try{const result=await api('/api/nominas/generar',{nit:activeCompany,ids});showDownloads(result);await loadState();await loadInvoices();showViewAfterBusy='history';$('#payrollStatus').textContent='Plano generado. Descárgalo desde Historial.';}
  catch(error){$('#payrollStatus').textContent=error.message;}finally{setBusy(false);if(showViewAfterBusy){const view=showViewAfterBusy;showViewAfterBusy='';showView(view);}}
};
let showViewAfterBusy='';
async function acceptInline(id){
  const invoice=invoices.find(d=>d.id===id);if(busy||!invoice)return;setBusy(true);notify('Aplicando sugerencias…');
  try{await api('/api/facturas/aceptar-sugerencias',{nit:activeCompany,id,firma:invoice.firma_revision});await loadInvoices();notify('Cuentas sugeridas aplicadas. Puedes deshacer el cambio.');}
  catch(error){notify(error.message,true);}finally{setBusy(false);}
}
async function approveInline(id){
  const invoice=invoices.find(d=>d.id===id);if(busy||!invoice)return;setBusy(true);
  try{await api('/api/facturas/aprobar',{nit:activeCompany,firmas:{[id]:invoice.firma_revision}});await loadInvoices();notify('Avisos revisados. La factura quedó lista para el plano.');}
  catch(error){notify(error.message,true);}finally{setBusy(false);}
}
$('#approveFiltered').onclick=async()=>{
  if(busy)return;
  const rows=filtered().filter(d=>d.estado==='lista'&&!d.aprobada);
  if(!rows.length)return;
  if(!confirm(rows.map(r=>r.documento+': '+r.motivos_revision.join(' · ')).join('\n')+'\n\n¿Confirmas que revisaste estos avisos?'))return;
  setBusy(true);
  try{await api('/api/facturas/aprobar',{nit:activeCompany,firmas:Object.fromEntries(rows.map(r=>[r.id,r.firma_revision]))});await loadInvoices();notify('Avisos aprobados. Las facturas quedaron disponibles para generar el plano.');}
  catch(error){notify(error.message,true);}finally{setBusy(false);}
};
$('#reclassifyInvoices').onclick=async()=>{
  if(busy||!activeCompany)return;
  const ids=filtered().map(r=>r.id);
  if(!ids.length){notify('No hay documentos en el listado filtrado.');return;}
  setBusy(true);notify('Revisando tipo, tratamiento y tercero de los documentos…');
  try{
    const result=await api('/api/facturas/reclasificar',{nit:activeCompany,ids});
    // Mostrar éxito únicamente después de que la transacción y la recarga terminen.
    await loadInvoices();await loadChangeHistory();
    console.group('Diagnóstico de reclasificación');
    console.table(Object.entries(result.diagnostico.por_fuente).map(([fuente,cantidad])=>({fuente,cantidad})));
    if(result.diagnostico.incidencias.length)console.table(result.diagnostico.incidencias);
    console.groupEnd();
    notify(`${result.revisadas} documentos revisados · ${result.actualizadas} actualizados · ${result.diagnostico.incidencias.length} incidencias. ${result.id?'Puedes deshacer desde Últimos cambios.':'Sin cambios que guardar.'}`);
  }catch(error){notify('No se pudo completar la reclasificación: '+error.message,true);}
  finally{setBusy(false);}
};
window.gravimentesOfficeReady=true;
