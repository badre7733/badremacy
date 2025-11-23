// public/game.js
const socket = io();

// DOM
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const playerInfo = document.getElementById('playerInfo');
const playersList = document.getElementById('playersList');
const log = document.getElementById('log');
const sendNumInput = document.getElementById('sendNum');
const mapRefImg = document.getElementById('mapRef');

let STATE = { playerId: null, players: {}, territories: [], marches: [] };
let selectedSource = null;
let hoverTerritory = null;
let canvasRect = null;

// util
function appendLog(text) {
  const el = document.createElement('div'); el.textContent = text;
  log.prepend(el);
}

// resize canvas to style size
function resizeCanvasToDisplay() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  canvasRect = canvas.getBoundingClientRect();
}

window.addEventListener('resize', () => {
  resizeCanvasToDisplay();
  draw();
});
resizeCanvasToDisplay();

// recibir estado del servidor
socket.on('state', data => {
  // si data contiene todos los objetos (emitimos full state), mergearlos
  if (data.players) STATE.players = data.players;
  if (data.territories) STATE.territories = JSON.parse(JSON.stringify(data.territories));
  if (data.marches) STATE.marches = JSON.parse(JSON.stringify(data.marches));
  if (data.playerId) STATE.playerId = data.playerId;
  if (data.playerId === null && !STATE.playerId) { /* no-op */ }
  if (data.playerId && !STATE.playerId) STATE.playerId = data.playerId;

  updateUI();
  draw();
});

// UI
function updateUI() {
  // player info
  const pid = STATE.playerId;
  playerInfo.textContent = pid ? `Jugador: ${pid.substring(0,6)} (${(STATE.players[pid] && STATE.players[pid].color) || '—'})` : 'Conectando...';

  // players list
  playersList.innerHTML = '';
  for (let id in STATE.players) {
    const p = STATE.players[id];
    const el = document.createElement('div');
    const c = document.createElement('div');
    c.className = 'playerColor';
    c.style.background = p.color || '#999';
    el.appendChild(c);
    const txt = document.createElement('div');
    txt.innerHTML = `<strong>${id.substring(0,6)}</strong><div style="font-size:12px">Recursos: ${p.resources || 0}</div>`;
    el.appendChild(txt);
    playersList.appendChild(el);
  }
}

// mapa drawing
function draw() {
  if (!canvasRect) resizeCanvasToDisplay();
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // draw connections (neighbors)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  STATE.territories.forEach(t => {
    t.neighbors.forEach(nid => {
      const nb = STATE.territories.find(x => x.id === nid);
      if (!nb) return;
      ctx.beginPath();
      ctx.moveTo(scaleX(t.x), scaleY(t.y));
      ctx.lineTo(scaleX(nb.x), scaleY(nb.y));
      ctx.stroke();
    });
  });

  // draw marches (under territories)
  STATE.marches.forEach(m => {
    const from = STATE.territories.find(x => x.id === m.from);
    const to = STATE.territories.find(x => x.id === m.to);
    if (!from || !to) return;
    const sx = scaleX(from.x), sy = scaleY(from.y);
    const tx = scaleX(to.x), ty = scaleY(to.y);
    // compute current position by progress (server provides progress)
    const prog = m.progress !== undefined ? m.progress : 0;
    const cx = sx + (tx - sx) * prog;
    const cy = sy + (ty - sy) * prog;

    // draw circle for marching army
    ctx.beginPath();
    ctx.fillStyle = (STATE.players[m.owner] && STATE.players[m.owner].color) || '#fff';
    ctx.globalAlpha = 0.95;
    ctx.arc(cx, cy, 8, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.troops, cx, cy);
  });

  // draw territories
  for (let t of STATE.territories) {
    const x = scaleX(t.x), y = scaleY(t.y);
    const r = 36;

    // fill color by owner
    let fill = '#666';
    if (t.owner && STATE.players[t.owner]) fill = STATE.players[t.owner].color;
    // highlight selection / hover
    if (selectedSource && selectedSource.id === t.id) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
    } else if (hoverTerritory && hoverTerritory.id === t.id) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
    }

    // circle
    ctx.beginPath();
    ctx.fillStyle = fill;
    ctx.globalAlpha = 0.9;
    ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();

    // name
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(t.name, x, y - (r + 12));

    // troops box
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 22, y + r - 6, 44, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(t.troops, x, y + r + 5);

    // owner tag
    if (t.owner && STATE.players[t.owner]) {
      ctx.fillStyle = STATE.players[t.owner].color;
      ctx.fillRect(x - r, y - r - 26, 10, 6);
      // tiny owner id fragment
      ctx.fillStyle = '#fff';
      ctx.font = '10px Arial';
      ctx.fillText(t.owner.substring(0,5), x - r + 34, y - r - 20);
    }
  }
}

// helpers to map logical coords to canvas coords (map is already in px for canvas size 900x600 but we adapt)
function scaleX(x) { return (x / 900) * canvas.width || x; }
function scaleY(y) { return (y / 600) * canvas.height || y; }

// mouse interaction: click select / order
canvas.addEventListener('mousemove', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  hoverTerritory = null;
  for (let t of STATE.territories) {
    const dx = mx - scaleX(t.x);
    const dy = my - scaleY(t.y);
    if (Math.hypot(dx, dy) < 36) { hoverTerritory = t; break; }
  }
  draw();
});

canvas.addEventListener('click', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  let clicked = null;
  for (let t of STATE.territories) {
    const dx = mx - scaleX(t.x);
    const dy = my - scaleY(t.y);
    if (Math.hypot(dx, dy) < 36) { clicked = t; break; }
  }

  if (!clicked) return;

  // if no source selected and clicked your territory -> select
  if (!selectedSource) {
    if (clicked.owner === STATE.playerId) {
      selectedSource = clicked;
      appendLog(`Seleccionado origen: ${clicked.name}`);
    } else {
      appendLog(`No puedes seleccionar ${clicked.name} (no es tuyo)`);
    }
    draw();
    return;
  }

  // If selectedSource exists and clicked same -> deselect
  if (selectedSource.id === clicked.id) {
    selectedSource = null;
    appendLog(`Origen deseleccionado`);
    draw();
    return;
  }

  // If selected source exists and click another -> enviar orden
  if (selectedSource && clicked) {
    // comprobar vecinos
    if (!selectedSource.neighbors.includes(clicked.id)) {
      appendLog(`Destino no vecino: ${clicked.name} (solo vecinos permitidos en este demo)`);
      selectedSource = null;
      draw();
      return;
    }

    // calcular cantidad a enviar (porcentual)
    const percent = Math.max(1, Math.min(100, parseInt(sendNumInput.value) || 50));
    const sendTroops = Math.floor(selectedSource.troops * (percent/100));
    if (sendTroops <= 0) {
      appendLog('No hay tropas suficientes para enviar.');
      selectedSource = null;
      draw();
      return;
    }

    // enviar orden al servidor
    socket.emit('orderMove', { from: selectedSource.id, to: clicked.id, troops: sendTroops });
    appendLog(`Orden: ${selectedSource.name} -> ${clicked.name} tropas: ${sendTroops}`);
    selectedSource = null;
    draw();
  }
});

// mostrar imagen de referencia si existe (ruta cargada en README)
mapRefImg.src = ''; // si quieres mostrar imagen, coloca aquí la ruta proporcionada
// ejemplo: mapRefImg.src = '/assets/mi-mapa.png' or use the uploaded path: '/mnt/data/e81dd70d-28b8-4774-a698-7fdd7822c488.png'

// request initial state in case not arrived
socket.emit('requestState', {});

// loop de dibujado local para suavizar (opcional)
setInterval(() => {
  draw();
}, 1000/20);
