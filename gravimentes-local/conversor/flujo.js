'use strict';
let previewVersion=0, previewTimer, tabularRows=[], tabularOrder={key:'factura',direction:1};
let suggestionRows=[];
let batchPreviewVersion=0,batchPreviewTimer;
let lastGeneratedResult=null;
function batchDownloads(){
  const saved=state.lotes.filter(l=>l.nit===activeCompany);
  const latest=lastGeneratedResult?.nit===activeCompany?saved.filter(l=>lastGeneratedResult.ids.includes(l.id)):saved.slice(0,1);
  return latest.length?`<section class="batch-downloads" aria-label="Descargas del último resultado"><h3>Último resultado guardado</h3>${latest.map(l=>`<p>${esc(new Date(l.fecha).toLocaleString('es-CO'))}<br>${l.aceptados} facturas · ${l.errores} incidencias</p>${l.lineas?`<a class="button" href="/api/lotes/${esc(l.id)}/txt">Bajar plano</a> `:''}<a class="button" href="/api/lotes/${esc(l.id)}/zip">Bajar paquete</a>`).join('')}</section>`:'';
}
function scheduleBatchPreview(){
  clearTimeout(batchPreviewTimer);
  const version=++batchPreviewVersion;
  if(activeInvoice||!$('#invoiceDialog')||$('#invoiceDialog').open)return;
  const company=activeCompany,ids=generationIds();
  if(!company||!ids.length){$('#currentPreview').innerHTML='<h2>Plano del lote</h2><p>No hay facturas listas en la selección actual. Revisa las incidencias o cambia los filtros.</p>'+batchDownloads();return;}
  $('#currentPreview').innerHTML=`<h2>Plano del lote</h2><p role="status">Calculando ${ids.length} facturas…</p>`;
  batchPreviewTimer=setTimeout(async()=>{
    try{
      const result=await api('/api/facturas/preview-lote',{nit:company,ids});
      if(version!==batchPreviewVersion||company!==activeCompany||activeInvoice)return;
      const byAccount=new Map();
      result.filas.forEach(r=>{const key=r[0]+'|'+r[7];const current=byAccount.get(key)||{account:r[0],side:r[7],amount:0n};
        const [whole,fraction='']=r[8].split('.');current.amount+=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));byAccount.set(key,current);});
      const rows=[...byAccount.values()].map(r=>{const value=(r.amount/10000n).toString()+'.'+(r.amount%10000n).toString().padStart(4,'0');return `<tr><td>${esc(r.account)}</td><td>${r.side==='1'?'Débito':'Crédito'}</td><td>${esc(money(value))}</td></tr>`;}).join('');
      $('#currentPreview').innerHTML=`<h2>Plano del lote</h2><p>${result.facturas} de ${result.solicitadas} facturas listas · ${selected.size?'Selección marcada dentro del filtro':'Todas las listas del filtro'}</p><div class="preview-totals">Débitos ${esc(money(result.debitos))}<br>Créditos ${esc(money(result.creditos))}<br>${result.apto?'✓ Lote listo':'Revisa las incidencias antes de generar'}</div><small>Resumen por cuenta. Se recalcula con las cuentas guardadas.</small><table><thead><tr><th>Cuenta</th><th>Movimiento</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table>${result.errores.map(e=>'<p class="error-text">'+esc(e.documento+': '+e.mensaje)+'</p>').join('')}${result.documentos.flatMap(d=>d.advertencias.map(m=>'<p>'+esc(d.documento+': '+m)+'</p>')).join('')}<button id="generatePreviewBatch" class="button" ${result.apto?'':'disabled'}>Generar plano</button>`;
      $('#generatePreviewBatch').onclick=()=>$('#generateSelected').click();
      $('#currentPreview').insertAdjacentHTML('beforeend',batchDownloads());
    }catch(error){if(version===batchPreviewVersion&&!activeInvoice)$('#currentPreview').innerHTML='<h2>Plano del lote</h2><p class="error-text">'+esc(error.message)+'</p>';}
  },300);
}
const holdLabels={retefte:'ReteFuente',reteiva:'ReteIVA',reteica:'ReteICA'};

function enteredAdjustments(){
  if(!$('#manualCxp'))return activeInvoice?.ajustes||{};
  const value={},cxp=$('#manualCxp').value.trim();
  if(cxp)value.cxp=cxp;
  for(const key of Object.keys(holdLabels)){
    if($('#manual_'+key).checked){
      value.retenciones??={};
      value.retenciones[key]={base:$('#base_'+key).value,tarifa:$('#rate_'+key).value,cuenta:$('#account_'+key).value.trim()};
    }
  }
  return value;
}
function adjustmentSignature(value){
  return JSON.stringify([value?.cxp||'',...Object.keys(holdLabels).map(key=>{
    const h=value?.retenciones?.[key];return h?[Number(h.base),Number(h.tarifa),h.cuenta]:null;
  })]);
}
function renderWorkflow(d){
  const index=d.clasificacion.supplier.nit===d.nit_proveedor?0:1;
  const party=$('#invoiceDetail .parties').children[index];
  const box=document.createElement('div');box.className='supplier-account';
  box.innerHTML=`<b>Cuenta habitual del tercero</b><small>Para ${esc(d.proveedor)} · NIT ${esc(d.nit_proveedor)}. Solo en esta empresa.</small>
    <label>Cuenta de gasto o inventario <input id="supplierAccount" type="text" inputmode="numeric" maxlength="12" value="${esc(d.cuenta_tercero)}" placeholder="Ej. 519530"></label>
    <label><input id="replaceAccounts" type="checkbox"> Reemplazar también las cuentas ya asignadas</label>
    <button id="applySupplierAccount" class="button">Aplicar a factura</button><button id="rememberSupplierAccount" class="button">Recordar tercero</button>
    <small id="supplierAccountStatus" role="status">Recordar aplica a nuevas facturas. Las excepciones por ítem se conservan.</small>`;
  party.append(box);
  const settings=d.ajustes||{},config=companyConfig();
  const adjustments=document.createElement('details');adjustments.className='adjustments';
  adjustments.innerHTML=`<summary>Ajustes contables: cuenta por pagar y retenciones</summary>
    <p>Son decisiones manuales. El original se conserva y la vista previa muestra el resultado. Tarifa expresada en porcentaje, incluida ReteICA.</p>
    <label>Cuenta por pagar <input id="manualCxp" inputmode="numeric" maxlength="12" value="${esc(settings.cxp||'')}" placeholder="${esc(d.clasificacion.soporte?config.proveedor_ds:config.proveedor)}"></label>
    <div class="tablewrap"><table><thead><tr><th>Ajustar</th><th>Base</th><th>Tarifa %</th><th>Cuenta</th></tr></thead><tbody>${Object.entries(holdLabels).map(([key,label])=>{
      const value=settings.retenciones?.[key];
      return `<tr><td><label><input id="manual_${key}" type="checkbox" ${value?'checked':''}> ${label}</label></td><td><input id="base_${key}" type="number" min="0" step="0.0001" value="${esc(value?.base||'')}" aria-label="Base ${label}"></td><td><input id="rate_${key}" type="number" min="0" max="100" step="0.0001" value="${esc(value?.tarifa??'')}" aria-label="Tarifa ${label}"></td><td><input id="account_${key}" inputmode="numeric" value="${esc(value?.cuenta||config[key])}" aria-label="Cuenta ${label}"></td></tr>`;
    }).join('')}</tbody></table></div><small>Desmarcar restaura el tratamiento del XML; para excluir una retención, marcar y usar tarifa 0.</small>`;
  $('#invoiceDetail').append(adjustments);
  if(d.estado==='lista'&&!d.aprobada){
    const approveButton=document.createElement('button');approveButton.className='button';approveButton.textContent='Aprobar avisos';
    approveButton.onclick=async()=>{
      if(busy)return;setBusy(true);let advance=false;
      try{if(dirty())await saveAccounts();await api('/api/facturas/aprobar',{nit:activeCompany,firmas:{[activeInvoice.id]:activeInvoice.firma_revision}});activeInvoice=await api('/api/facturas/'+activeInvoice.id);renderDetail();await loadInvoices();advance=reviewingIssues;}
      catch(error){$('#saveStatus').textContent=error.message;}finally{setBusy(false);}
      if(advance)await moveInvoice(1);
    };
    $('#invoiceDetail .revision-summary').append(approveButton);
  }
  adjustments.oninput=()=>{$('#saveStatus').textContent='Cambios sin guardar';schedulePreview();};
  $('#applySupplierAccount').onclick=()=>{
    const value=$('#supplierAccount').value.trim();
    if(!/^\d{4,12}$/.test(value)){$('#supplierAccountStatus').textContent='Escribe una cuenta de 4 a 12 dígitos.';return;}
    let count=0;
    document.querySelectorAll('[data-account]').forEach(input=>{if(!input.value.trim()||$('#replaceAccounts').checked){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));count++;}});
    $('#supplierAccountStatus').textContent=`Aplicada a ${count} ítems. Pulsa Guardar cuentas para confirmar la factura.`;
  };
  $('#rememberSupplierAccount').onclick=async()=>{
    if(busy)return;
    const value=$('#supplierAccount').value.trim();
    setBusy(true);
    try{const result=await api('/api/facturas/'+d.id+'/cuenta-tercero',{cuenta:value,anterior:activeInvoice.cuenta_tercero});activeInvoice.cuenta_tercero=result.cuenta;$('#supplierAccountStatus').textContent=value?'Cuenta recordada para las nuevas facturas de este tercero.':'Cuenta predeterminada eliminada. Las cuentas de las facturas se conservan.';await loadChangeHistory();}
    catch(error){$('#supplierAccountStatus').textContent=error.message;}finally{setBusy(false);}
  };
  const actions=document.createElement('div');actions.className='suggestion';
  actions.innerHTML='<button id="acceptSuggestions" class="button" disabled>Aceptar sugerencias</button> <span id="suggestionStatus">Buscando cuentas aprendidas…</span>';
  $('#invoiceDetail .items').closest('.tablewrap').after(actions);
  loadSuggestions(d.id);
  schedulePreview();
}
async function loadSuggestions(id){
  try{
    const result=await api('/api/facturas/'+id+'/sugerencias');
    if(activeInvoice?.id!==id||!$('#suggestionStatus'))return;
    suggestionRows=result;
    const count=result.filter(s=>s?.automatica).length;
    $('#suggestionStatus').textContent=count?`${count} sugerencias de confianza alta. Se aplican solo a ítems sin cuenta.`:'Las sugerencias se aprenden de cuentas guardadas en otras facturas de esta empresa.';
    $('#acceptSuggestions').disabled=!count;
    result.forEach((s,index)=>{
      if(!s)return;
      const input=$(`[data-account="${index}"]`),label=document.createElement('span');label.className='suggestion';
      label.innerHTML=`Sugerida: ${esc(s.cuenta)} · ${s.confianza}% <button class="button" type="button">Aceptar</button>`;
      label.querySelector('button').onclick=()=>{if(busy)return;input.value=s.cuenta;input.dispatchEvent(new Event('input',{bubbles:true}));};
      input.parentElement.append(label);
    });
    $('#acceptSuggestions').onclick=()=>{
      if(busy)return;
      suggestionRows.forEach((s,index)=>{const input=$(`[data-account="${index}"]`);if(s?.automatica&&!input.value.trim()){input.value=s.cuenta;input.dispatchEvent(new Event('input',{bubbles:true}));}});
    };
  }catch(error){if(activeInvoice?.id===id&&$('#suggestionStatus'))$('#suggestionStatus').textContent=error.message;}
}
function schedulePreview(){
  clearTimeout(previewTimer);
  const version=++previewVersion;
  if(!activeInvoice)return;
  const id=activeInvoice.id,name=activeInvoice.documento;
  $('#detailPreview').innerHTML='<h2>Asiento propuesto</h2><p role="status">Calculando…</p>';
  previewTimer=setTimeout(async()=>{
    if(activeInvoice?.id!==id)return;
    try{
      const result=await api('/api/facturas/'+id+'/preview',{cuentas:enteredAccounts(),ajustes:enteredAdjustments()});
      if(version!==previewVersion||activeInvoice?.id!==id)return;
      const html=`<h2>Asiento · ${esc(name)}</h2><small>${dirty()?'Borrador sin guardar':'Cuentas y ajustes guardados'} · Factura individual</small>`+(result.apto?
        `<div class="preview-totals">Débitos ${esc(money(result.debitos))}<br>Créditos ${esc(money(result.creditos))}<br>✓ Cuadra</div><div class="tablewrap"><table><thead><tr><th>Cuenta / concepto</th><th>Débito</th><th>Crédito</th></tr></thead><tbody>${result.filas.map(r=>`<tr><td>${esc(r[0])}<small>${esc(r[6])}</small></td><td>${r[7]==='1'?esc(money(r[8])):''}</td><td>${r[7]==='2'?esc(money(r[8])):''}</td></tr>`).join('')}</tbody></table></div>${result.advertencias.map(m=>'<p>'+esc(m)+'</p>').join('')}`:
        result.errores.map(m=>'<p class="error-text">'+esc(m)+'</p>').join(''));
      $('#detailPreview').innerHTML=html;$('#currentPreview').innerHTML=html;
    }catch(error){if(version===previewVersion)$('#detailPreview').innerHTML='<p class="error-text">'+esc(error.message)+'</p>';}
  },250);
}
async function loadChangeHistory(){
  const company=activeCompany;
  const rows=company?await api('/api/cambios?nit='+encodeURIComponent(company)):[];
  if(company!==activeCompany)return;
  const labels={factura:'Cuentas / ajustes',tercero:'Cuenta habitual del tercero',aprendizaje:'Exclusión de aprendizaje',operacion:'Operación local'};
  $('#changeTimeline').innerHTML=rows.length?rows.map(r=>`<div class="change-entry"><span>${esc(r.documento)} · ${esc(new Date(r.fecha).toLocaleString('es-CO'))} · ${esc(labels[r.tipo]||labels.factura)}${r.revertido?' · Revertido':''}</span>${r.revertido?'':`<button class="button" data-undo="${r.id}">Deshacer</button>`}</div>`).join(''):'Sin cambios guardados en esta empresa.';
  $('#undoLast').disabled=!rows.some(r=>!r.revertido);
}
async function undoSavedChange(id){
  if(busy)return;
  if(activeInvoice&&dirty()&&!confirm('Hay cambios sin guardar. ¿Descartarlos para deshacer el cambio guardado?'))return;
  setBusy(true);
  try{
    const result=await api('/api/cambios/deshacer',{nit:activeCompany,...(id?{id}:{})});
    await loadState();await loadInvoices();await loadChangeHistory();
    if(activeInvoice){if(invoices.some(r=>r.id===activeInvoice.id)){activeInvoice=await api('/api/facturas/'+activeInvoice.id);renderDetail();}else{$('#invoiceDialog').close();activeInvoice=null;}}
    if(typeof loadPayroll==='function'&&!$('#payrollView').classList.contains('hidden'))await loadPayroll();
    if(typeof loadOffice==='function'&&!$('#officeView').classList.contains('hidden'))await loadOffice();
    if($('#learningDialog').open)await loadLearning();
    notify('Cambio deshecho. Los planos anteriores siguen en el historial; genera una nueva versión si corresponde.');
  }catch(error){if(activeInvoice)$('#saveStatus').textContent=error.message;else notify(error.message,true);}finally{setBusy(false);}
}
$('#undoLast').onclick=()=>undoSavedChange();
$('#changeTimeline').onclick=e=>{const b=e.target.closest('[data-undo]');if(b)undoSavedChange(b.dataset.undo);};
let learningPage=0,learningVersion=0,learningTimer;
async function loadLearning(){
  const version=++learningVersion,company=activeCompany;
  $('#learningMessage').textContent='Consultando aprendizaje…';
  try{
    const params=new URLSearchParams({nit:company,q:$('#learningSearch').value,pagina:String(learningPage)});
    const result=await api('/api/aprendizaje?'+params);
    if(version!==learningVersion||company!==activeCompany||!$('#learningDialog').open)return;
    learningPage=result.pagina;
    $('#learningMessage').textContent=`${result.activos} ejemplos activos · ${result.excluidos} excluidos. Las palabras corresponden a todos los ejemplos activos de la empresa.`;
    $('#learningTokens').innerHTML='<table><thead><tr><th>Palabra normalizada</th><th>Cuentas y frecuencia</th></tr></thead><tbody>'+result.tokens.map(t=>`<tr><td>${esc(t.token)}</td><td>${t.cuentas.map(c=>esc(c.cuenta)+' ('+c.frecuencia+')').join(', ')}</td></tr>`).join('')+'</tbody></table>';
    $('#learningExamples').innerHTML='<table><thead><tr><th>Factura / ítem</th><th>Descripción</th><th>Cuenta</th><th>Aprendizaje</th></tr></thead><tbody>'+result.ejemplos.map(e=>`<tr><td>${esc(e.documento)} · ${e.item+1}</td><td>${esc(e.descripcion)}</td><td>${esc(e.cuenta)}</td><td><button class="button" data-learning-invoice="${esc(e.factura)}" data-learning-item="${e.item}" data-excluded="${e.excluido}">${e.excluido?'Restaurar':'Excluir'}</button></td></tr>`).join('')+'</tbody></table>';
    $('#learningPageInfo').textContent=`Página ${result.pagina+1} de ${result.paginas} · ${result.coincidencias} ejemplos`;
    $('#learningPrevious').disabled=!result.pagina;$('#learningNext').disabled=result.pagina>=result.paginas-1;
  }catch(error){if(version===learningVersion)$('#learningMessage').textContent=error.message;}
}
$('#openLearning').onclick=()=>{if(busy||!activeCompany)return;learningPage=0;$('#learningSearch').value='';$('#learningDialog').showModal();loadLearning();};
$('#closeLearning').onclick=()=>{if(busy)return;$('#learningDialog').close();learningVersion++;clearTimeout(learningTimer);};
$('#learningDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
$('#learningSearch').oninput=()=>{learningPage=0;clearTimeout(learningTimer);learningVersion++;learningTimer=setTimeout(loadLearning,250);};
$('#learningPrevious').onclick=()=>{if(learningPage>0){learningPage--;loadLearning();}};
$('#learningNext').onclick=()=>{learningPage++;loadLearning();};
$('#learningExamples').onclick=async e=>{
  const button=e.target.closest('[data-learning-invoice]');if(!button||busy)return;
  setBusy(true);$('#learningMessage').textContent='Guardando decisión de aprendizaje…';
  const before=button.dataset.excluded==='true';
  try{await api('/api/aprendizaje/exclusion',{nit:activeCompany,factura:button.dataset.learningInvoice,item:Number(button.dataset.learningItem),excluido:!before,anterior:before});await loadLearning();await loadChangeHistory();}
  catch(error){$('#learningMessage').textContent=error.message;}finally{setBusy(false);}
};
const tabularColumns=[['factura','Factura'],['nombre','Nombre'],['nit','NIT'],['regimen','Régimen'],['fecha','Fecha'],['subtotal','Subtotal'],['iva5','IVA 5%'],['iva19','IVA 19%'],['iva_total','IVA total'],['retefte','ReteFuente'],['reteiva','ReteIVA'],['reteica','ReteICA'],['total_xml','Total XML'],['neto_asiento','Neto asiento'],['revision','Revisión'],['retefte_tarifa','ReteFuente % efectiva']];
function filteredTabular(){
  const regime=$('#tabularRegime').value.toLocaleLowerCase().trim(),holds=$('#tabularHolds').value,mixed=$('#tabularMixed').value;
  return tabularRows.filter(r=>{
    const hasHolds=Number(r.retefte)+Number(r.reteiva)+Number(r.reteica)>0,hasMixed=Number(r.iva5)>0&&Number(r.iva19)>0;
    return (!regime||r.regimen.toLocaleLowerCase().includes(regime))&&(!holds||hasHolds===(holds==='yes'))&&(!mixed||hasMixed===(mixed==='yes'));
  });
}
$('#tabularRegime').oninput=$('#tabularHolds').onchange=$('#tabularMixed').onchange=()=>renderTabular();
function renderTabular(){
  const numeric=new Set([...tabularColumns.slice(5,14).map(([key])=>key),'retefte_tarifa']);
  tabularRows.sort((a,b)=>tabularOrder.direction*(numeric.has(tabularOrder.key)?Number(a[tabularOrder.key])-Number(b[tabularOrder.key]):String(a[tabularOrder.key]).localeCompare(String(b[tabularOrder.key]),'es',{numeric:true})));
  const rows=filteredTabular();$('#tabularCount').textContent=`${rows.length} de ${tabularRows.length} facturas`;
  $('#exportTabular').disabled=!rows.length;
  $('#tabularContent').innerHTML=`<table><thead><tr>${tabularColumns.map(([key,label])=>`<th><button class="button" data-sort="${key}">${label}</button></th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${tabularColumns.map(([key])=>`<td>${key==='factura'?`<button class="button" data-tabular-open="${esc(r.id)}">${esc(r.factura)}</button>`:key==='retefte_tarifa'?(r[key]===''?'—':esc(r[key])+'%'):numeric.has(key)?esc(money(r[key])):esc(r[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
$('#openTabular').onclick=async()=>{
  if(busy)return;setBusy(true);notify('Preparando revisión tabular…');
  const ids=new Set(filtered().map(d=>d.id));
  try{tabularRows=(await api('/api/revision-tabular?nit='+encodeURIComponent(activeCompany))).filter(r=>ids.has(r.id));$('#tabularRegime').value='';$('#tabularHolds').value='';$('#tabularMixed').value='';renderTabular();$('#tabularDialog').showModal();notify('Revisión tabular lista.');}catch(error){notify(error.message,true);}finally{setBusy(false);}
};
$('#closeTabular').onclick=()=>$('#tabularDialog').close();
$('#tabularContent').onclick=e=>{
  const sort=e.target.closest('[data-sort]');if(sort){tabularOrder={key:sort.dataset.sort,direction:tabularOrder.key===sort.dataset.sort?-tabularOrder.direction:1};renderTabular();}
  const open=e.target.closest('[data-tabular-open]');if(open){$('#tabularDialog').close();reviewQueue=filteredTabular().map(r=>r.id);reviewingIssues=false;openInvoice(open.dataset.tabularOpen);}
};
$('#exportTabular').onclick=async()=>{
  const button=$('#exportTabular');button.disabled=true;
  try{
    const response=await fetch('/api/revision-tabular/xlsx',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nit:activeCompany,ids:filteredTabular().map(r=>r.id)})});
    if(!response.ok)throw Error((await response.json()).error);
    const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download='Revision_facturas.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(error){$('#tabularCount').textContent=error.message;notify(error.message,true);}finally{button.disabled=false;}
};
function openCommandSearch(){
  if(busy||document.querySelector('dialog[open]'))return;
  $('#globalQuery').value='';renderCommandResults();$('#searchDialog').showModal();$('#globalQuery').focus();
}
function renderCommandResults(){
  const query=$('#globalQuery').value.toLocaleLowerCase().trim();
  const actions=[['Facturas',()=>showView('invoices')],['Historial de planos',()=>showView('history')],['Dashboard',()=>showView('dashboard')],['Nueva empresa',()=>showCompany(true)],['Importar archivos / aprender de plano',chooseFiles],['Nómina',()=>showView('payroll')],['Parametrización',()=>showView('office')],['Revisión tabular',()=>$('#openTabular').click()],['Aprendizaje de cuentas',()=>$('#openLearning').click()],...state.empresas.map(c=>['Empresa '+c.empresa+' · '+c.nit,()=>{$('#company').value=c.nit;$('#company').dispatchEvent(new Event('change'));}]),...state.lotes.filter(l=>l.nit===activeCompany&&l.lineas).map(l=>['Descargar plano '+new Date(l.fecha).toLocaleDateString('es-CO',{year:'numeric',month:'long',day:'numeric'}),()=>{const a=document.createElement('a');a.href='/api/lotes/'+l.id+'/txt';a.click();}])];
  const matches=[...actions.filter(([label])=>label.toLocaleLowerCase().includes(query)),...invoices.filter(d=>`${d.documento} ${d.proveedor} ${d.nit_proveedor}`.toLocaleLowerCase().includes(query)).slice(0,20).map(d=>[`${d.documento} · ${d.proveedor}`,()=>{reviewQueue=filtered().map(r=>r.id);reviewingIssues=false;openInvoice(d.id);}])];
  $('#globalResults').replaceChildren();
  matches.forEach(([label,action])=>{const b=document.createElement('button');b.className='button';b.textContent=label;b.onclick=()=>{$('#searchDialog').close();action();};$('#globalResults').append(b);});
}
$('#commandSearch').onclick=openCommandSearch;$('#globalQuery').oninput=renderCommandResults;$('#closeSearch').onclick=()=>$('#searchDialog').close();
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommandSearch();}
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&!e.target.closest('input,textarea,[contenteditable="true"]')){e.preventDefault();undoSavedChange();}
});
try{document.documentElement.dataset.theme=localStorage.getItem('gravimentes.tema')||'light';}catch{}
$('#toggleTheme').onclick=()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=theme;try{localStorage.setItem('gravimentes.tema',theme);}catch{}};
// Solo anunciar disponibilidad tras registrar todos los controles del módulo.
window.gravimentesWorkflowReady=true;
