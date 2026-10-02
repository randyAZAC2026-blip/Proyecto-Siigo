let reviewRequested=null, reviewBatch=null, reviewIndex=-1, reviewData=null;
let reviewRequest=0, reviewTab='summary', reviewFieldPage=0;

function reviewNotice(message){
  $('#reviewMessage').textContent=message;
  $('#reviewMessage').classList.toggle('hidden',!message);
}

async function showReview(){
  const preferred=reviewRequested||$('#reviewBatch').value||current?.id||state.lotes[0]?.id;
  reviewRequested=null;
  const lots=[...state.lotes];
  if(current&&!lots.some(l=>l.id===current.id))lots.unshift(current);
  $('#reviewBatch').innerHTML=lots.map(l=>`<option value="${esc(l.id)}">${esc(new Date(l.fecha).toLocaleString('es-CO'))} · ${esc(l.empresa||l.nit)} · ${l.aceptados} convertidos / ${l.errores} errores</option>`).join('');
  if(!lots.length){
    $('#reviewList').innerHTML='<p class="empty">Aún no hay lotes. Selecciona XML/ZIP en Convertir documentos y procesa el lote. Los documentos con errores también quedarán disponibles aquí.</p>';
    return;
  }
  $('#reviewBatch').value=lots.some(l=>l.id===preferred)?preferred:lots[0].id;
  if(reviewBatch?.id!==$('#reviewBatch').value)await loadReviewBatch($('#reviewBatch').value);
}

async function loadReviewBatch(id){
  if(!id)return;
  const request=++reviewRequest;
  reviewBatch=null;reviewIndex=-1;reviewData=null;reviewNotice('Cargando lote…');
  $('#reviewDetail').innerHTML='<p class="empty">Selecciona un documento.</p>';
  $('#reviewList').textContent='';
  try{
    const batch=await api('/api/lotes/'+encodeURIComponent(id));
    if(request!==reviewRequest)return;
    reviewBatch=batch;
    $('#reviewSearch').value='';
    reviewNotice('');renderReviewList();
  }catch(e){if(request===reviewRequest)reviewNotice(e.message);}
}

function renderReviewList(){
  if(!reviewBatch)return;
  const query=$('#reviewSearch').value.toLocaleLowerCase(),status=$('#reviewStatus').value;
  const docs=reviewBatch.documentos.map((d,i)=>({...d,index:i})).filter(d=>(!status||d.estado===status)&&[d.archivo,d.documento,d.proveedor,d.nit,d.mensaje].join(' ').toLocaleLowerCase().includes(query));
  $('#reviewList').innerHTML=`<p class="muted">${docs.length} documentos</p><div class="review-list">`+docs.map(d=>`<button class="review-item ${reviewIndex===d.index?'selected':''}" data-review-index="${d.index}"><span class="badge ${esc(d.estado)}">${esc(d.estado)}</span><b style="display:block;margin-top:6px">${esc(d.documento||'Documento '+(d.index+1))}</b><span class="muted">${esc(d.archivo)}</span>${d.clasificacion?`<div class="muted">${esc(d.clasificacion.tipo)}</div>`:''}</button>`).join('')+'</div>';
  $('#reviewList').querySelectorAll('[data-review-index]').forEach(button=>button.onclick=()=>loadXmlReview(Number(button.dataset.reviewIndex)));
}

async function loadXmlReview(index){
  if(!reviewBatch)return;
  const request=++reviewRequest, batchId=reviewBatch.id;
  reviewIndex=index;reviewData=null;reviewTab='summary';reviewFieldPage=0;
  renderReviewList();reviewNotice('');$('#reviewDetail').innerHTML='<p class="empty">Leyendo XML original y ejecutando validaciones…</p>';
  try{
    const data=await api(`/api/lotes/${batchId}/revision/${index}`);
    if(request!==reviewRequest)return;
    reviewData=data;renderXmlReview();
  }catch(e){if(request===reviewRequest){reviewNotice(e.message);$('#reviewDetail').textContent='No fue posible consultar este documento.';}}
}

function renderXmlReview(){
  const d=reviewData;
  const invalid=d.controles.filter(c=>c.estado==='error').length;
  $('#reviewDetail').innerHTML=`<div class="row between"><h3>${esc(d.resumen.documento||'Revisión del documento')}</h3><span class="badge ${d.apto?'':'error'}">${d.apto?'Apto para conversión':invalid+' controles con error'}</span></div>
   <p class="muted" style="overflow-wrap:anywhere">${esc(d.archivo)}</p>
   <div class="note"><b>Resultado guardado:</b> ${esc(d.resultado_guardado.estado)} · ${esc(d.resultado_guardado.mensaje||'')}<br><b>Revisión actual:</b> ${d.apto?'el XML supera las validaciones del motor actual con la configuración de este lote.':'revisa los controles indicados debajo.'} ${d.apto&&d.resultado_guardado.estado==='error'?'Para generar el plano, abre el lote y utiliza Reconvertir con cuentas actuales.':''}</div>
   <div class="row">${d.xml_original?`<a class="button small" href="/api/lotes/${d.lote}/revision/${d.indice}/xml">Descargar XML original</a>`:''}<button class="btn small" id="reviewOpenLot">Abrir lote para reconvertir</button><button class="btn primary small" id="reviewRegenerate">Reprocesar ahora</button></div>
   <div class="review-tabs" role="tablist">${[['summary','Resumen y controles'],['fields','Todos los campos'],['xml','XML original'],...(d.campos_contenedor.length?[['ubl','UBL embebido']]:[])].map(([id,title])=>`<button role="tab" class="btn small ${reviewTab===id?'active':''}" aria-selected="${reviewTab===id}" data-review-tab="${id}">${title}</button>`).join('')}</div><div id="reviewContent"></div>`;
  $('#reviewOpenLot').onclick=()=>openLot(d.lote);
  $('#reviewRegenerate').onclick=async()=>{
    if(busy)return;
    try{
      busy=true;$('#reviewRegenerate').disabled=true;
      current=await api('/api/lotes/'+d.lote+'/regenerar',config());
      renderResult();await refresh();
      reviewRequested=current.id;await showReview();await loadXmlReview(d.indice);
      reviewNotice('Lote reconvertido con la configuración actual.',true);
    }catch(e){reviewNotice(e.message);}
    finally{busy=false;const button=$('#reviewRegenerate');if(button)button.disabled=false;}
  };
  $('#reviewDetail').querySelectorAll('[data-review-tab]').forEach(button=>button.onclick=()=>{reviewTab=button.dataset.reviewTab;renderXmlReview();});
  if(reviewTab==='summary')renderXmlSummary();
  else if(reviewTab==='fields'){
    $('#reviewContent').innerHTML=`<div class="fields"><label>Buscar ruta, valor o atributo<input id="xmlFieldSearch" type="search" placeholder="NIT, TaxAmount, moneda…"></label><label>Origen de los campos<select id="xmlFieldSource"><option value="document">Documento UBL</option>${d.campos_contenedor.length?'<option value="container">Contenedor AttachedDocument</option>':''}</select></label></div><div id="xmlFieldTable"></div>`;
    $('#xmlFieldSearch').oninput=$('#xmlFieldSource').onchange=()=>{reviewFieldPage=0;renderXmlFields();};
    reviewFieldPage=0;renderXmlFields();
  }else{
    const pre=document.createElement('pre');pre.className='xml-code';pre.textContent=reviewTab==='xml'?d.xml_original:d.xml_ubl;
    $('#reviewContent').replaceChildren(pre);
  }
}

function renderXmlSummary(){
  const d=reviewData,r=d.resumen,p=r.clasificacion;
  const party=(label,part)=>`<div><span class="muted">${label}</span><b>${esc(part.nombre||'Sin nombre')}</b><span class="mono">${esc(part.nit||'Sin NIT')}</span></div>`;
  $('#reviewContent').innerHTML=(p?`<h3>${esc(p.tipo)} · código ${esc(p.codigo||'sin código')}</h3><p class="muted">${esc(p.explicacion)}</p><div class="review-meta">${party('Parte XML: AccountingSupplierParty',p.supplier)}${party('Parte XML: AccountingCustomerParty',p.customer)}${party('Proveedor que se utilizará en el asiento',p.contraparte)}<div><span class="muted">Empresa configurada</span><b>${esc(reviewBatch.nit)}</b>${esc(p.rol_empresa)}</div></div><p class="mono" style="overflow-wrap:anywhere">CUFE/CUDE: ${esc(r.cufe||'Ausente')}</p><p>Fecha: ${esc(r.fecha||'Ausente')} · Moneda: ${esc(r.moneda||'Ausente')}</p><h3>Totales informados en el XML</h3>${Object.entries(r.totales).map(([key,value])=>`<div class="review-total"><span class="mono">${esc(key)}</span><b>${esc(value)}</b></div>`).join('')}`:'')+
   `<h3 style="margin-top:24px">Controles de validación</h3><p class="muted">Comprobaciones estructurales y contables. No se verifica la firma digital ni el estado del documento ante DIAN.</p>`+
   d.controles.map(c=>`<div class="review-control"><span class="badge ${c.estado==='error'?'error':''}">${c.estado==='error'?'Error':'Correcto'}</span> <b>${esc(c.campo)}</b><div class="mono">${esc(c.valor)}</div><span>${esc(c.detalle)}</span></div>`).join('')+
   (d.asiento.length?`<details><summary>Asiento calculado en esta revisión</summary><div class="tablewrap"><table class="tbl"><thead><tr><th>Cuenta</th><th>NIT</th><th>Débito / crédito</th><th>Valor</th></tr></thead><tbody>${d.asiento.map(row=>`<tr><td>${esc(row[0])}</td><td>${esc(row[5])}</td><td>${row[7]==='1'?'Débito':'Crédito'}</td><td class="num">${esc(row[8])}</td></tr>`).join('')}</tbody></table></div></details>`:'');
}

function renderXmlFields(){
  const all=$('#xmlFieldSource').value==='container'?reviewData.campos_contenedor:reviewData.campos;
  const query=$('#xmlFieldSearch').value.toLocaleLowerCase();
  const fields=all.filter(f=>[f.ruta,f.valor,f.namespace,JSON.stringify(f.atributos)].join(' ').toLocaleLowerCase().includes(query));
  const pageSize=80,pages=Math.max(1,Math.ceil(fields.length/pageSize));
  reviewFieldPage=Math.min(reviewFieldPage,pages-1);
  $('#xmlFieldTable').innerHTML=`<div class="row between"><span class="muted">${fields.length} campos · página ${reviewFieldPage+1} de ${pages}</span><div><button class="btn small" id="fieldsPrev" ${reviewFieldPage===0?'disabled':''}>Anterior</button> <button class="btn small" id="fieldsNext" ${reviewFieldPage>=pages-1?'disabled':''}>Siguiente</button></div></div><div class="tablewrap"><table class="tbl xml-fields"><thead><tr><th>Ruta XML</th><th>Valor</th><th>Atributos / namespace</th></tr></thead><tbody>${fields.slice(reviewFieldPage*pageSize,(reviewFieldPage+1)*pageSize).map(f=>`<tr><td class="mono">${esc(f.ruta)}</td><td><pre>${esc(f.valor)}</pre></td><td class="mono">${Object.entries(f.atributos).map(([k,v])=>`${esc(k)} = ${esc(v)}`).join('<br>')}<details><summary>Namespace</summary>${esc(f.namespace||'Sin namespace')}</details></td></tr>`).join('')}</tbody></table></div>`;
  $('#fieldsPrev').onclick=()=>{reviewFieldPage--;renderXmlFields();};$('#fieldsNext').onclick=()=>{reviewFieldPage++;renderXmlFields();};
}
