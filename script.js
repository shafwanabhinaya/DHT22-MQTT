// ============================================================
//  KONFIGURASI — disesuaikan dengan esp32_sensor.ino
// ============================================================
const BROKER    = 'wss://broker.emqx.io:8084/mqtt';
const TOPIC     = 'sensor/ruangan';  // ← sama dengan MQTT_TOPIC di .ino
const CLIENT_ID = 'dashboard_' + Math.random().toString(16).slice(2, 8);
const MAX_TITIK = 20;

// ============================================================
//  VARIABEL
// ============================================================
let dataCounter = 0;
const dataGrafik = { labels: [], suhu: [], hum: [] };

// ============================================================
//  INISIALISASI GRAFIK (Chart.js)
// ============================================================
const ctx = document.getElementById('grafikSensor').getContext('2d');

const grafik = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Suhu (°C)',
        data: [],
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.08)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#00d4ff',
        tension: 0.4,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Kelembaban (%)',
        data: [],
        borderColor: '#00ff9d',
        backgroundColor: 'rgba(0,255,157,0.06)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#00ff9d',
        tension: 0.4,
        fill: true,
        yAxisID: 'y1',
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#4a6080',
          font: { family: 'Share Tech Mono', size: 11 },
          boxWidth: 12,
        }
      },
      tooltip: {
        backgroundColor: '#0c1220',
        borderColor: '#1a2d4a',
        borderWidth: 1,
        titleColor: '#00d4ff',
        bodyColor: '#c8ddf0',
        titleFont: { family: 'Share Tech Mono' },
        bodyFont:  { family: 'Share Tech Mono' },
      }
    },
    scales: {
      x: {
        ticks: { color: '#4a6080', font: { family: 'Share Tech Mono', size: 10 }, maxRotation: 0 },
        grid:  { color: 'rgba(26,45,74,0.6)' },
      },
      y: {
        position: 'left',
        title: { display: true, text: '°C', color: '#00d4ff', font: { family: 'Share Tech Mono' } },
        ticks: { color: '#00d4ff', font: { family: 'Share Tech Mono', size: 10 } },
        grid:  { color: 'rgba(26,45,74,0.6)' },
        suggestedMin: 15,
        suggestedMax: 45,
      },
      y1: {
        position: 'right',
        title: { display: true, text: '%', color: '#00ff9d', font: { family: 'Share Tech Mono' } },
        ticks: { color: '#00ff9d', font: { family: 'Share Tech Mono', size: 10 } },
        grid:  { drawOnChartArea: false },
        suggestedMin: 0,
        suggestedMax: 100,
      }
    }
  }
});

function tambahDataGrafik(suhu, hum) {
  const waktu = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  dataGrafik.labels.push(waktu);
  dataGrafik.suhu.push(suhu);
  dataGrafik.hum.push(hum);
  if (dataGrafik.labels.length > MAX_TITIK) {
    dataGrafik.labels.shift();
    dataGrafik.suhu.shift();
    dataGrafik.hum.shift();
  }
  grafik.data.labels           = [...dataGrafik.labels];
  grafik.data.datasets[0].data = [...dataGrafik.suhu];
  grafik.data.datasets[1].data = [...dataGrafik.hum];
  grafik.update();
}

function gantaGrafik(mode, btnEl) {
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('aktif'));
  btnEl.classList.add('aktif');
  grafik.data.datasets[0].hidden = (mode === 'kelembaban');
  grafik.data.datasets[1].hidden = (mode === 'suhu');
  grafik.update();
}

// ============================================================
//  KONEKSI MQTT — opsi lengkap agar stabil di hosting
// ============================================================
// ============================================================
//  KONEKSI MQTT — lebih stabil untuk GitHub Pages
// ============================================================
let reconnectCount = 0;

const client = mqtt.connect(BROKER, {
  clientId:        CLIENT_ID,
  clean:           true,
  connectTimeout:  15000,
  reconnectPeriod: 0,       // ← matikan auto reconnect bawaan
  keepalive:       60,
  protocolVersion: 4,
  rejectUnauthorized: false,
});

client.on('connect', () => {
  reconnectCount = 0;
  setStatus('TERHUBUNG', 'connected');
  client.subscribe(TOPIC, (err) => {
    if (err) setStatus('SUBSCRIBE GAGAL', 'error');
    else addLog(`📡 Subscribe ke topic: <span class="val-suhu">${TOPIC}</span>`);
  });
});

// Reconnect manual dengan jeda makin lama (supaya tidak storm)
client.on('close', () => {
  reconnectCount++;
  const jeda = Math.min(reconnectCount * 3000, 30000); // max 30 detik
  setStatus(`PUTUS — coba lagi dalam ${jeda/1000}s... (${reconnectCount}x)`, 'error');
  setTimeout(() => {
    if (!client.connected) client.reconnect();
  }, jeda);
});

client.on('error', (err) => {
  setStatus('ERROR: ' + err.message, 'error');
  client.end(true); // tutup paksa biar tidak menumpuk
});

client.on('offline', () => setStatus('OFFLINE', 'error'));
// ============================================================
//  TERIMA PESAN DARI ESP8266
//  JSON dari .ino: { "suhu": x, "kelembaban": x, "device": "..." }
// ============================================================
client.on('message', (topic, message) => {
  let data;

  try {
    data = JSON.parse(message.toString());
  } catch (e) {
    addLog('⚠️ Format data tidak valid: ' + message.toString());
    return;
  }

  // Ambil field sesuai ArduinoJson di .ino
  const suhu       = parseFloat(data.suhu);
  const kelembaban = parseFloat(data.kelembaban);
  const device     = data.device || 'unknown';  // ← field "device" dari .ino

  if (isNaN(suhu) || isNaN(kelembaban)) {
    addLog('⚠️ Data tidak lengkap, cek Serial Monitor ESP8266');
    return;
  }

  // Update kartu
  updateKartu('nilai-suhu',       suhu.toFixed(1),       'bar-suhu',       suhu / 50 * 100);
  updateKartu('nilai-kelembaban', kelembaban.toFixed(1), 'bar-kelembaban', kelembaban);

  // Update waktu & counter
  const now = new Date().toLocaleTimeString('id-ID');
  document.getElementById('waktu').textContent   = now;
  document.getElementById('counter').textContent = ++dataCounter;

  // Tambah ke grafik
  tambahDataGrafik(suhu, kelembaban);

  // Log — tampilkan juga device ID dari ESP
  addLog(
    `[<span style="color:#ff9f43">${device}</span>] &nbsp;` +
    `suhu: <span class="val-suhu">${suhu.toFixed(1)}°C</span> &nbsp; ` +
    `kelembaban: <span class="val-hum">${kelembaban.toFixed(1)}%</span>`,
    now
  );
});

// ============================================================
//  FUNGSI HELPER
// ============================================================
function updateKartu(idNilai, nilai, idBar, persenBar) {
  const el = document.getElementById(idNilai);
  el.textContent = nilai;
  el.classList.add('update');
  setTimeout(() => el.classList.remove('update'), 600);
  document.getElementById(idBar).style.width = Math.min(Math.max(persenBar, 0), 100) + '%';
}

function setStatus(teks, kelas) {
  document.getElementById('status').textContent = teks;
  document.getElementById('dot').className = 'dot ' + kelas;
}

function addLog(html, waktu = '') {
  const log = document.getElementById('log');
  const el  = document.createElement('div');
  el.className  = 'log-entry';
  el.innerHTML  = `<span class="ts">[${waktu || new Date().toLocaleTimeString('id-ID')}]</span> ${html}`;
  log.appendChild(el);
  while (log.children.length > 100) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function clearLog() {
  document.getElementById('log').innerHTML = '';
  dataCounter = 0;
  document.getElementById('counter').textContent = 0;
}