import { BrowserMultiFormatReader } from '@zxing/browser';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createWorker, PSM } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './style.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const STORAGE_KEY = 'vsr-subtyping-tool-run-v2';
const dateNow = () => new Date().toLocaleDateString('pt-BR');
const blankRun = () => ({ extractionKit: '', pcrKit: '', executionDate: dateNow(), extractedBy: '', analyzedBy: '', checkedBy: '', samples: [] });
let run = loadRun();
let scannerControls = null;
let cameraStream = null;
let ocrWorker = null;
let deferredInstallPrompt = null;
let importedRows = [];
let cameraMode = 'gal';

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <div><span class="brand-mark">VSR</span><strong>Subtyping Tool</strong></div>
    <button id="install-button" class="install-button hidden">Instalar app</button>
  </header>
  <main>
    <section class="hero">
      <div><p class="eyebrow">LACEN/AL</p><h1>Subtipagem de VSR</h1><p>Registre o GAL, importe formulários e gere relatórios em PDF ou Excel.</p></div>
      <div class="sample-count"><strong id="sample-count">0</strong><span>amostras</span></div>
    </section>

    <section class="panel import-panel">
      <div class="section-heading"><div><span class="step">2</span><h2>Importar formulário preenchido</h2></div><span class="local-badge">Processamento local</span></div>
      <p class="panel-description">Importe um PDF digitalizado. Cada página será convertida automaticamente em imagem antes da leitura.</p>
      <input id="form-file" class="file-input" type="file" accept=".pdf,application/pdf" />
      <button id="import-form-button" class="primary-button import-button">Importar e reconhecer PDF</button>
      <p id="import-status" class="import-status hidden"></p>
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
      <div class="full-form-callout">
        <div><strong>Formulário completo</strong><span>Fotografe uma página inteira da tabela.</span></div>
        <button id="full-form-photo-button" class="secondary-button">Fotografar formulário</button>
      </div>
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
    <div class="video-wrap"><video id="scanner-video" playsinline muted></video><div id="scan-frame" class="scan-frame"></div></div>
    <div id="form-camera-options" class="form-camera-options hidden"><label for="form-page-type">Página fotografada</label><select id="form-page-type"><option value="32">Página 1 — linhas 1 a 32</option><option value="15">Página 2 — linhas 33 a 47</option></select></div>
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

document.body.insertAdjacentHTML('beforeend', `
  <dialog id="review-dialog" class="review-dialog">
    <div class="review-header"><div><h2>Conferir dados reconhecidos <span id="review-count"></span></h2><p>Corrija os campos ou exclua as linhas reconhecidas incorretamente antes de continuar.</p></div><button id="close-review" aria-label="Fechar">×</button></div>
    <div class="review-table-wrap"><table class="review-table"><thead><tr><th>Nº</th><th>Registro/GAL</th><th>Nome</th><th>CT VSR-A</th><th>CT VSR-B</th><th>Resultado</th><th>Ação</th></tr></thead><tbody id="review-body"></tbody></table></div>
    <div class="review-actions"><button id="cancel-import" class="retry-button">Cancelar</button><button id="confirm-import" class="confirm-button">Adicionar à execução</button></div>
  </dialog>`);

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
const resultFor = ({ ctA, ctB, manualResult }) => manualResult === 'A' ? 'VSR-A' : manualResult === 'B' ? 'VSR-B' : detected(ctA) && detected(ctB) ? 'VSR-A/VSR-B' : detected(ctA) ? 'VSR-A' : detected(ctB) ? 'VSR-B' : 'Não detectado';

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
      <div><strong>GAL ${sample.gal}${sample.name ? ` · ${escapeHtml(sample.name)}` : ''}</strong><p>VSR-A: ${sample.ctA || '-'} · VSR-B: ${sample.ctB || '-'}</p><span class="result">${resultFor(sample)}</span></div>
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
$('full-form-photo-button').addEventListener('click', startFullFormCamera);
$('scan-button').addEventListener('click', startBarcodeScanner);
$('capture-button').addEventListener('click', () => cameraMode === 'form' ? captureAndRecognizeForm() : captureAndRecognizeGal());
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
  cameraMode = 'gal';
  $('scanner-dialog').showModal();
  $('scanner-title').textContent = 'Fotografar número GAL';
  $('scanner-subtitle').textContent = 'Centralize o texto “GAL - 000...”';
  $('scanner-message').textContent = 'Aproxime o tubo até o número ocupar o quadro.';
  $('capture-button').classList.remove('hidden');
  $('capture-button').textContent = 'Capturar e reconhecer';
  $('photo-result').classList.add('hidden');
  $('form-camera-options').classList.add('hidden');
  $('scan-frame').classList.remove('form-frame');
  try { await openCamera(); } catch { $('scanner-message').textContent = 'Não foi possível abrir a câmera. Verifique a permissão do navegador.'; }
}
async function startFullFormCamera() {
  cameraMode = 'form';
  $('scanner-dialog').showModal();
  $('scanner-title').textContent = 'Fotografar formulário completo';
  $('scanner-subtitle').textContent = 'Alinhe as quatro bordas da folha dentro do guia';
  $('scanner-message').textContent = 'Use boa iluminação, evite sombras e mantenha a folha completamente plana.';
  $('capture-button').classList.remove('hidden');
  $('capture-button').textContent = 'Fotografar e reconhecer formulário';
  $('photo-result').classList.add('hidden');
  $('form-camera-options').classList.remove('hidden');
  $('scan-frame').classList.add('form-frame');
  try { await openCamera(); } catch { $('scanner-message').textContent = 'Não foi possível abrir a câmera. Verifique a permissão do navegador.'; }
}
async function startBarcodeScanner() {
  cameraMode = 'barcode';
  $('scanner-dialog').showModal();
  $('scanner-title').textContent = 'Ler código de barras';
  $('scanner-subtitle').textContent = 'Centralize as barras dentro do quadro';
  $('scanner-message').textContent = 'Este modo pode falhar quando a etiqueta estiver dobrada.';
  $('capture-button').classList.add('hidden');
  $('form-camera-options').classList.add('hidden');
  $('scan-frame').classList.remove('form-frame');
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

async function captureAndRecognizeForm() {
  const video = $('scanner-video');
  if (!video.videoWidth) return;
  const button = $('capture-button');
  button.disabled = true;
  button.textContent = 'Preparando fotografia...';
  importedRows = [];
  try {
    const canvas = captureGuideArea(video, $('scan-frame'));
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    video.pause();
    const expectedRows = Number($('form-page-type').value);
    $('scanner-message').textContent = `Analisando ${expectedRows} linhas. Mantenha esta tela aberta.`;
    const rows = await recognizeFormPage({ canvas, embeddedText: '', textItems: [], expectedRows }, expectedRows === 15 ? 1 : 0);
    importedRows = deduplicateImportedRows(rows);
    renderReviewRows();
    stopScanner();
    $('review-dialog').showModal();
  } catch (error) {
    console.error(error);
    $('scanner-message').textContent = `Não foi possível reconhecer o formulário: ${error.message || 'tente novamente.'}`;
  } finally {
    button.disabled = false;
    button.textContent = 'Fotografar e reconhecer formulário';
  }
}

function captureGuideArea(video, frame) {
  const videoRect = video.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const displayScale = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
  const displayedWidth = video.videoWidth * displayScale;
  const displayedHeight = video.videoHeight * displayScale;
  const hiddenX = (displayedWidth - videoRect.width) / 2;
  const hiddenY = (displayedHeight - videoRect.height) / 2;
  const relativeX = frameRect.left - videoRect.left;
  const relativeY = frameRect.top - videoRect.top;
  const sourceX = Math.max(0, Math.round((relativeX + hiddenX) / displayScale));
  const sourceY = Math.max(0, Math.round((relativeY + hiddenY) / displayScale));
  const sourceWidth = Math.min(video.videoWidth - sourceX, Math.round(frameRect.width / displayScale));
  const sourceHeight = Math.min(video.videoHeight - sourceY, Math.round(frameRect.height / displayScale));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1200, sourceWidth);
  canvas.height = Math.round(canvas.width * sourceHeight / sourceWidth);
  canvas.getContext('2d').drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
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

$('import-form-button').addEventListener('click', importFilledForm);
$('close-review').addEventListener('click', closeReview);
$('cancel-import').addEventListener('click', closeReview);
$('confirm-import').addEventListener('click', confirmImportedRows);

async function importFilledForm() {
  const file = $('form-file').files[0];
  if (!file) return alert('Escolha um arquivo PDF.');
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return alert('Este campo aceita somente arquivos PDF.');
  const button = $('import-form-button');
  const status = $('import-status');
  button.disabled = true;
  status.classList.remove('hidden');
  importedRows = [];
  try {
    const pages = await pdfToCanvases(file, status);
    for (let index = 0; index < pages.length; index += 1) {
      status.textContent = `Lendo página ${index + 1} de ${pages.length}...`;
      const rows = await recognizeFormPage(pages[index], index);
      importedRows.push(...rows);
    }
    importedRows = deduplicateImportedRows(importedRows);
    if (!importedRows.length) throw new Error('Nenhum registro foi identificado.');
    renderReviewRows();
    $('review-dialog').showModal();
    status.textContent = `${importedRows.length} registro(s) localizado(s). Confira os dados.`;
  } catch (error) {
    console.error(error);
    status.textContent = `Não foi possível concluir a leitura: ${error.message || 'tente novamente.'}`;
  } finally {
    button.disabled = false;
  }
}

async function pdfToCanvases(file, status) {
  status.textContent = 'Convertendo o PDF em imagens...';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const canvases = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    status.textContent = `Convertendo página ${pageNumber} de ${pdf.numPages} em imagem...`;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const textContent = await page.getTextContent();
    const textItems = textContent.items.map((item) => {
      const position = pdfjsLib.Util.transform(viewport.transform, item.transform);
      return { text: item.str || '', x: position[4], y: position[5] };
    });
    const embeddedText = textItems.map((item) => item.text).join(' ');
    canvases.push({ canvas, embeddedText, textItems });
  }
  return canvases;
}

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  ocrWorker = await createWorker('eng', 1, { logger: ({ status, progress }) => {
    if (status === 'recognizing text') {
      const message = `Reconhecendo texto... ${Math.round(progress * 100)}%`;
      if ($('scanner-dialog').open && cameraMode === 'form') $('scanner-message').textContent = message;
      else $('import-status').textContent = message;
    }
  }});
  return ocrWorker;
}

async function recognizeFormPage(pageData, pageIndex) {
  const { canvas, embeddedText = '', textItems = [], expectedRows = null } = pageData;
  const worker = await getOcrWorker();
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const result = await worker.recognize(canvas, {}, { blocks: true, text: true });
  const words = flattenOcrWords(result.data.blocks || []);
  const positionedRows = rowsFromPositionedWords(words, canvas.width, canvas.height, pageIndex);
  const embeddedRows = mergeRecognizedRows(rowsFromPdfItems(textItems, pageIndex), rowsFromPlainText(embeddedText, pageIndex));
  let ocrRows = rowsFromPlainText(result.data.text || '', pageIndex);

  let mergedRows;
  if (embeddedRows.length) {
    mergedRows = mergeRecognizedRows([...embeddedRows, ...ocrRows], positionedRows);
  } else {
    const tableRows = await recognizeImageTableRows(canvas, worker, result.data.text || '', pageIndex, expectedRows);
    mergedRows = mergeImageTableRows(tableRows, [...positionedRows, ...ocrRows]);
  }
  await recognizeHandwrittenFields(canvas, mergedRows, worker, pageIndex);
  return mergedRows;
}

async function recognizeImageTableRows(canvas, worker, fullText, pageIndex, expectedRows = null) {
  const continuationPage = expectedRows === 15 || (!expectedRows && !/FORMUL|EXTRAÇÃO|EXTRACAO/i.test(fullText) && /\b3[3-9]\b/.test(fullText));
  const rowCount = expectedRows || (continuationPage ? 15 : 32);
  const startRatio = continuationPage ? 0.082 : 0.392;
  const endRatio = continuationPage ? 0.337 : 0.91;
  const xStart = continuationPage ? 0.09 : 0.10;
  const xEnd = 0.47;
  const spacing = (endRatio - startRatio) / Math.max(1, rowCount - 1);
  const rows = [];
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  });
  for (let index = 0; index < rowCount; index += 1) {
    const progressMessage = `Lendo linha ${index + 1} de ${rowCount} da fotografia...`;
    if ($('scanner-dialog').open && cameraMode === 'form') $('scanner-message').textContent = progressMessage;
    else $('import-status').textContent = progressMessage;
    const rowY = canvas.height * (startRatio + spacing * index);
    const strip = makePrintedRowStrip(canvas, xStart, xEnd, rowY, canvas.height * spacing * 0.72);
    const result = await worker.recognize(strip, {}, { text: true });
    const parsed = parsePrintedRow(result.data.text || '');
    rows.push({
      number: index + 1,
      gal: parsed.gal,
      name: parsed.name,
      ctA: '', ctB: '', result: '', page: pageIndex + 1,
      uncertain: !parsed.gal || !parsed.name,
      order: index,
      rowY,
      placeholder: !parsed.gal,
    });
  }
  await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  return rows;
}

function makePrintedRowStrip(source, startRatio, endRatio, centerY, rowHeight) {
  const x = Math.round(source.width * startRatio);
  const y = Math.max(0, Math.round(centerY - rowHeight / 2));
  const width = Math.round(source.width * (endRatio - startRatio));
  const height = Math.max(8, Math.round(rowHeight));
  const scale = 2.4;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, x, y, width, height, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const gray = pixels.data[offset] * 0.299 + pixels.data[offset + 1] * 0.587 + pixels.data[offset + 2] * 0.114;
    const value = gray < 175 ? 0 : 255;
    pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = value;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function parsePrintedRow(text) {
  const compact = text.toUpperCase().replace(/[^0-9A-Z|]/g, '');
  const candidateMatches = [...compact.matchAll(/[0-9OQDIL|]{11,14}/g)];
  const match = candidateMatches.sort((a, b) => normalizedDigits(b[0]).length - normalizedDigits(a[0]).length)[0];
  let gal = match ? normalizedDigits(match[0]) : '';
  if (gal.length > 12) gal = gal.slice(-12);
  const nameSource = match ? compact.slice((match.index || 0) + match[0].length) : compact.replace(/^[0-9]{1,2}/, '');
  const name = nameSource.replace(/[^A-Z]/g, '').slice(0, 12);
  return { gal, name };
}

function mergeImageTableRows(tableRows, recognizedRows) {
  return tableRows.map((row) => {
    const candidates = recognizedRows.filter((candidate) => Number.isFinite(candidate.rowY));
    const nearest = candidates.length ? candidates.reduce((closest, candidate) => Math.abs(candidate.rowY - row.rowY) < Math.abs(closest.rowY - row.rowY) ? candidate : closest, candidates[0]) : null;
    const tolerance = tableRows.length > 1 ? Math.abs(tableRows[1].rowY - tableRows[0].rowY) * 0.65 : 20;
    if (!nearest || Math.abs(nearest.rowY - row.rowY) > tolerance) return row;
    return {
      ...row,
      gal: row.gal || nearest.gal || '',
      name: row.name || nearest.name || '',
      ctA: nearest.ctA || '',
      ctB: nearest.ctB || '',
      result: nearest.result || '',
      placeholder: !(row.gal || nearest.gal),
      uncertain: true,
    };
  });
}

async function recognizeHandwrittenFields(canvas, rows, worker, pageIndex) {
  if (!rows.length) return;
  assignMissingRowPositions(rows, canvas.height, pageIndex);
  const rowYs = rows.map((row) => row.rowY).filter(Number.isFinite);
  if (!rowYs.length) return;
  const handwritingMessage = `Lendo valores manuscritos da página ${pageIndex + 1}...`;
  if ($('scanner-dialog').open && cameraMode === 'form') $('scanner-message').textContent = handwritingMessage;
  else $('import-status').textContent = handwritingMessage;
  const minY = Math.max(0, Math.min(...rowYs) - canvas.height * 0.012);
  const maxY = Math.min(canvas.height, Math.max(...rowYs) + canvas.height * 0.012);
  const crop = makeHandwritingMask(canvas, 0.43, 0.97, minY, maxY);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    tessedit_char_whitelist: '0123456789.,AB-',
  });
  const result = await worker.recognize(crop.canvas, {}, { blocks: true, text: true });
  const words = flattenOcrWords(result.data.blocks || []).map((word) => ({
    ...word,
    sourceX: crop.x + ((word.bbox.x0 + word.bbox.x1) / 2) / crop.scale,
    sourceY: crop.y + ((word.bbox.y0 + word.bbox.y1) / 2) / crop.scale,
  }));
  const rowSpacing = rowYs.length > 1 ? (Math.max(...rowYs) - Math.min(...rowYs)) / (rowYs.length - 1) : canvas.height * 0.02;
  words.forEach((word) => {
    const row = rows.reduce((closest, candidate) => Math.abs(candidate.rowY - word.sourceY) < Math.abs(closest.rowY - word.sourceY) ? candidate : closest, rows[0]);
    if (Math.abs(row.rowY - word.sourceY) > Math.max(18, rowSpacing * 0.65)) return;
    const xRatio = word.sourceX / canvas.width;
    if (xRatio >= 0.43 && xRatio < 0.60 && !row.ctA) row.ctA = normalizeHandwrittenCt(word.text);
    else if (xRatio >= 0.60 && xRatio < 0.75 && !row.ctB) row.ctB = normalizeHandwrittenCt(word.text);
    else if (xRatio >= 0.75 && xRatio <= 0.97 && !row.result) row.result = readResult([word]);
  });
  rows.forEach((row) => {
    if (!row.result && row.ctA && !row.ctB) row.result = 'A';
    if (!row.result && row.ctB && !row.ctA) row.result = 'B';
    if (row.ctA || row.ctB || row.result) row.uncertain = true;
  });
  await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.SPARSE_TEXT });
}

function assignMissingRowPositions(rows, height, pageIndex) {
  const known = rows.filter((row) => Number.isFinite(row.rowY));
  const isFirstPage = rows.length > 20 || pageIndex === 0;
  const start = known.length ? known[0].rowY : height * (isFirstPage ? 0.395 : 0.078);
  const end = known.length > 1 ? known[known.length - 1].rowY : height * (isFirstPage ? 0.91 : 0.34);
  rows.forEach((row, index) => {
    if (!Number.isFinite(row.rowY)) row.rowY = start + (end - start) * (rows.length === 1 ? 0 : index / (rows.length - 1));
  });
}

function makeHandwritingMask(source, startRatio, endRatio, minY, maxY) {
  const x = Math.round(source.width * startRatio);
  const y = Math.round(minY);
  const width = Math.round(source.width * (endRatio - startRatio));
  const height = Math.max(1, Math.round(maxY - minY));
  const scale = 1.7;
  const raw = document.createElement('canvas');
  raw.width = width; raw.height = height;
  const rawContext = raw.getContext('2d', { willReadFrequently: true });
  rawContext.drawImage(source, x, y, width, height, 0, 0, width, height);
  let pixels = rawContext.getImageData(0, 0, width, height);
  let bluePixels = 0;
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index]; const green = pixels.data[index + 1]; const blue = pixels.data[index + 2];
    const blueInk = blue - (red + green) / 2 > 7 && blue < 235;
    if (blueInk) bluePixels += 1;
    const value = blueInk ? 0 : 255;
    pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
  }
  if (bluePixels < width * height * 0.0003) {
    rawContext.drawImage(source, x, y, width, height, 0, 0, width, height);
    pixels = rawContext.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
      const value = gray < 155 ? 0 : 255;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
    }
  }
  rawContext.putImageData(pixels, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(raw, 0, 0, canvas.width, canvas.height);
  return { canvas, x, y, scale };
}

function normalizeHandwrittenCt(value) {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const decimal = normalized.match(/(?:[1-4]?\d)[.]\d{1,2}/)?.[0];
  if (decimal) return decimal;
  const digits = normalized.replace(/\D/g, '');
  if (digits.length === 3 || digits.length === 4) {
    const candidate = Number(`${digits.slice(0, -2)}.${digits.slice(-2)}`);
    if (candidate >= 10 && candidate <= 45) return candidate.toFixed(2);
  }
  return '';
}

function rowsFromPdfItems(items, pageIndex) {
  const registrations = [];
  items.forEach((item) => {
    const matches = item.text.toUpperCase().match(/[0-9OQDIL|]{11,14}/g) || [];
    matches.forEach((match) => {
      let gal = normalizedDigits(match);
      if (gal.length > 12) gal = gal.slice(-12);
      if (gal.length >= 11) registrations.push({ ...item, gal });
    });
  });
  registrations.sort((a, b) => a.y - b.y || a.x - b.x);
  return registrations.map((registration, index) => {
    const sameLine = items.filter((item) => Math.abs(item.y - registration.y) < 7 && item.x > registration.x);
    const name = sameLine.map((item) => item.text.toUpperCase().replace(/[^A-Z]/g, '')).find((value) => value.length >= 2 && value.length <= 12) || '';
    return { number: index + 1, gal: registration.gal, name, ctA: '', ctB: '', result: '', page: pageIndex + 1, uncertain: true, order: index, rowY: registration.y };
  });
}

function flattenOcrWords(blocks) {
  const words = [];
  blocks.forEach((block) => (block.paragraphs || []).forEach((paragraph) =>
    (paragraph.lines || []).forEach((line) => (line.words || []).forEach((word) => {
      if (word.text?.trim() && word.bbox) words.push({ text: word.text.trim(), bbox: word.bbox, confidence: word.confidence || 0 });
    }))));
  return words;
}

function normalizedDigits(value) {
  return value.toUpperCase().replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/\D/g, '');
}

function rowsFromPositionedWords(words, width, height, pageIndex) {
  const registrations = words.map((word) => ({ ...word, digits: normalizedDigits(word.text) }))
    .filter((word) => word.digits.length >= 11 && word.digits.length <= 14 && word.bbox.x0 < width * 0.48);
  return registrations.map((registration, index) => {
    const centerY = (registration.bbox.y0 + registration.bbox.y1) / 2;
    const tolerance = Math.max(12, height * 0.009);
    const lineWords = words.filter((word) => {
      const wordY = (word.bbox.y0 + word.bbox.y1) / 2;
      return Math.abs(wordY - centerY) <= tolerance;
    });
    const inZone = (min, max) => lineWords.filter((word) => word.bbox.x0 >= width * min && word.bbox.x0 < width * max);
    const name = inZone(0.22, 0.49).map((word) => word.text.replace(/[^A-Za-z]/g, '')).join('').toUpperCase().slice(0, 12);
    const ctA = readCt(inZone(0.45, 0.63));
    const ctB = readCt(inZone(0.60, 0.79));
    const result = readResult(inZone(0.75, 0.96));
    const confidence = Math.min(registration.confidence || 0, ...lineWords.map((word) => word.confidence || 0));
    return { number: index + 1, gal: registration.digits, name, ctA, ctB, result, page: pageIndex + 1, uncertain: confidence < 65 || (!ctA && !ctB && !result), rowY: centerY };
  });
}

function readCt(words) {
  const joined = words.map((word) => word.text).join('').replace(',', '.').replace(/[^0-9.]/g, '');
  const match = joined.match(/(?:[1-4]?\d)[.]\d{1,2}/);
  return match ? match[0] : '';
}

function readResult(words) {
  const candidate = words.map((word) => word.text.toUpperCase().replace(/[^AB]/g, '')).find((value) => value === 'A' || value === 'B');
  return candidate || '';
}

function rowsFromPlainText(text, pageIndex) {
  const normalized = text.toUpperCase().replace(/[|]/g, ' ').replace(/([0-9OQDIL])\s+(?=[0-9OQDIL])/g, '$1');
  const pattern = /([0-9OQDIL]{11,14})\s*([A-Z]{2,12})/g;
  const rows = [];
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    let gal = normalizedDigits(match[1]);
    if (gal.length > 12) gal = gal.slice(-12);
    if (gal.length < 11) continue;
    rows.push({ number: rows.length + 1, gal, name: match[2], ctA: '', ctB: '', result: '', page: pageIndex + 1, uncertain: true });
  }
  return rows;
}

function mergeRecognizedRows(baseRows, positionedRows) {
  const byGal = new Map();
  [...baseRows, ...positionedRows].forEach((row) => {
    if (!row.gal) return;
    const current = byGal.get(row.gal);
    if (!current) {
      byGal.set(row.gal, { ...row });
      return;
    }
    if (!current.name && row.name) current.name = row.name;
    if (!current.ctA && row.ctA) current.ctA = row.ctA;
    if (!current.ctB && row.ctB) current.ctB = row.ctB;
    if (!current.result && row.result) current.result = row.result;
    if (!Number.isFinite(current.rowY) && Number.isFinite(row.rowY)) current.rowY = row.rowY;
    current.uncertain = current.uncertain && row.uncertain;
  });
  return [...byGal.values()].sort((a, b) => (a.page || 0) - (b.page || 0) || (a.order ?? a.number ?? 0) - (b.order ?? b.number ?? 0));
}

function deduplicateImportedRows(rows) {
  const seen = new Set();
  return rows.filter((row, index) => {
    const key = row.gal || `blank-${row.page || 0}-${row.order ?? index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((row, index) => ({ ...row, number: index + 1 }));
}

function renderReviewRows() {
  $('review-count').textContent = `(${importedRows.length})`;
  $('review-body').innerHTML = importedRows.map((row, index) => `<tr class="${row.uncertain ? 'uncertain-row' : ''}">
    <td>${index + 1}</td>
    <td><input data-index="${index}" data-field="gal" inputmode="numeric" value="${escapeHtml(row.gal)}"></td>
    <td><input data-index="${index}" data-field="name" value="${escapeHtml(row.name)}"></td>
    <td><input data-index="${index}" data-field="ctA" inputmode="decimal" value="${escapeHtml(row.ctA)}"></td>
    <td><input data-index="${index}" data-field="ctB" inputmode="decimal" value="${escapeHtml(row.ctB)}"></td>
    <td><select data-index="${index}" data-field="result"><option value=""></option><option value="A" ${row.result === 'A' ? 'selected' : ''}>A</option><option value="B" ${row.result === 'B' ? 'selected' : ''}>B</option></select></td>
    <td><button class="delete-imported-row" data-delete-index="${index}" type="button" aria-label="Excluir linha ${index + 1}">Excluir</button></td>
  </tr>`).join('');
  $('review-body').querySelectorAll('input, select').forEach((input) => input.addEventListener('input', () => {
    const row = importedRows[Number(input.dataset.index)];
    row[input.dataset.field] = input.dataset.field === 'gal' ? cleanGal(input.value) : input.dataset.field.startsWith('ct') ? cleanCt(input.value) : input.value.toUpperCase();
    input.value = row[input.dataset.field];
  }));
  $('review-body').querySelectorAll('.delete-imported-row').forEach((button) => button.addEventListener('click', () => {
    importedRows.splice(Number(button.dataset.deleteIndex), 1);
    renderReviewRows();
  }));
  $('confirm-import').textContent = importedRows.length ? `Adicionar ${importedRows.length} à execução` : 'Nenhuma linha para adicionar';
  $('confirm-import').disabled = importedRows.length === 0;
}

function confirmImportedRows() {
  const validRows = importedRows.filter((row) => row.gal.length >= 10);
  let added = 0;
  validRows.forEach((row) => {
    if (run.samples.some((sample) => sample.gal === row.gal)) return;
    run.samples.push({ id: crypto.randomUUID(), gal: row.gal, name: row.name, ctA: row.ctA, ctB: row.ctB, manualResult: row.result });
    added += 1;
  });
  saveRun(); renderSamples(); closeReview();
  alert(`${added} amostra(s) adicionada(s). Revise a lista e baixe o Excel quando estiver pronto.`);
}

function closeReview() {
  if ($('review-dialog').open) $('review-dialog').close();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
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
  autoTable(doc, { startY: 42, head: [['Nº', 'GAL', 'Nome', 'VSR-A (CT)', 'VSR-B (CT)', 'Resultado']], body: run.samples.map((s, i) => [i + 1, s.gal, s.name || '-', s.ctA || '-', s.ctB || '-', resultFor(s)]), theme: 'grid', headStyles: { fillColor: [7, 89, 133] }, styles: { fontSize: 8, cellPadding: 2 } });
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
    report.mergeCells('A1:F1');
    report.getCell('A1').value = 'LABORATÓRIO CENTRAL DE SAÚDE PÚBLICA - LACEN/AL';
    report.mergeCells('A2:F2');
    report.getCell('A2').value = 'SUBTIPAGEM DE VÍRUS SINCICIAL RESPIRATÓRIO';
    report.getCell('A3').value = 'Kit de extração'; report.getCell('B3').value = run.extractionKit || '-';
    report.getCell('D3').value = 'Kit de PCR'; report.getCell('E3').value = run.pcrKit || '-';
    report.getCell('A4').value = 'Data de execução'; report.getCell('B4').value = run.executionDate || '-';
    report.getCell('D4').value = 'Total de amostras'; report.getCell('E4').value = run.samples.length;
    report.getRow(7).values = ['Nº', 'GAL', 'Nome', 'VSR-A (CT)', 'VSR-B (CT)', 'Resultado'];
    run.samples.forEach((sample, index) => report.addRow([index + 1, sample.gal, sample.name || '', sample.ctA ? Number(sample.ctA) : null, sample.ctB ? Number(sample.ctB) : null, resultFor(sample)]));
    const signatureStart = 8 + run.samples.length + 2;
    report.getCell(`A${signatureStart}`).value = 'Extraído por'; report.getCell(`B${signatureStart}`).value = run.extractedBy || '-';
    report.getCell(`A${signatureStart + 1}`).value = 'Analisado por'; report.getCell(`B${signatureStart + 1}`).value = run.analyzedBy || '-';
    report.getCell(`A${signatureStart + 2}`).value = 'Conferido por'; report.getCell(`B${signatureStart + 2}`).value = run.checkedBy || '-';

    report.getColumn(1).width = 8; report.getColumn(2).width = 22; report.getColumn(3).width = 16; report.getColumn(4).width = 16; report.getColumn(5).width = 16; report.getColumn(6).width = 23;
    ['A1', 'A2'].forEach((cell, index) => { report.getCell(cell).font = { bold: true, size: index === 0 ? 14 : 12, color: { argb: 'FF0F2940' } }; report.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' }; });
    report.getRow(1).height = 25; report.getRow(2).height = 22;
    ['A3', 'D3', 'A4', 'D4'].forEach((cell) => { report.getCell(cell).font = { bold: true, color: { argb: 'FF475569' } }; });
    const header = report.getRow(7);
    header.height = 23;
    header.eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } }; cell.alignment = { horizontal: 'center', vertical: 'middle' }; });
    for (let rowNumber = 8; rowNumber < 8 + run.samples.length; rowNumber += 1) {
      const row = report.getRow(rowNumber);
      row.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9E2EA' } } }; cell.alignment = { vertical: 'middle', horizontal: cell.col === 2 || cell.col === 5 ? 'left' : 'center' }; });
      row.getCell(2).numFmt = '@'; row.getCell(4).numFmt = '0.00'; row.getCell(5).numFmt = '0.00';
      if (rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F7FA' } }; });
    }
    report.autoFilter = { from: 'A7', to: `F${7 + run.samples.length}` };
    report.printArea = `A1:F${signatureStart + 2}`;

    const data = workbook.addWorksheet('Dados', { views: [{ state: 'frozen', ySplit: 1 }] });
    data.columns = [
      { header: 'Número', key: 'number', width: 10 }, { header: 'GAL', key: 'gal', width: 22 }, { header: 'Nome', key: 'name', width: 18 },
      { header: 'VSR-A_CT', key: 'ctA', width: 15 }, { header: 'VSR-B_CT', key: 'ctB', width: 15 },
      { header: 'Resultado', key: 'result', width: 22 }, { header: 'Data_execução', key: 'date', width: 18 },
    ];
    run.samples.forEach((sample, index) => data.addRow({ number: index + 1, gal: sample.gal, name: sample.name || '', ctA: sample.ctA ? Number(sample.ctA) : null, ctB: sample.ctB ? Number(sample.ctB) : null, result: resultFor(sample), date: run.executionDate }));
    data.getRow(1).eachCell((cell) => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } }; });
    data.getColumn('gal').numFmt = '@'; data.getColumn('ctA').numFmt = '0.00'; data.getColumn('ctB').numFmt = '0.00';
    data.autoFilter = { from: 'A1', to: `G${run.samples.length + 1}` };

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
