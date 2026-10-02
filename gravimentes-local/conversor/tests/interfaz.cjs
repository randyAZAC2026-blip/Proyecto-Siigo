const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {spawn} = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

test('Interfaz completa: configurar, convertir, inspeccionar, descargar y versionar', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'gravimentes-ui-'));
  const child = spawn('python',['-B','-u',path.resolve(__dirname,'../servidor.py'),'--sin-abrir','--puerto','0','--db',path.join(dir,'test.sqlite3')]);
  const closed = new Promise(resolve => child.once('exit',resolve));
  t.after(async()=>{child.kill();await closed;await fs.rm(dir,{recursive:true,force:true});});
  const url = await new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(Error('Servidor no inició: '+output)),15000);
    child.stdout.on('data',data=>{output+=data;const found=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(found){clearTimeout(timer);resolve(found[0]);}});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
  });
  const browser=await chromium.launch({channel:'msedge',headless:true});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];
  const focusErrors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.text().includes('not focusable'))focusErrors.push(message.text());});
  await page.goto(url);
  await page.waitForFunction(()=>state.defaults);
  assert.equal(await page.locator('#run').isDisabled(),true);
  await page.fill('[name=nit]','900111222');
  await page.fill('[name=empresa]','Empresa de prueba');
  // El primer lote funciona sin haber creado ni guardado ninguna regla.
  assert.equal(await page.locator('.rule').count(),0);
  const initialXml=(await fs.readFile(path.join(__dirname,'factura.xml'),'utf8')).replaceAll('PRUEBA100','PRUEBA-SIN-REGLAS').replaceAll('CUFE-SINTETICO-PRUEBA-100','CUFE-SINTETICO-SIN-REGLAS');
  await page.setInputFiles('#files',{name:'sin-reglas.xml',mimeType:'text/xml',buffer:Buffer.from(initialXml)});
  await page.click('#run');
  await page.waitForFunction(()=>current?.aceptados===1&&!busy);
  assert.deepEqual(await page.evaluate(()=>current.configuracion.reglas),[]);
  assert.equal(await page.evaluate(()=>current.documentos[0].asiento[0][0]),'519530');
  assert.equal(await page.evaluate(()=>current.debitos===current.creditos),true);
  await page.click('button:has-text("Vaciar selección")');
  await page.click('summary:has-text("Reglas de clasificación")');
  await page.click('button:has-text("Añadir regla")');
  await page.fill('.ruleText','PAPEL');
  await page.fill('.ruleAccount','519515');
  await page.click('#saveConfig');
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Empresa guardada'));
  await page.setInputFiles('#files',path.join(__dirname,'factura.xml'));
  // Una regla inválida dentro de una sección cerrada no debe silenciar el clic.
  let conversions=0;
  page.on('request',r=>{if(r.url().endsWith('/api/procesar'))conversions++;});
  await page.fill('.ruleAccount','');
  await page.locator('.ruleAccount').evaluate(el=>el.closest('details').open=false);
  await page.click('#run');
  await page.locator('#runMessage').waitFor({state:'visible',timeout:3000});
  assert.match(await page.locator('#runMessage').textContent(),/cuenta.*regla/i);
  assert.equal(await page.locator('.ruleAccount').evaluate(el=>el.closest('details').open),true);
  assert.equal(conversions,0);
  await page.fill('.ruleAccount','519515');
  // También debe normalizar los espacios de un NIT pegado, antes de validar.
  await page.fill('[name=nit]',' 900.111.222\u200b ');
  // Las filas completamente vacías son opcionales, aun con la sección plegada.
  for(let i=0;i<3;i++)await page.click('button:has-text("Añadir regla")');
  await page.locator('.ruleAccount').first().evaluate(el=>el.closest('details').open=false);
  await page.click('#run');
  await page.waitForFunction(()=>current?.aceptados===1&&!busy);
  assert.equal(await page.locator('[name=nit]').inputValue(),'900111222');
  assert.equal(conversions,1);
  assert.equal(await page.evaluate(()=>current.configuracion.reglas.length),1);
  assert.equal(await page.locator('#result .stat').count(),4);
  await page.click('button:has-text("Ver asiento")');
  assert.ok((await page.locator('#detailContent').textContent()).includes('519515'));
  await page.click('#detail button');
  const downloading=page.waitForEvent('download');
  await page.click('a:has-text("Solo plano")');
  const download=await downloading;
  assert.equal(download.suggestedFilename(),'CONT_AI_900111222.txt');
  const content=await fs.readFile(await download.path(),'utf8');
  assert.equal(content.trimEnd().split('\n').length,4);
  assert.ok(content.includes('119000.1190'));
  await page.locator('.ruleAccount').first().evaluate(el=>el.closest('details').open=true);
  await page.locator('.ruleAccount').first().fill('143515');
  await page.click('#regenerate');
  await page.waitForFunction(()=>current?.reprocesa&&!busy);
  assert.equal(await page.evaluate(()=>current.documentos[0].asiento[0][0]),'143515');
  await page.click('#navHistory');
  assert.equal(await page.locator('#history tbody tr').count(),3);
  await page.reload();
  await page.waitForFunction(()=>state.lotes.length===3);
  await page.click('#navHistory');
  await page.locator('#history button').first().click();
  await page.waitForFunction(()=>current?.reprocesa);
  assert.equal(await page.locator('[name=nit]').inputValue(),'900111222');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  // La revisión debe conservar todos los campos de los rechazados y mostrar DS como gasto.
  await page.setViewportSize({width:1440,height:1000});
  const sourceXml=await fs.readFile(path.join(__dirname,'factura.xml'),'utf8');
  const support=sourceXml.replace('<cbc:InvoiceTypeCode>01','<cbc:InvoiceTypeCode>05')
    .replaceAll('CUFE-SINTETICO-PRUEBA-100','CUFE-SOPORTE-REVISION')
    .replace(/<cac:TaxTotal>[\s\S]*?<\/cac:TaxTotal>/g,'').replaceAll('119000.1190','100000.1000');
  await page.setInputFiles('#files',[
    {name:'error-moneda.xml',mimeType:'text/xml',buffer:Buffer.from(sourceXml.replace('>COP<','>USD<'))},
    {name:'soporte.xml',mimeType:'text/xml',buffer:Buffer.from(support)}
  ]);
  await page.click('#run');
  await page.waitForFunction(()=>!busy&&current?.errores===1&&current?.aceptados===1);
  await page.click('button:has-text("Revisar XML y errores")');
  await page.waitForFunction(()=>reviewBatch?.documentos.length===2);
  await page.click('[data-review-index="0"]');
  await page.waitForFunction(()=>reviewData?.indice===0);
  assert.match(await page.locator('#reviewContent').textContent(),/USD/);
  assert.equal(await page.evaluate(()=>reviewData.apto),false);
  await page.click('[data-review-tab="fields"]');
  await page.fill('#xmlFieldSearch','DocumentCurrencyCode');
  assert.match(await page.locator('#xmlFieldTable').textContent(),/USD/);
  await page.click('[data-review-tab="xml"]');
  assert.match(await page.locator('.xml-code').textContent(),/<cbc:DocumentCurrencyCode>USD/);
  await page.click('[data-review-index="1"]');
  await page.waitForFunction(()=>reviewData?.indice===1);
  assert.equal(await page.evaluate(()=>reviewData.apto),true);
  assert.match(await page.locator('#reviewContent').textContent(),/Documento soporte \(gasto\)/);
  await page.selectOption('#reviewStatus','error');
  assert.equal(await page.locator('[data-review-index]').count(),1);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.click('#reviewOpenLot');
  await page.waitForFunction(()=>!document.querySelector('#newView').classList.contains('hidden'));
  await page.setInputFiles('#files',path.join(__dirname,'factura.xml'));
  await page.route('**/api/procesar',route=>route.abort('connectionrefused'));
  await page.click('#run');
  await page.waitForFunction(()=>!busy&&document.querySelector('#runMessage').textContent.includes('No se pudo conectar'));
  assert.equal(await page.locator('#runMessage').isVisible(),true);
  assert.equal(await page.locator('#run').isDisabled(),false);
  assert.deepEqual(focusErrors,[]);
  assert.deepEqual(errors,[]);
});
