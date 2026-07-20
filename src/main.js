import { BrowserMultiFormatReader } from '@zxing/browser';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import './style.css';

const STORAGE_KEY = 'vsr-subtyping-tool-run-v2';
const dateNow = () => new Date().toLocaleDateString('pt-BR');
const blankRun = () => ({ extractionKit: '', pcrKit: '', executionDate: dateNow(), extractedBy: '', analyzedBy: '', checkedBy: '', samples: [] });
let run = loadRun();
let scannerControls = null;
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
        <button id="scan-button" class="secondary-button">Ler código</button>
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

    <button id="pdf-button" class="primary-button pdf-button">Gerar e baixar PDF</button>
    <p class="privacy">Os dados permanecem armazenados somente neste aparelho.</p>
    <button id="ios-help" class="ios-help hidden">Como instalar no iPhone?</button>
  </main>

  <dialog id="scanner-dialog">
    <div class="scanner-header"><div><strong>Ler código GAL</strong><span>Centralize o código de barras</span></div><button id="close-scanner" aria-label="Fechar">×</button></div>
    <div class="video-wrap"><video id="scanner-video" playsinline muted></video><div class="scan-frame"></div></div>
    <p id="scanner-message">Mantenha a etiqueta iluminada e o mais plana possível.</p>
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

$('scan-button').addEventListener('click', startScanner);
$('close-scanner').addEventListener('click', stopScanner);
async function startScanner() {
  $('scanner-dialog').showModal();
  $('scanner-message').textContent = 'Mantenha a etiqueta iluminada e o mais plana possível.';
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
function stopScanner() {
  scannerControls?.stop(); scannerControls = null;
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
