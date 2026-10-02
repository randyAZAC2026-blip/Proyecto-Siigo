'use strict';
const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(value,currency='COP')=>{if(value==='')return '—';try{return new Intl.NumberFormat('es-CO',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));}catch{return String(value||0);}};
const statusNames={pendiente:'Por asignar cuentas',lista:'Lista para generar',generada:'Plano generado',error:'Con incidencia'};
const eye='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
let state={empresas:[],lotes:[],defaults:{}}, invoices=[], activeCompany='', activeInvoice=null, busy=false, page=0, selected=new Set(), requestVersion=0;
let reviewQueue=[], reviewingIssues=false, accountingView='invoices';
const reviewNames={lista:'Lista',revisar:'Revisar',error:'Error'};
function generationIds(){return filtered().filter(d=>d.estado==='lista'&&d.aprobada&&(!selected.size||selected.has(d.id))).map(d=>d.id);}
function updateReviewNavigation(){
  const index=reviewQueue.indexOf(activeInvoice?.id);
  $('#reviewPosition').textContent=index<0?'':`${reviewingIssues?'Incidencia ':''}${index+1} de ${reviewQueue.length}`;
  $('#previousInvoice').disabled=busy||index<=0;
  $('#nextInvoice').disabled=busy||index<0||index>=reviewQueue.length-1;
}

async function api(url,data){
  const response=await fetch(url,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'No se pudo completar la operación.');
  return result;
}
function notify(message,error=false){const el=$('#notice');el.textContent=message;el.className='notice'+(error?' error':'');}
function companyConfig(){return {...state.defaults,...state.empresas.find(c=>c.nit===activeCompany)};}
function setBusy(value){
  busy=value;
  for(const selector of ['#upload','#company','#editCompany','#clearHistory','#saveAccounts','#closeInvoice','#generateSelected'])$(selector).disabled=value;
  document.querySelectorAll('[data-account]').forEach(input=>input.readOnly=value);
  document.querySelectorAll('#invoiceDetail .adjustments input,#supplierAccount,#replaceAccounts').forEach(input=>input.disabled=value);
  document.querySelectorAll('#invoiceDetail .supplier-account button,#invoiceDetail .suggestion button').forEach(button=>button.disabled=value);
  document.querySelectorAll('[data-config],[data-payroll-key],#officeAgent,#savePayroll,#rememberPayroll').forEach(input=>input.disabled=value);
  $('#drop').setAttribute('aria-disabled',String(value));
  updateSelection();
  updateReviewNavigation();
}
function updateSelection(){
  const ready=generationIds().length;
  const allReady=invoices.length>0&&invoices.every(d=>d.estado!=='pendiente');
  $('#generateSelected').disabled=busy||ready===0;
  $('#generateSelected').textContent=allReady?`Generar plano (${ready} facturas)`:'Generar plano';
  $('#generateSelected').className=ready?'button primary':'button';
  $('#upload').className=ready?'button':'button primary';
  const issues=filtered().filter(d=>d.revision!=='lista').length;
  $('#reviewIssues').textContent=`Revisar incidencias (${issues})`;
  $('#reviewIssues').disabled=busy||!issues;
  const pending=filtered().filter(d=>d.estado==='lista'&&!d.aprobada);
  $('#approveFiltered').classList.toggle('hidden',!pending.length);$('#approveFiltered').disabled=busy;
  $('#approveFiltered').textContent=`Aprobar avisos (${pending.length})`;
}
async function loadState(){
  state=await api('/api/inicio');
  if(!state.empresas.some(c=>c.nit===activeCompany))activeCompany=state.empresas[0]?.nit||'';
  $('#company').innerHTML=state.empresas.map(c=>`<option value="${esc(c.nit)}">${esc(c.empresa||c.nit)}</option>`).join('')+'<option value="">＋ Nueva empresa</option>';
  $('#company').value=activeCompany;
  renderHistory();
}
async function loadInvoices(){
  const version=++requestVersion;
  const data=activeCompany?await api('/api/facturas?nit='+encodeURIComponent(activeCompany)):[];
  if(version!==requestVersion)return;
  invoices=data;
  selected=new Set([...selected].filter(id=>invoices.some(d=>d.id===id&&d.estado==='lista'&&d.aprobada)));
  renderStats();renderInvoices();
  if(typeof loadChangeHistory==='function')await loadChangeHistory();
}
function renderStats(){
  const cards=[['▤',invoices.length,'FACTURAS RECIBIDAS'],['◷',invoices.filter(d=>['pendiente','error'].includes(d.estado)).length,'POR REVISAR'],['✓',invoices.filter(d=>d.estado==='lista').length,'LISTAS PARA GENERAR'],['↧',invoices.filter(d=>d.estado==='generada').length,'PLANOS GENERADOS']];
  $('#stats').innerHTML=cards.map(([icon,count,label])=>`<div class="stat"><span class="stat-icon">${icon}</span><div><b>${count}</b><small>${label}</small></div></div>`).join('');
  $('#dashboardStats').innerHTML=$('#stats').innerHTML;
  $('#dashboardCompany').textContent=state.empresas.find(c=>c.nit===activeCompany)?.empresa||'Selecciona una empresa';
}
function filtered(){const query=$('#search').value.trim().toLocaleLowerCase();return invoices.filter(d=>(!$('#status').value||d.estado===$('#status').value)&&(!$('#month').value||d.fecha?.slice(0,7)===$('#month').value)&&(!$('#reviewStatus').value||d.revision===$('#reviewStatus').value)&&[d.documento,d.proveedor,d.nit_proveedor].join(' ').toLocaleLowerCase().includes(query));}
function renderInvoices(){
  const rows=filtered(),size=Number($('#pageSize').value),pages=Math.max(1,Math.ceil(rows.length/size));
  page=Math.min(page,pages-1);
  const visible=rows.slice(page*size,(page+1)*size);
  $('#invoiceRows').innerHTML=visible.length?visible.map(d=>{const retencionHtml=d.retenciones&&d.retenciones.length?`<div class="retencion-badge"><b>Retención:</b> ${d.retenciones.map(t=>`${esc(t.nombre)} ${esc(t.tarifa)}%`).join(', ')} (${esc(money(d.retenciones.reduce((s,t)=>s+(Number(t.valor)||0),0)))})</div>`:'';return `<tr><td><input type="checkbox" data-select="${d.id}" aria-label="Seleccionar factura ${esc(d.documento)}" ${selected.has(d.id)?'checked':''} ${d.estado!=='lista'?'disabled':''}></td><td><b>${esc(d.documento)}</b></td><td>${esc(d.proveedor)}<small>NIT ${esc(d.nit_proveedor)}</small></td><td>${esc(d.fecha)}</td><td class="number money">${esc(money(d.total,d.moneda))}</td><td><span class="badge ${d.estado}">${statusNames[d.estado]}</span>${retencionHtml}</td><td class="center"><button class="eye" data-open="${d.id}" title="Ver detalle de la factura" aria-label="Ver factura ${esc(d.documento)}">${eye}</button></td></tr>`}).join(''):`<tr><td colspan="7" class="empty"><b>${invoices.length?'Sin resultados':'Tus facturas aparecerán aquí'}</b>${invoices.length?'Prueba otro filtro o búsqueda.':'Sube documentos XML o ZIP para revisar sus ítems y asignar las cuentas.'}</td></tr>`;
  visible.forEach((d,index)=>{
    const row=$('#invoiceRows').children[index],badge=row.querySelector('.badge');
    badge.textContent=reviewNames[d.revision];badge.className='badge '+({lista:'lista',revisar:'pendiente',error:'error'}[d.revision]);
    row.querySelector('[data-select]').disabled=d.estado!=='lista'||!d.aprobada;
    if(d.estado==='generada'){const stateLabel=document.createElement('small');stateLabel.textContent='Plano disponible en Historial';row.children[1].append(stateLabel);}
    if(d.motivos_revision.length){const reasons=document.createElement('small');reasons.textContent=d.motivos_revision.join(' · ');row.children[5].append(reasons);}
    const suggestions=(d.sugerencias||[]).filter(Boolean);
    if(suggestions.length){const btn=document.createElement('button');btn.className='button';btn.dataset.acceptSuggestion=d.id;btn.textContent='Aceptar sugerencia';btn.title=suggestions.map(s=>s.cuenta+' · '+s.confianza+'%').join(', ');row.children[6].append(btn);}
    if(d.estado==='lista'&&!d.aprobada){const btn=document.createElement('button');btn.className='button';btn.dataset.approveInvoice=d.id;btn.textContent='Aprobar avisos';row.children[6].append(btn);}
  });
  $('#pageInfo').textContent=rows.length?`${page*size+1}–${Math.min((page+1)*size,rows.length)} de ${rows.length} facturas`:'0 facturas';
  $('#prev').disabled=page===0;$('#next').disabled=page>=pages-1;
  const ready=visible.filter(d=>d.estado==='lista'&&d.aprobada);
  $('#selectAll').checked=ready.length>0&&ready.every(d=>selected.has(d.id));
  $('#selectAll').indeterminate=ready.some(d=>selected.has(d.id))&&!$('#selectAll').checked;
  $('#selectAll').disabled=!ready.length;
  updateSelection();
  if(typeof scheduleBatchPreview==='function')scheduleBatchPreview();
}
function showCompany(fresh=false){
  const conf=fresh?{}:companyConfig();
  $('#companyNit').value=conf.nit||'';$('#companyName').value=conf.empresa||'';$('#companyError').textContent='';
  $('#companyCity').value=conf.municipio||'';$('#companyAgent').checked=Boolean(conf.agente_iva);
  $('#companyDialog').showModal();
}
$('#editCompany').onclick=()=>showCompany();
$('#cancelCompany').onclick=()=>{$('#companyDialog').close();$('#company').value=activeCompany;};
$('#companyDialog').addEventListener('close',()=>$('#company').value=activeCompany);
$('#companyForm').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const nit=$('#companyNit').value.trim(),empresa=$('#companyName').value.trim()||'Empresa '+nit;
  const previous=state.empresas.find(c=>c.nit===nit);
  setBusy(true);
  try{await api('/api/empresas',{...state.defaults,...previous,nit,empresa,municipio:$('#companyCity').value.trim(),agente_iva:$('#companyAgent').checked,_anterior:previous});activeCompany=nit;selected.clear();page=0;await loadState();await loadInvoices();$('#companyDialog').close();notify('Empresa guardada. Ya puedes cargar tus facturas.');}
  catch(error){$('#companyError').textContent=error.message;}
  finally{setBusy(false);}
};
$('#company').onchange=async event=>{
  if(!event.target.value){showCompany(true);return;}
  activeCompany=event.target.value;selected.clear();page=0;$('#downloads').textContent='';$('#currentPreview').innerHTML='<h2>Asiento actual</h2><p>Abre una factura de esta empresa.</p>';setBusy(true);
  try{await loadInvoices();renderHistory();if(!$('#officeView').classList.contains('hidden'))await loadOffice();if(!$('#payrollView').classList.contains('hidden'))await loadPayroll();}catch(error){notify(error.message,true);}finally{setBusy(false);}
};
function chooseFiles(){if(busy)return;if(!activeCompany){showCompany(true);return;}$('#files').click();}
$('#upload').onclick=chooseFiles;$('#drop').onclick=chooseFiles;
$('#drop').onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseFiles();}};
$('#drop').ondragover=event=>{event.preventDefault();if(!busy)$('#drop').classList.add('drag');};
$('#drop').ondragleave=()=>$('#drop').classList.remove('drag');
$('#drop').ondrop=event=>{event.preventDefault();$('#drop').classList.remove('drag');uploadFiles([...event.dataTransfer.files]);};
$('#files').onchange=event=>{const files=[...event.target.files];event.target.value='';uploadFiles(files);};
function encodeFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('No se pudo leer el documento.'));reader.onload=()=>resolve({nombre:file.name,contenido:reader.result.split(',')[1]});reader.readAsDataURL(file);});}
async function uploadFiles(files){
  if(busy||!files.length)return;
  if(!activeCompany){showCompany(true);return;}
  if(files.some(f=>! /\.(xml|zip|json|xlsx|csv|tsv|txt)$/i.test(f.name))){notify('Selecciona XML, ZIP, token JSON, Excel o archivos tabulares.',true);return;}
  if(files.length>200||files.reduce((sum,f)=>sum+f.size,0)>30*1024*1024){notify('Selecciona hasta 200 archivos y 30 MB por carga.',true);return;}
  setBusy(true);notify('Leyendo facturas y comprobando duplicados…');
  try{
    const result=await api('/api/importar',{configuracion:companyConfig(),archivos:await Promise.all(files.map(encodeFile))});
    page=0;await loadState();await loadInvoices();
    notify(`${result.nuevas} facturas nuevas. ${result.duplicadas} documentos repetidos omitidos. ${result.nominas} nóminas · ${result.resumenes} resúmenes DIAN · ${result.maestros} maestros · ${result.historicos} históricos.`+(result.errores.length?'\n'+result.errores.join('\n'):''),result.errores.length>0);
    if(result.nominas)await loadPayroll();
    if(result.maestros||result.historicos||result.resumenes)await loadOffice();
  }catch(error){notify(error.message,true);}finally{setBusy(false);}
}
$('#invoiceRows').onclick=event=>{const suggestion=event.target.closest('[data-accept-suggestion]');if(suggestion){acceptInline(suggestion.dataset.acceptSuggestion);return;}const approval=event.target.closest('[data-approve-invoice]');if(approval){approveInline(approval.dataset.approveInvoice);return;}const button=event.target.closest('[data-open]');if(button){reviewQueue=filtered().map(d=>d.id);reviewingIssues=false;openInvoice(button.dataset.open);}};
$('#invoiceRows').onchange=event=>{const id=event.target.dataset.select;if(id){event.target.checked?selected.add(id):selected.delete(id);renderInvoices();}};
$('#selectAll').onchange=event=>{const size=Number($('#pageSize').value);for(const d of filtered().slice(page*size,(page+1)*size).filter(d=>d.estado==='lista'&&d.aprobada))event.target.checked?selected.add(d.id):selected.delete(d.id);renderInvoices();};
$('#search').oninput=$('#status').onchange=$('#pageSize').onchange=()=>{page=0;renderInvoices();};
$('#month').onchange=$('#reviewStatus').onchange=()=>{page=0;renderInvoices();};
$('#clearMonth').onclick=()=>{$('#month').value='';page=0;renderInvoices();};
$('#reviewIssues').onclick=()=>{if(busy)return;reviewQueue=filtered().filter(d=>d.revision!=='lista').map(d=>d.id);reviewingIssues=true;if(reviewQueue.length)openInvoice(reviewQueue[0]);};
async function moveInvoice(step){
  const next=reviewQueue[reviewQueue.indexOf(activeInvoice?.id)+step];
  if(busy||!next)return;
  if(dirty()&&!confirm('Hay cuentas sin guardar. ¿Cambiar de factura y descartarlas?'))return;
  await openInvoice(next);
}
$('#previousInvoice').onclick=()=>moveInvoice(-1);
$('#nextInvoice').onclick=()=>moveInvoice(1);
$('#prev').onclick=()=>{page--;renderInvoices();};$('#next').onclick=()=>{page++;renderInvoices();};
async function openInvoice(id){
  if(busy)return;setBusy(true);
  clearTimeout(batchPreviewTimer);batchPreviewVersion++;
   try{activeInvoice=await api('/api/facturas/'+id);renderDetail();if(!$('#invoiceDialog').open)$('#invoiceDialog').showModal();$('#invoiceDialog').scrollTop=0;}
  catch(error){notify(error.message,true);}finally{setBusy(false);}
}
function renderDetail(){
  const d=activeInvoice,p=d.clasificacion;
  const party=(title,data)=>`<div class="party"><small>${title}</small><b>${esc(data.nombre||'Sin nombre')}</b><p>NIT: ${esc(data.nit)}</p>${data.direccion?`<p>${esc(data.direccion)}</p>`:''}${data.ciudad?`<p>${esc([data.ciudad,data.departamento,data.pais].filter(Boolean).join(' · '))}</p>`:''}${data.telefono?`<p>Tel. ${esc(data.telefono)}</p>`:''}${data.email?`<p>${esc(data.email)}</p>`:''}${data.responsabilidad?`<p>Responsabilidad fiscal: ${esc(data.responsabilidad)}</p>`:''}</div>`;
  const labels={LineExtensionAmount:'Subtotal',AllowanceTotalAmount:'Descuentos',ChargeTotalAmount:'Cargos',TaxExclusiveAmount:'Base imponible',TaxInclusiveAmount:'Total con impuestos',PrepaidAmount:'Anticipos',PayableRoundingAmount:'Redondeo'};
  $('#invoiceDetail').innerHTML=`<div class="invoice-heading"><div><span class="badge">${esc(p.tipo)}</span><h2 id="invoiceTitle"># ${esc(d.documento)}</h2><span class="badge ${d.estado}">${statusNames[d.estado]}</span><p>Emisión: ${esc(d.fecha)}${d.vencimiento?' · Vencimiento: '+esc(d.vencimiento):''} · ${esc(d.moneda)}</p></div><div class="cufe">CUFE / CUDE<br>${esc(d.cufe)}</div></div>
    ${d.errores.length?`<div class="notice error">${d.errores.map(esc).join('<br>')}</div>`:''}
    <div class="parties">${party('Emisor / vendedor',p.supplier)}${party('Receptor / comprador',p.customer)}</div>
    ${d.orden||d.referencia?`<h3 class="section-title">REFERENCIAS</h3><p class="invoice-note">${d.orden?'Orden: '+esc(d.orden)+'<br>':''}${d.referencia?'Factura relacionada: '+esc(d.referencia):''}</p>`:''}
    <h3 class="section-title">DETALLE DE PRODUCTOS Y SERVICIOS</h3><div class="tablewrap"><table class="items"><thead><tr><th>#</th><th>Descripción</th><th class="number">Cant.</th><th class="number">Precio unit.</th><th class="number">Descuento</th><th class="number">Impuestos</th><th class="number">Valor base</th><th>Cuenta contable</th></tr></thead><tbody>${d.items.map((item,index)=>`<tr><td>${index+1}</td><td class="description">${esc(item.descripcion)}${item.codigo?'<small>'+esc(item.codigo)+'</small>':''}</td><td class="number">${esc(item.cantidad||'—')}</td><td class="number">${esc(money(item.precio,d.moneda))}</td><td class="number">${esc(money(item.descuento,d.moneda))}</td><td class="number">${item.impuestos.map(t=>`<div>${esc(t.nombre||t.codigo)} ${esc(t.tarifa)}%<small>${esc(money(t.valor,d.moneda))}</small></div>`).join('')||'—'}</td><td class="number">${esc(money(item.valor,d.moneda))}</td><td><input class="account-input ${d.cuentas[index]?'':'missing'}" data-account="${index}" value="${esc(d.cuentas[index])}" placeholder="Ej. 519530" inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" aria-label="Cuenta del ítem ${index+1}: ${esc(item.descripcion)}"><span class="account-label">${d.cuentas[index]?'Asignada':'Pendiente de asignar'}</span></td></tr>`).join('')}</tbody></table></div>
    <div class="totals">${Object.entries(labels).filter(([key])=>d.totales[key]!==undefined).map(([key,label])=>`<div class="total-row"><span>${label}</span><b>${esc(money(d.totales[key],d.moneda))}</b></div>`).join('')}${(d.impuestos||[]).map(t=>`<div class="total-row"><span>${esc(t.nombre)} ${esc(t.tarifa)}%</span><b>${esc(money(t.valor,d.moneda))}</b></div>`).join('')}${(d.retenciones||[]).map(t=>`<div class="total-row"><span>${esc(t.nombre)} ${esc(t.tarifa)}%</span><b>${esc(money(t.valor,d.moneda))}</b></div>`).join('')}<div class="total-row final"><span>TOTAL A PAGAR</span><span>${esc(money(d.total,d.moneda))}</span></div></div>
    ${d.advertencias.length?`<div class="notice">${d.advertencias.map(esc).join('<br>')}</div>`:''}
    ${d.pago||d.forma_pago?`<h3 class="section-title">CONDICIONES DE PAGO</h3><p class="invoice-note">${d.forma_pago==='1'?'Contado':d.forma_pago==='2'?'Crédito':esc(d.forma_pago||'')} ${d.pago?'· Código de medio de pago: '+esc(d.pago):''}</p>`:''}
    ${d.notas.length?`<h3 class="section-title">NOTAS</h3><p class="invoice-note">${d.notas.map(esc).join('<br>')}</p>`:''}
    ${d.lote?`<div class="download-card"><span>Último plano generado</span><a class="button" href="/api/lotes/${d.lote}/txt">↓ Plano Contai</a></div>`:''}`;
  $('#saveStatus').textContent='Cuentas guardadas por factura';
  const statusBadge=$('#invoiceDetail .invoice-heading .badge.'+d.estado);if(statusBadge){statusBadge.textContent=reviewNames[d.revision];statusBadge.className='badge '+({lista:'lista',revisar:'pendiente',error:'error'}[d.revision]);}
  const kind=$('#invoiceDetail .invoice-heading .badge');if(kind&&kind.textContent===p.tipo)kind.className='document-kind';
  const identity=$('#invoiceDetail .cufe');if(identity){identity.replaceChildren();const label=document.createElement('small');label.textContent='Identificador electrónico';identity.append(label,document.createTextNode(d.cufe));}
  const revision=document.createElement('div');
  revision.className='revision-summary';
  revision.innerHTML=`<b>${esc(reviewNames[d.revision]||'Revisar')}</b>${d.motivos_revision?.length?'<ul>'+d.motivos_revision.map(m=>'<li>'+esc(m)+'</li>').join('')+'</ul>':' · Sin incidencias en la revisión actual.'}`;
  $('#invoiceDetail').prepend(revision);
  updateReviewNavigation();
  renderWorkflow(d);
}
$('#invoiceDetail').oninput=event=>{
  if(!event.target.matches('[data-account]'))return;
  event.target.classList.toggle('missing',!event.target.value.trim());
  event.target.nextElementSibling.textContent=event.target.value.trim()?'Sin guardar':'Pendiente de asignar';
  $('#saveStatus').textContent='Cambios sin guardar';
  schedulePreview();
};
function enteredAccounts(){return [...document.querySelectorAll('[data-account]')].map(input=>input.value.trim());}
function dirty(){return activeInvoice&&(JSON.stringify(enteredAccounts())!==JSON.stringify(activeInvoice.cuentas)||adjustmentSignature(enteredAdjustments())!==adjustmentSignature(activeInvoice.ajustes));}
function closeInvoice(){if(busy)return;if(dirty()&&!confirm('Hay cambios sin guardar. ¿Cerrar sin guardar estos cambios?'))return;$('#invoiceDialog').close();activeInvoice=null;clearTimeout(previewTimer);previewVersion++;scheduleBatchPreview();}
$('#closeInvoice').onclick=closeInvoice;
$('#backToInvoices').onclick=closeInvoice;
$('#invoiceDialog').addEventListener('cancel',event=>{event.preventDefault();closeInvoice();});
async function saveAccounts(){
  const accounts=enteredAccounts();
  const invalid=[...document.querySelectorAll('[data-account]')].find(input=>input.value.trim()&&!/^\d{4,12}$/.test(input.value.trim()));
  if(invalid){invalid.focus();throw Error('Las cuentas deben contener de 4 a 12 dígitos.');}
  activeInvoice=await api('/api/facturas/'+activeInvoice.id+'/cuentas',{cuentas:accounts,ajustes:enteredAdjustments(),anterior:{cuentas:activeInvoice.cuentas,ajustes:activeInvoice.ajustes}});
  renderDetail();
  $('#saveStatus').textContent='✓ Cuentas guardadas';
  for(const input of document.querySelectorAll('[data-account]'))input.nextElementSibling.textContent=input.value.trim()?'Asignada':'Pendiente de asignar';
  await loadInvoices();
}
$('#saveAccounts').onclick=async()=>{if(busy)return;setBusy(true);try{await saveAccounts();}catch(error){$('#saveStatus').textContent=error.message;}finally{setBusy(false);}};
function showDownloads(result){
  lastGeneratedResult={nit:activeCompany,ids:result.lotes.map(l=>l.id)};
  $('#downloads').innerHTML=result.lotes.map(b=>`<div class="download-card"><span><b>${b.aceptados} facturas generadas</b> · ${b.errores} incidencias${b.errores?'<br>'+b.documentos.filter(d=>d.estado==='error').map(d=>esc(d.mensaje)).join('<br>'):''}</span>${b.lineas?`<a class="button primary" href="/api/lotes/${b.id}/txt">↓ Plano Contai</a>`:''}<a class="button" href="/api/lotes/${b.id}/zip">↓ Paquete completo</a></div>`).join('');
}
async function generate(ids){const result=await api('/api/facturas/generar',{ids,configuracion:companyConfig()});showDownloads(result);await loadState();await loadInvoices();notify('Proceso finalizado. Consulta el resultado y descarga el plano debajo del listado.');}

$('#generateSelected').onclick=async()=>{
  const ready=generationIds();
  if(!ready.length||busy)return;
  if(!confirm(`Generar plano para ${ready.length} facturas parametrizadas?`))return;
  setBusy(true);
  try{await generate(ready);}catch(error){notify(error.message,true);}
  finally{setBusy(false);}
};
function renderHistory(){
  const lots=state.lotes.filter(l=>l.nit===activeCompany);
  $('#historyRows').innerHTML=lots.length?lots.map(l=>`<tr><td>${esc(new Date(l.fecha).toLocaleString('es-CO'))}</td><td>${esc(l.empresa||l.nit)}</td><td>${l.aceptados}</td><td>${l.errores}</td><td>${l.lineas?`<a class="button" href="/api/lotes/${l.id}/txt">↓ TXT</a> `:''}<a class="button" href="/api/lotes/${l.id}/zip">↓ ZIP</a></td></tr>`).join(''):'<tr><td colspan="5" class="empty">Todavía no hay planos generados para esta empresa.</td></tr>';
}
function showView(view){
  if(busy)return;
  if(view!=='dashboard')accountingView=view;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  for(const name of ['invoices','history','dashboard','office','payroll'])$('#'+name+'View').classList.toggle('hidden',name!==view);
  if(view==='office')loadOffice();
  if(view==='payroll')loadPayroll();
  $('#spaceAccounting').setAttribute('aria-pressed',String(view!=='dashboard'));
  $('#spaceDashboard').setAttribute('aria-pressed',String(view==='dashboard'));
  $('#currentPreview').classList.toggle('hidden',view!=='invoices');
  $('.layout').classList.toggle('preview-hidden',view!=='invoices');
  $('.layout').classList.remove('modules-open');
  syncModules();
}
function syncModules(){const narrow=matchMedia('(max-width:1250px)').matches;$('#toggleModules').setAttribute('aria-expanded',String(narrow?$('.layout').classList.contains('modules-open'):!$('.layout').classList.contains('modules-collapsed')));}
$('#toggleModules').onclick=()=>{$('.layout').classList.toggle(matchMedia('(max-width:1250px)').matches?'modules-open':'modules-collapsed');syncModules();};
window.addEventListener('resize',syncModules);
syncModules();
$('#spaceAccounting').onclick=()=>showView(accountingView);
$('#spaceDashboard').onclick=()=>showView('dashboard');
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>showView(button.dataset.view));
$('#clearHistory').onclick=async()=>{
  if(busy||!confirm('¿Retirar los lotes de esta empresa? Se pueden restaurar desde Últimos cambios. Las facturas y cuentas se conservan.'))return;
  setBusy(true);try{await api('/api/lotes',{nit:activeCompany});await loadState();await loadInvoices();$('#downloads').textContent='';notify('Historial retirado. Puedes deshacer esta operación desde Últimos cambios.');}catch(error){notify(error.message,true);}finally{setBusy(false);}
};
async function init(){setBusy(true);try{
  try{const runtime=await api('/api/version');$('#runtimeVersion').textContent=runtime.version;}
  catch{ $('#runtimeVersion').textContent='Servidor pendiente de reiniciar';notify('El servidor no identifica la versión actual. Cierra el CMD con Ctrl+C y abre Iniciar conversor.cmd de esta carpeta.',true); }
  await loadState();await loadInvoices();if(!activeCompany)showCompany(true);
}catch(error){notify('No se pudo cargar la aplicación: '+error.message,true);}finally{setBusy(false);}}
// Esperar a que terminen TODOS los scripts defer. El servidor puede haber
// quedado abierto con rutas de una versión anterior al actualizar los archivos.
document.addEventListener('DOMContentLoaded',()=>{
  if(window.gravimentesWorkflowReady!==true||window.gravimentesOfficeReady!==true||typeof renderWorkflow!=='function'){
    setBusy(true);
    notify('No se cargó el módulo de facturas completo. Detén el servidor con Ctrl+C, vuelve a ejecutar Iniciar conversor.cmd y recarga con Ctrl+F5.',true);
    return;
  }
  init();
},{once:true});
