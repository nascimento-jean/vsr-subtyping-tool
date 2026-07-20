import { BrowserMultiFormatReader } from '@zxing/browser';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createWorker, PSM } from 'tesseract.js';
import './style.css';

const STORAGE_KEY = 'vsr-subtyping-tool-run-v2';
const dateNow = () => new Date().toLocaleDateString('pt-BR');
const blankRun = () => ({ extractionKit: '', pcrKit: '', executionDate: dateNow(), extractedBy: '', analyzedBy: '', checkedBy: '', samples: [] });
let run = loadRun();
let scannerControls = null;
let cameraStream = null;
let ocrWorker = null;
let deferredInstallPrompt = null;

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div><span class="brand-mark">VSR</span><strong>Subtyping Tool</strong></div>
    <button id="install-button" class="install-button hidden">Instalar app</button>
  </header>
  <main>
    <section class="hero">
      <div><p class="eyebrow">LACEN/AL</p><h1>Subtipagem de VSR</h1><p>Registre o GAL, informe os CTs e gere o relatório em PDF.</p></div>
      <div class="sample-count"><strong id="sample-count">0</strong><span>amostras</span></div>
    </section>

    <section class="panel">
      <h2>Dados da execução</h2>
      <div class="grid grid-3">
        ${field('extraction-kit', 'Kit de extração')}
        ${field('pcr-kit', 'Kit de PCR')}
        ${field('execution-date', 'Data de execução', 'text', 'DD/MM/AAAA')}
      </div>
    </section>

    <section class="panel accent-panel">
      <div class="section-heading"><div><span class="step">1</span><h2>Adicionar amostra</h2></div><span class="offline-badge">Salvo no aparelho</span></div>
      <label for="gal">Número GAL</label>
      <div class="scan-row">
        <input id="gal" inputmode="numeric" autocomplete="off" placeholder="Ex.: 260712000074" maxlength="20" />
        <button id="photo-button" class="secondary-button photo-button">Fotografar GAL</button>
      </div>
      <button id="scan-button" class="barcode-link">Tentar código de barras</button>
      <p id="gal-warning" class="warning hidden">Este GAL já está na lista.</p>
      <div class="grid grid-2 ct-grid">
        ${field('ct-a', 'CT VSR-A', 'decimal', 'Ex.: 28,4')}
        ${field('ct-b', 'CT VSR-B', 'decimal', 'Ex.: 31,2')}
      </div>
      <button id="add-button" class="primary-button">Adicionar à execução</button>
    </section>

    <section class="samples-section">
      <div class="section-heading"><h2>Amostras <span id="list-count">(0)</span></h2><button id="new-run" class="text-danger hidden">Nova execução</button></div>
      <div id="sample-list"></div>
    </section>

    <section class="panel">
      <h2>Responsáveis</h2>
      <div class="grid grid-3">
        ${field('extracted-by', 'Extraído por')}
        ${field('analyzed-by', 'Analisado por')}
        ${field('checked-by', 'Conferido por')}
      </div>
    </section>

    <div class="export-buttons">
      <button id="pdf-button" class="primary-button pdf-button">Baixar PDF</button>
      <button id="excel-button" class="primary-button excel-button">Baixar Excel</button>
    </div>
    <p class="privacy">Os dados permanecem armazenados somente neste aparelho.</p>
    <button id="ios-help" class="ios-help hidden">Como instalar no iPhone?</button>
  </main>

  <dialog id="scanner-dialog">
    <div class="scanner-header"><div><strong id="scanner-title">Fotografar número GAL</strong><span id="scanner-subtitle">Centralize o texto “GAL - 000...”</span></div><button id="close-scanner" aria-label="Fechar">×</button></div>
    <div class="video-wrap"><video id="scanner-video" playsinline muted></video><div class="scan-frame"></div></div>
    <p id="scanner-message">Aproxime o tubo até o número ocupar o quadro.</p>
    <button id="capture-button" class="capture-button">Capturar e reconhecer</button>
    <div id="photo-result" class="photo-result hidden">
      <span>Confira o número na imagem ampliada:</span>
      <img id="ocr-preview" alt="Trecho fotografado da etiqueta GAL" />
      <input id="ocr-gal-input" inputmode="numeric" maxlength="20" placeholder="Digite ou corrija o GAL" />
      <div><button id="retry-photo" class="retry-button">Nova foto</button><button id="confirm-photo-gal" class="confirm-button">Usar este GAL</button></div>
    </div>
  </dialog>

  <dialog id="install-dialog" class="help-dialog">
    <button id="close-help" class="dialog-close" aria-label="Fechar">×</button>
    <h2>Instalar no iPhone</h2>
    <ol><li>Abra esta página no <strong>Safari</strong>.</li><li>Toque no botão <strong>Compartilhar</strong>.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Confirme em <strong>Adicionar</strong>.</li></ol>
  </dialog>`;

function field(id, label, inputmode = 'text', placeholder = '') {
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" inputmode="${inputmode}" placeholder="${placeholder}" /></div>`;
}

const $ = (id) => document.getElementById(id);
const fields = {
  extractionKit: $('extraction-kit'), pcrKit: $('pcr-kit'), executionDate: $('execution-date'),
  extractedBy: $('extracted-by'), analyzedBy: $('analyzed-by'), checkedBy: $('checked-by'),
};

Object.entries(fields).forEach(([key, input]) => {
  input.value = run[key];
  input.addEventListener('input', () => { run[key] = input.value; saveRun(); });
});

const cleanGal = (value) => value.replace(/\D/g, '');
const cleanCt = (value) => value.replace(',', '.').replace(/[^0-9.]/g, '');
const detected = (value) => value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
const resultFor = ({ ctA, ctB }) => detected(ctA) && detected(ctB) ? 'VSR-A/VSR-B' : detected(ctA) ? 'VSR-A' : detected(ctB) ? 'VSR-B' : 'Não detectado';

$('gal').addEventListener('input', (event) => {
  event.target.value = cleanGal(event.target.value);
  $('gal-warning').classList.toggle('hidden', !run.samples.some((sample) => sample.gal === event.target.value));
});
['ct-a', 'ct-b'].forEach((id) => $(id).addEventListener('input', (event) => { event.target.value = cleanCt(event.target.value); }));

$('add-button').addEventListener('click', () => {
  const gal = cleanGal($('gal').value);
  if (!gal) return alert('Leia o código ou informe o número GAL.');
  if (run.samples.some((sample) => sample.gal === gal)) return alert('Este GAL já foi adicionado.');
  run.samples.push({ id: crypto.randomUUID(), gal, ctA: $('ct-a').value, ctB: $('ct-b').value });
  $('gal').value = $('ct-a').value = $('ct-b').value = '';
  saveRun(); renderSamples();
  $('gal').focus();
});

function renderSamples() {
  $('sample-count').textContent = run.samples.length;
  $('list-count').textContent = `(${run.samples.length})`;
  $('new-run').classList.toggle('hidden', !run.samples.length);
  $('sample-list').innerHTML = run.samples.length ? run.samples.map((sample, index) => `
    <article class="sample-card">
      <span class="number">${index + 1}</span>
      <div><strong>GAL ${sample.gal}</strong><p>VSR-A: ${sample.ctA || '-'} · VSR-B: ${sample.ctB || '-'}</p><span class="result">${resultFor(sample)}</span></div>
      <button class="delete-sample" data-id="${sample.id}">Excluir</button>
    </article>`).join('') : `<div class="empty-state"><strong>Nenhuma amostra registrada</strong><span>Leia um código GAL ou digite-o para começar.</span></div>`;
  document.querySelectorAll('.delete-sample').forEach((button) => button.addEventListener('click', () => {
    run.samples = run.samples.filter((sample) => sample.id !== button.dataset.id); saveRun(); renderSamples();
  }));
}

$('new-run').addEventListener('click', () => {
  if (!confirm('Iniciar uma nova execução e apagar a lista atual?')) return;
  run = blankRun(); Object.entries(fields).forEach(([key, input]) => { input.value = run[key]; }); saveRun(); renderSamples();
});

$('photo-button').addEventListener('click', startPhotoOcr);
$('scan-button').addEventListener('click', startBarcodeScanner);
$('capture-button').addEventListener('click', captureAndRecognizeGal);
$('retry-photo').addEventListener('click', () => { $('photo-result').classList.add('hidden'); $('capture-button').classList.remove('hidden'); $('scanner-message').textContent = 'Aproxime o tubo até o número ocupar o quadro.'; });
$('ocr-gal-input').addEventListener('input', (event) => { event.target.value = cleanGal(event.target.value); });
$('confirm-photo-gal').addEventListener('click', () => {
  const value = cleanGal($('ocr-gal-input').value);
  if (value.length < 10) return alert('Confira a imagem e informe o número GAL completo.');
  $('gal').value = value; $('gal').dispatchEvent(new Event('input')); stopScanner();
});
$('close-scanner').addEventListener('click', stopScanner);
async function openCamera() {
  cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  $('scanner-video').srcObject = cameraStream;
  await $('scanner-video').play();
}
async function startPhotoOcr() {
  $('scanner-dialog').showModal();
  $('scanner-title').textContent = 'Fotografar número GAL';
  $('scanner-subtitle').textContent = 'Centralize o texto “GAL - 000...”';
  $('scanner-message').textContent = 'Aproxime o tubo até o número ocupar o quadro.';
  $('capture-button').classList.remove('hidden');
  $('photo-result').classList.add('hidden');
  try { await openCamera(); } catch { $('scanner-message').textContent = 'Não foi possível abrir a câmera. Verifique a permissão do navegador.'; }
}
async function startBarcodeScanner() {
  $('scanner-dialog').showModal();
  $('scanner-title').textContent = 'Ler código de barras';
  $('scanner-subtitle').textContent = 'Centralize as barras dentro do quadro';
  $('scanner-message').textContent = 'Este modo pode falhar quando a etiqueta estiver dobrada.';
  $('capture-button').classList.add('hidden');
  try {
    const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250 });
    scannerControls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }, $('scanner-video'), (result) => {
      if (!result) return;
      const value = cleanGal(result.getText());
      if (!value) return;
      $('gal').value = value; stopScanner(); $('gal').dispatchEvent(new Event('input'));
    });
  } catch (error) {
    $('scanner-message').textContent = 'Não foi possível abrir a câmera. Verifique a permissão do navegador e tente novamente.';
  }
}
async function captureAndRecognizeGal() {
  const video = $('scanner-video');
  if (!video.videoWidth) return;
  const button = $('capture-button');
  button.disabled = true;
  button.textContent = 'Reconhecendo...';
  $('scanner-message').textContent = 'Preparando a imagem. A primeira leitura pode levar alguns segundos.';
  try {
    const cropWidth = Math.round(video.videoWidth * 0.84);
    const cropHeight = Math.round(video.videoHeight * 0.42);
    const cropX = Math.round((video.videoWidth - cropWidth) / 2);
    const cropY = Math.round((video.videoHeight - cropHeight) / 2);
    const canvas = document.createElement('canvas');
    const targetWidth = Math.max(1400, cropWidth);
    canvas.width = targetWidth;
    canvas.height = Math.round(targetWidth * cropHeight / cropWidth);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = contrasted;
    }
    context.putImageData(pixels, 0, 0);
    $('ocr-preview').src = canvas.toDataURL('image/jpeg', 0.9);
    $('ocr-gal-input').value = '';
    $('photo-result').classList.remove('hidden');
    $('capture-button').classList.add('hidden');
    if (!ocrWorker) {
      ocrWorker = await createWorker('eng', 1, { logger: ({ status, progress }) => {
        if (status === 'recognizing text') $('scanner-message').textContent = `Lendo o GAL... ${Math.round(progress * 100)}%`;
      }});
      await ocrWorker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    }
    const { data: { text } } = await ocrWorker.recognize(canvas);
    const normalized = text.toUpperCase().replace(/[OQD]/g, '0').replace(/[IL|]/g, '1');
    const afterGal = normalized.match(/GA1?\s*[-:]?\s*([0-9\s]{10,18})/i)?.[1]?.replace(/\s/g, '');
    const candidates = normalized.match(/\d{10,14}/g) || [];
    const value = cleanGal(afterGal || candidates.sort((a, b) => b.length - a.length)[0] || '');
    $('ocr-gal-input').value = value;
    $('scanner-message').textContent = value.length >= 10 ? 'Sugestão preenchida. Compare cada dígito com a foto.' : 'A leitura automática não foi segura. Digite o GAL olhando a imagem ampliada.';
    $('ocr-gal-input').focus();
  } catch {
    $('scanner-message').textContent = 'A leitura não foi concluída. Verifique a conexão e tente novamente.';
  } finally {
    button.disabled = false;
    button.textContent = 'Capturar e reconhecer';
  }
}
function stopScanner() {
  scannerControls?.stop(); scannerControls = null;
  cameraStream?.getTracks().forEach((track) => track.stop()); cameraStream = null;
  $('scanner-video').srcObject?.getTracks().forEach((track) => track.stop());
  $('scanner-dialog').close();
}

$('pdf-button').addEventListener('click', () => {
  if (!run.samples.length) return alert('Adicione ao menos uma amostra antes de gerar o PDF.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('LABORATÓRIO CENTRAL DE SAÚDE PÚBLICA - LACEN/AL', 105, 14, { align: 'center' });
  doc.setFontSize(11); doc.text('SUBTIPAGEM DE VÍRUS SINCICIAL RESPIRATÓRIO', 105, 21, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Kit de extração: ${run.extractionKit || '-'}`, 14, 30);
  doc.text(`Kit de PCR: ${run.pcrKit || '-'}`, 110, 30);
  doc.text(`Data de execução: ${run.executionDate || '-'}`, 14, 36);
  autoTable(doc, { startY: 42, head: [['Nº', 'GAL', 'VSR-A (CT)', 'VSR-B (CT)', 'Resultado']], body: run.samples.map((s, i) => [i + 1, s.gal, s.ctA || '-', s.ctB || '-', resultFor(s)]), theme: 'grid', headStyles: { fillColor: [7, 89, 133] }, styles: { fontSize: 8, cellPadding: 2 } });
  const end = doc.lastAutoTable.finalY + 10;
  doc.text(`Extraído por: ${run.extractedBy || '-'}`, 14, end);
  doc.text(`Analisado por: ${run.analyzedBy || '-'}`, 14, end + 7);
  doc.text(`Conferido por: ${run.checkedBy || '-'}`, 14, end + 14);
  doc.save(`subtipagem-vsr-${new Date().toISOString().slice(0, 10)}.pdf`);
});

$('excel-button').addEventListener('click', exportExcel);
async function exportExcel() {
  if (!run.samples.length) return alert('Adicione ao menos uma amostra antes de gerar o Excel.');
  const button = $('excel-button');
  button.disabled = true;
  button.textContent = 'Gerando Excel...';
  try {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VSR Subtyping Tool';
    workbook.created = new Date();
    workbook.subject = 'Subtipagem de Vírus Sincicial Respiratório';

    const report = workbook.addWorksheet('Relatório', {
      views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 } },
    });
    report.mergeCells('A1:E1');
    report.getCell('A1').value = 'LABORATÓRIO CENTRAL DE SAÚDE PÚBLICA - LACEN/AL';
    report.mergeCells('A2:E2');
    report.getCell('A2').value = 'SUBTIPAGEM DE VÍRUS SINCICIAL RESPIRATÓRIO';
    report.getCell('A3').value = 'Kit de extração'; report.getCell('B3').value = run.extractionKit || '-';
    report.getCell('D3').value = 'Kit de PCR'; report.getCell('E3').value = run.pcrKit || '-';
    report.getCell('A4').value = 'Data de execução'; report.getCell('B4').value = run.executionDate || '-';
    report.getCell('D4').value = 'Total de amostras'; report.getCell('E4').value = run.samples.length;
    report.getRow(7).values = ['Nº', 'GAL', 'VSR-A (CT)', 'VSR-B (CT)', 'Resultado'];
    run.samples.forEach((sample, index) => report.addRow([index + 1, sample.gal, sample.ctA ? Number(sample.ctA) : null, sample.ctB ? Number(sample.ctB) : null, resultFor(sample)]));
    const signatureStart = 8 + run.samples.length + 2;
    report.getCell(`A${signatureStart}`).value = 'Extraído por'; report.getCell(`B${signatureStart}`).value = run.extractedBy || '-';
    report.getCell(`A${signatureStart + 1}`).value = 'Analisado por'; report.getCell(`B${signatureStart + 1}`).value = run.analyzedBy || '-';
    report.getCell(`A${signatureStart + 2}`).value = 'Conferido por'; report.getCell(`B${signatureStart + 2}`).value = run.checkedBy || '-';

    report.getColumn(1).width = 8; report.getColumn(2).width = 22; report.getColumn(3).width = 16; report.getColumn(4).width = 16; report.getColumn(5).width = 23;
    ['A1', 'A2'].forEach((cell, index) => { report.getCell(cell).font = { bold: true, size: index === 0 ? 14 : 12, color: { argb: 'FF0F2940' } }; report.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' }; });
    report.getRow(1).height = 25; report.getRow(2).height = 22;
    ['A3', 'D3', 'A4', 'D4'].forEach((cell) => { report.getCell(cell).font = { bold: true, color: { argb: 'FF475569' } }; });
    const header = report.getRow(7);
    header.height = 23;
    header.eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; });
    for (let rowNumber = 8; rowNumber < 8 + run.samples.length; rowNumber += 1) {
      const row = report.getRow(rowNumber);
      row.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9E2EA' } } }; cell.alignment = { vertical: 'middle', horizontal: cell.col === 2 || cell.col === 5 ? 'left' : 'center' }; });
      row.getCell(2).numFmt = '@'; row.getCell(3).numFmt = '0.00'; row.getCell(4).numFmt = '0.00';
      if (rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F7FA' } }; });
    }
    report.autoFilter = { from: 'A7', to: `E${7 + run.samples.length}` };
    report.printArea = `A1:E${signatureStart + 2}`;

    const data = workbook.addWorksheet('Dados', { views: [{ state: 'frozen', ySplit: 1 }] });
    data.columns = [
      { header: 'Número', key: 'number', width: 10 }, { header: 'GAL', key: 'gal', width: 22 },
      { header: 'VSR-A_CT', key: 'ctA', width: 15 }, { header: 'VSR-B_CT', key: 'ctB', width: 15 },
      { header: 'Resultado', key: 'result', width: 22 }, { header: 'Data_execução', key: 'date', width: 18 },
    ];
    run.samples.forEach((sample, index) => data.addRow({ number: index + 1, gal: sample.gal, ctA: sample.ctA ? Number(sample.ctA) : null, ctB: sample.ctB ? Number(sample.ctB) : null, result: resultFor(sample), date: run.executionDate }));
    data.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } }; });
    data.getColumn('gal').numFmt = '@'; data.getColumn('ctA').numFmt = '0.00'; data.getColumn('ctB').numFmt = '0.00';
    data.autoFilter = { from: 'A1', to: `F${run.samples.length + 1}` };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `subtipagem-vsr-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    alert('Não foi possível gerar o arquivo Excel. Tente novamente.');
  } finally {
    button.disabled = false;
    button.textContent = 'Baixar Excel';
  }
}

window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; $('install-button').classList.remove('hidden'); });
$('install-button').addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $('install-button').classList.add('hidden'); });
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (isIos && !window.matchMedia('(display-mode: standalone)').matches) $('ios-help').classList.remove('hidden');
$('ios-help').addEventListener('click', () => $('install-dialog').showModal());
$('close-help').addEventListener('click', () => $('install-dialog').close());

function loadRun() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || blankRun(); } catch { return blankRun(); } }
function saveRun() { localStorage.setItem(STORAGE_KEY, JSON.stringify(run)); }
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`));
renderSamples();
