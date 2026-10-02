const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const JSZip = require('jszip');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

function factura({ id = 'FV100', cufe = 'cufe-prueba-100', nit = '900111222', root = 'Invoice', total = '119000', moneda = 'COP' } = {}) {
  const line = root === 'CreditNote' ? 'CreditNoteLine' : root === 'DebitNote' ? 'DebitNoteLine' : 'InvoiceLine';
  const tax = '<cac:TaxTotal><cbc:TaxAmount currencyID="COP">19000</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount>100000</cbc:TaxableAmount><cbc:TaxAmount>19000</cbc:TaxAmount><cac:TaxCategory><cbc:Percent>19</cbc:Percent><cac:TaxScheme><cbc:ID>01</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>';
  return `<?xml version="1.0"?><${root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${root}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    <cbc:ID>${id}</cbc:ID><cbc:UUID>${cufe}</cbc:UUID><cbc:IssueDate>2026-09-23</cbc:IssueDate><cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>
    <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>800999888</cbc:CompanyID><cbc:RegistrationName>Proveedor de prueba</cbc:RegistrationName><cbc:TaxLevelCode>O-13</cbc:TaxLevelCode></cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
    <cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>${nit}</cbc:CompanyID><cbc:RegistrationName>Empresa de prueba</cbc:RegistrationName></cac:PartyTaxScheme></cac:Party></cac:AccountingCustomerParty>
    ${tax}<cac:LegalMonetaryTotal><cbc:LineExtensionAmount>100000</cbc:LineExtensionAmount><cbc:PayableAmount>${total}</cbc:PayableAmount></cac:LegalMonetaryTotal>
    <cac:${line}><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cbc:LineExtensionAmount>100000</cbc:LineExtensionAmount>${tax}<cac:Item><cbc:Description>PAPEL de prueba</cbc:Description></cac:Item></cac:${line}>
  </${root}>`;
}

test('Compras XML/ZIP → Contai en navegador aislado', async t => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://**/*', route => route.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname, '../gravimentes.html')).href);
  await page.waitForFunction(() => typeof DATA !== 'undefined' && DATA !== null && document.querySelector('#empresaLbl').textContent !== 'Iltda Demo SAS');
  await page.evaluate(() => { abrirImportZip(); document.querySelector('#izNit').value = '900111222'; });

  await t.test('XML sin red, IVA sin duplicar y plano de 13 columnas', async () => {
    await page.setInputFiles('#izFile', { name: 'factura.xml', mimeType: 'text/xml', buffer: Buffer.from(factura()) });
    await page.waitForFunction(() => DATA.comprasLote?.guardado && !comprasProcesando);
    const result = await page.evaluate(() => ({ lote: DATA.comprasLote, factura: DATA.facturas[0], nit: DATA.empresa.nit }));
    assert.equal(result.factura.iva, 19000);
    assert.equal(result.factura.subtotal_gravado, 100000);
    assert.equal(result.nit, '900111222');
    assert.equal(result.lote.incluidas, 1);
    assert.equal(result.lote.incidencias.length, 0);
    for (const row of result.lote.tsv.split('\r\n')) assert.equal(row.split('\t').length, 13);
    assert.equal(result.lote.documentos[0].debitos, 119000);
    assert.equal(result.lote.documentos[0].creditos, 119000);
    const downloaded = page.waitForEvent('download');
    await page.click('#izDownload');
    assert.match((await downloaded).suggestedFilename(), /^MOV_COMPRAS_900111222_.*\.txt$/);
  });

  await t.test('Facturas local fusionado: menú, detalle lineal y asiento en vivo', async () => {
    await page.evaluate(() => { location.hash = '#facturas'; });
    // Cerrar el importador por su clase evita depender del nombre histórico.
    await page.evaluate(() => document.querySelectorAll('.modal.on').forEach(el => el.classList.remove('on')));
    await page.locator('#v-facturas .fact-menu summary').first().click();
    assert.equal(await page.getByRole('button', {name:'Facturas XML/ZIP', exact:true}).isVisible(), true);
    await page.locator('#qFacturas').click();
    assert.equal(await page.locator('#v-facturas .fact-menu[open]').count(), 0);
    await page.evaluate(() => abrirFactura(DATA.facturas[0].id));
    assert.equal(await page.locator('#mFact [data-mtab]').count(), 0);
    for (const id of ['mfLineas','mfRetenciones','mfAsiento']) {
      assert.equal(await page.locator('#'+id).isVisible(), true);
    }
    assert.equal(await page.locator('#mfCnt details[open]').count(), 3);
    await page.locator('#mfCnt [data-section="lin"] summary').click();
    const cxp = page.locator('#mfAsiento input');
    await cxp.fill('220599');
    await cxp.press('Tab');
    await page.waitForFunction(() => DATA.facturas[0].cxpOverride === '220599');
    assert.match(await page.locator('#mfAsiento table').textContent(), /220599/);
    assert.equal(await page.locator('#mfCnt [data-section="lin"]').getAttribute('open'), null);
    await page.evaluate(() => cambiarTab('acu'));
    assert.equal(await page.locator('#mfAcuse').isVisible(), true);
    await page.evaluate(() => { changeCxpFactura(DATA.facturas[0].id, ''); cerrarModal('mFact'); });
    await page.reload();
    await page.waitForFunction(() => DATA?.facturas?.length === 1);
    await page.evaluate(() => abrirFactura(DATA.facturas[0].id));
    assert.equal(await page.locator('#mfAsiento').isVisible(), true);
    await page.setViewportSize({width:390, height:844});
    assert.equal(await page.evaluate(() => document.querySelector('#mFact .body').getBoundingClientRect().width <= innerWidth), true);
    await page.evaluate(() => cerrarModal('mFact'));
    await page.setViewportSize({width:1280, height:720});
    await page.evaluate(() => { abrirImportZip(); document.querySelector('#izNit').value = '900111222'; });
  });

  await t.test('reimportación idempotente y lote separado de facturas anteriores', async () => {
    await page.evaluate(async xml => {
      await procesarComprasFiles([new File([xml], 'duplicada.xml')]);
    }, factura());
    assert.deepEqual(await page.evaluate(() => [DATA.facturas.length, DATA.comprasLote.duplicadas, DATA.comprasLote.incluidas]), [1, 1, 1]);
    await page.evaluate(async xml => { await procesarComprasFiles([new File([xml], 'segunda.xml')]); }, factura({id:'FV101', cufe:'cufe-101'}));
    const lote = await page.evaluate(() => DATA.comprasLote);
    assert.equal(lote.incluidas, 1);
    assert.ok(lote.tsv.includes('FV101'));
    assert.ok(!lote.tsv.includes('FV100'));
  });

  await t.test('Espacios, navegación plegable, mes y revisión secuencial', async () => {
    await page.evaluate(() => { document.querySelectorAll('.modal.on').forEach(el => el.classList.remove('on')); navTo('facturas'); });
    await page.locator('#fMes').fill('2026-08');
    assert.match(await page.locator('#cntFacturas').textContent(), /0 de 2/);
    await page.locator('#spaceDashboard').click();
    assert.equal(await page.locator('#v-panel').isVisible(), true);
    await page.locator('#spaceAccounting').click();
    assert.equal(await page.locator('#v-facturas').isVisible(), true);
    assert.equal(await page.locator('#fMes').inputValue(), '2026-08');
    await page.locator('#fMes').fill('2026-09');
    assert.match(await page.locator('#cntFacturas').textContent(), /2 de 2/);
    await page.locator('#facturasTbl tbody tr').first().click();
    assert.equal(await page.locator('#mfAnterior').isDisabled(), true);
    assert.match(await page.locator('#mfPosicion').textContent(), /1 de 2/);
    await page.locator('#mfSiguiente').click();
    assert.match(await page.locator('#mfPosicion').textContent(), /2 de 2/);
    assert.equal(await page.locator('#mfSiguiente').isDisabled(), true);
    await page.evaluate(() => cerrarModal('mFact'));
    await page.locator('#toggleModules').click();
    assert.equal(await page.locator('#moduleNav').isVisible(), false);
    await page.locator('#toggleModules').click();
    assert.equal(await page.locator('#moduleNav').isVisible(), true);
    await page.setViewportSize({width:390, height:844});
    await page.evaluate(() => navTo('facturas'));
    assert.equal(await page.locator('#moduleNav').isVisible(), false);
    await page.locator('#toggleModules').click();
    assert.equal(await page.locator('#moduleNav').isVisible(), true);
    await page.locator('#moduleNav [data-v="terceros"]').click();
    assert.equal(await page.locator('#moduleNav').isVisible(), false);
    await page.evaluate(() => navTo('facturas'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#clearMonth').click();
    await page.setViewportSize({width:1280, height:720});
    await page.evaluate(() => abrirImportZip());
  });

  await t.test('Estados derivados y asistente de incidencias sin cambiar estado contable', async () => {
    const snapshot = await page.evaluate(() => JSON.stringify(DATA.facturas));
    await page.evaluate(() => {
      document.querySelectorAll('.modal.on').forEach(el => el.classList.remove('on'));
      DATA.facturas[0].cxpOverride = '12';
      DATA.facturas[1].terceroId = 'inexistente';
      navTo('facturas'); renderFacturas();
    });
    await page.locator('#fRevision').selectOption('error');
    assert.equal(await page.locator('#facturasTbl tbody tr').count(), 2);
    assert.match(await page.locator('#reviewIssues').textContent(), /2/);
    await page.locator('#reviewIssues').click();
    assert.match(await page.locator('#mfPosicion').textContent(), /Incidencia 1 de 2/);
    assert.match(await page.locator('#mfRevision').textContent(), /cuentas o importes inválidos/);
    assert.equal(await page.locator('#mfCausar').isDisabled(), true);
    await page.evaluate(() => causar());
    await page.locator('#mfSiguiente').click();
    assert.match(await page.locator('#mfRevision').textContent(), /tercero con identificación válida/);
    assert.match(await page.locator('#mfPosicion').textContent(), /Incidencia 2 de 2/);
    const before = JSON.parse(snapshot).map(f => f.estado);
    assert.deepEqual(await page.evaluate(() => DATA.facturas.map(f => f.estado)), before);
    const checks = await page.evaluate(() => {
      const f = structuredClone(DATA.facturas[0]);
      delete f.cxpOverride;
      const baseline = evaluarRevisionFactura(f);
      f.origen_xml = {...f.origen_xml, validacion:['IVA inconsistente <archivo>']};
      const xml = evaluarRevisionFactura(f);
      f.origen_xml.validacion = []; f.fecha = '2026-02-30';
      const date = evaluarRevisionFactura(f);
      f.total = 'dato inválido';
      return {baseline, xml, date, amount:evaluarRevisionFactura(f)};
    });
    assert.notEqual(checks.baseline.estado, 'error');
    assert.equal(checks.xml.estado, 'error');
    assert.ok(checks.xml.motivos.includes('IVA inconsistente <archivo>'));
    assert.equal(checks.amount.estado, 'error');
    assert.equal(checks.date.estado, 'error');
    await page.evaluate(snapshot => {
      DATA.facturas = JSON.parse(snapshot);
      cerrarModal('mFact'); facturaFilters.revision = ''; document.querySelector('#fRevision').value = ''; renderFacturas();
      abrirImportZip();
    }, snapshot);
  });

  await t.test('ZIP anidado, AttachedDocument y nota crédito reversa', async () => {
    await page.addScriptTag({ path: require.resolve('jszip/dist/jszip.min.js') });
    const wrapped = `<AttachedDocument xmlns="urn:oasis:names:specification:ubl:schema:xsd:AttachedDocument-2"><Attachment><ExternalReference><Description><![CDATA[${factura({id:'FV102', cufe:'cufe-102'})}]]></Description></ExternalReference></Attachment></AttachedDocument>`;
    const inner = await new JSZip().file('factura.xml', wrapped).generateAsync({type:'nodebuffer'});
    const zip = await new JSZip().file('anidado.zip', inner).file('nota.xml', factura({id:'NC1', cufe:'cufe-nc1', root:'CreditNote'})).generateAsync({type:'nodebuffer'});
    await page.setInputFiles('#izFile', { name:'lote.zip', mimeType:'application/zip', buffer:zip });
    await page.waitForFunction(() => DATA.comprasLote?.documentos.some(d => d.documento === 'NC1') && !comprasProcesando);
    const lote = await page.evaluate(() => DATA.comprasLote);
    assert.equal(lote.incluidas, 2);
    const nota = lote.tsv.split('\r\n').slice(1).map(r => r.split('\t')).filter(r => r[3] === 'NC1');
    assert.ok(nota.some(r => r[0].startsWith('22') && r[7] === '1'));
    assert.ok(nota.some(r => r[0].startsWith('5') && r[7] === '2'));
  });

  await t.test('excluye comprador incorrecto, XML roto, moneda y totales no soportados', async () => {
    await page.evaluate(async xmls => { await procesarComprasFiles(xmls.map((xml,i) => new File([xml], `error-${i}.xml`))); }, [
      factura({id:'FV103',cufe:'cufe-103',nit:'123456789'}), '<Invoice><roto>',
      factura({id:'FV104',cufe:'cufe-104',total:'110000'}), factura({id:'FV105',cufe:'cufe-105',moneda:'USD'})
    ]);
    const lote = await page.evaluate(() => DATA.comprasLote);
    assert.equal(lote.incluidas, 0);
    assert.equal(lote.incidencias.length, 4);
    assert.equal(lote.tsv, '');
    assert.equal(await page.locator('#izDownload').isDisabled(), true);
  });

  await t.test('no exporta documentos causados', async () => {
    await page.evaluate(async xml => {
      DATA.facturas[0].estado = 'causada';
      await procesarComprasFiles([new File([xml], 'causada.xml')]);
    }, factura());
    assert.equal(await page.evaluate(() => DATA.comprasLote.incluidas), 0);
  });

  await t.test('detecta cuentas ajenas al maestro y CUFE con importes modificados', async () => {
    await page.evaluate(async xml => {
      localStorage.setItem('gv.pdc.900111222', JSON.stringify({cuentas:{'999999':{activa:true,recibe:true}}}));
      await procesarComprasFiles([new File([xml], 'maestro.xml')]);
      localStorage.removeItem('gv.pdc.900111222');
    }, factura({id:'FV101',cufe:'cufe-101'}));
    assert.match(await page.evaluate(() => DATA.comprasLote.incidencias[0].motivo), /maestro/);
    await page.evaluate(async xml => {
      const f = DATA.facturas.find(x => x.cufe === 'cufe-101');
      f.iva = 38000;
      await procesarComprasFiles([new File([xml], 'diferente.xml')]);
      f.iva = 19000;
    }, factura({id:'FV101',cufe:'cufe-101'}));
    assert.match(await page.evaluate(() => DATA.comprasLote.incidencias[0].motivo), /importes diferentes/);
    assert.equal(await page.evaluate(() => DATA.comprasLote.tsv), '');
  });

  await t.test('fallo de disco no deja un plano descargable ni en caché', async () => {
    const result = await page.evaluate(async xml => {
      STORAGE.mode = 'disco';
      STORAGE.dirHandle = {getFileHandle: async () => { throw new Error('Disco de prueba no disponible'); }};
      await procesarComprasFiles([new File([xml], 'fallo.xml')]);
      STORAGE.mode = 'local'; STORAGE.dirHandle = null;
      return {lote:DATA.comprasLote, cache:JSON.parse(localStorage.getItem(LS)).comprasLote};
    }, factura({id:'FV101',cufe:'cufe-101'}));
    assert.equal(result.lote.guardado, false);
    assert.equal(result.cache.guardado, false);
    assert.equal(result.cache.tsv, '');
    assert.equal(await page.locator('#izDownload').isDisabled(), true);
  });

  await t.test('restaura último lote tras recargar y guarda nómina en carpeta', async () => {
    await page.evaluate(async xml => { await procesarComprasFiles([new File([xml], 'segunda.xml')]); }, factura({id:'FV101',cufe:'cufe-101'}));
    await page.reload();
    await page.waitForFunction(() => DATA?.comprasLote?.guardado);
    assert.equal(await page.evaluate(() => DATA.comprasLote.incluidas), 1);
    const saved = await page.evaluate(async () => {
      const files = {};
      DATA.nomina = [{cune:'nomina-prueba'}];
      STORAGE.mode = 'disco';
      STORAGE.dirHandle = { getFileHandle: async name => ({ createWritable: async () => ({ write: async text => { files[name] = JSON.parse(text); }, close: async () => {} }) }) };
      await save();
      STORAGE.mode = 'local'; STORAGE.dirHandle = null;
      return files;
    });
    assert.equal(saved['nomina.json'][0].cune, 'nomina-prueba');
    assert.equal(saved['compras-lote.json'].incluidas, 1);
  });

  await t.test('guardados concurrentes esperan la última escritura y carpeta solo nómina se conserva', async () => {
    const result = await page.evaluate(async () => {
      const files = {};
      let release, started;
      const gate = new Promise(resolve => { release = resolve; });
      const ready = new Promise(resolve => { started = resolve; });
      let first = true;
      STORAGE.mode = 'disco';
      STORAGE.dirHandle = { getFileHandle: async name => ({
        createWritable: async () => ({write: async text => {
          if (first) { first = false; started(); await gate; }
          files[name] = JSON.parse(text);
        }, close: async () => {}}),
        getFile: async () => ({text: async () => JSON.stringify(files[name])})
      }) };
      const p1 = save();
      await ready;
      DATA.nomina.push({cune:'segunda-nomina'});
      let finished = false;
      const p2 = save().then(() => { finished = true; });
      await Promise.resolve();
      const waited = !finished;
      release();
      await Promise.all([p1,p2]);
      files['facturas.json'] = [];
      files['terceros.json'] = [];
      await loadFromDisk();
      STORAGE.mode = 'local'; STORAGE.dirHandle = null;
      return {waited, nomina:DATA.nomina.length, saved:files['nomina.json'].length};
    });
    assert.deepEqual(result, {waited:true, nomina:2, saved:2});
  });
  assert.deepEqual(errors, []);
});
