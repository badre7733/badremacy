// server/server.js
// Node.js + Express + Socket.io - servidor del juego con ticks, producción, movimiento y combate

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir carpeta public (ruta absoluta)
app.use(express.static(path.join(__dirname, '../public')));
console.log('Sirviendo archivos desde:', path.join(__dirname, '../public'));

// ---------- Configuración del juego ----------
const TICK_MS = 3000;            // tick del servidor (ms) - actualiza movimiento
const PRODUCTION_TICKS = 7;      // cada N ticks se produce tropas
const PRODUCTION_PER_TERRITORY = 2; // tropas que produce cada territorio
const TRAVEL_SPEED = 100;        // px / segundo (velocidad base de marcha)
const MAX_INITIAL_TROOPS = 12;   // tropas iniciales por territorio

// Mapa de ejemplo (territorios con conexiones)
let territories = [
  { id: 't1', name: 'España', x: 150, y: 350, owner: null, troops: 8, income: 2, neighbors: ['t2','t4'] },
  { id: 't2', name: 'Francia', x: 330, y: 250, owner: null, troops: 10, income: 3, neighbors: ['t1','t3','t5'] },
  { id: 't3', name: 'Alemania', x: 520, y: 220, owner: null, troops: 11, income: 3, neighbors: ['t2','t6'] },
  { id: 't4', name: 'Portugal', x: 120, y: 460, owner: null, troops: 6, income: 1, neighbors: ['t1'] },
  { id: 't5', name: 'Italia', x: 430, y: 360, owner: null, troops: 9, income: 2, neighbors: ['t2','t4','t6'] },
  { id: 't6', name: 'Rumania', x: 660, y: 300, owner: null, troops: 7, income: 2, neighbors: ['t3','t5'] }
];

// Ejércitos en marcha (marchas)
let marches = []; // { id, owner, from, to, troops, startTime, travelTime, progress }

// Jugadores conectados
let players = {}; // socketId -> { id, resources, color }

// colores para asignar
const COLORS = ['#1776ff','#ff5c5c','#2ecc71','#f39c12','#9b59b6','#e67e22'];

// ---------- Helpers ----------
function findTerritory(id) { return territories.find(t => t.id === id); }
function now() { return Date.now(); }
function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}
function assignColorForNewPlayer() {
  const used = Object.values(players).map(p => p.color);
  for (let c of COLORS) if (!used.includes(c)) return c;
  return COLORS[Math.floor(Math.random()*COLORS.length)];
}

// ---------- Inicialización: asignar territorios iniciales hasta agotar (1 por jugador si hay disponibles) ----------
function assignInitialTerritory(socketId) {
  // buscar territorio sin owner
  const free = territories.find(t => !t.owner);
  if (free) {
    free.owner = socketId;
    // darle inicialmente alguna tropa de refuerzo
    free.troops = Math.max(5, Math.min(MAX_INITIAL_TROOPS, free.troops));
  }
}

// ---------- Lógica de combate al llegar ----------
function resolveArrival(march) {
  const toT = findTerritory(march.to);
  if (!toT) return;

  // Si territorio está vacío o es del mismo dueño -> sumar tropas y reclamar
  if (!toT.owner || toT.owner === march.owner) {
    toT.troops += march.troops;
    toT.owner = march.owner;
    return;
  }

  // Si es enemigo -> combate simple: comparativa de tropas
  if (toT.troops < march.troops) {
    // atacante gana, le quedan tropas = ataques - defensa
    const remaining = march.troops - toT.troops;
    toT.owner = march.owner;
    toT.troops = Math.max(0, remaining); // mínimo 0
  } else if (toT.troops === march.troops) {
    // empate: ambos eliminados, territorio queda neutral con 0 tropas
    toT.troops = 0;
    toT.owner = null;
  } else {
    // defensor gana
    toT.troops = toT.troops - march.troops;
  }
}

// ---------- API de sockets ----------
io.on('connection', socket => {
  console.log('Jugador conectado', socket.id);

  // crear jugador
  players[socket.id] = {
    id: socket.id,
    resources: 0,
    color: assignColorForNewPlayer()
  };

  // asignar territorio si hay libre
  assignInitialTerritory(socket.id);

  // enviar estado completo actual al nuevo jugador
  socket.emit('state', {
    playerId: socket.id,
    players,
    territories,
    marches
  });

  // avisar a todos del nuevo estado
  io.emit('state', { playerId: null, players, territories, marches });

  // mover/order tropas: payload { from, to, troops }
  socket.on('orderMove', payload => {
    try {
      const { from, to, troops } = payload;
      // validaciones básicas
      const fromT = findTerritory(from);
      const toT = findTerritory(to);
      if (!fromT || !toT) return;
      if (fromT.owner !== socket.id) return; // no es tu territorio
      if (troops <= 0 || fromT.troops < troops) return;

      // comprobar que 'to' sea vecino (permitimos solo rutas directas entre vecinos)
      if (!fromT.neighbors.includes(to)) {
        // opcional: permitir ruta por múltiples saltos implementando pathfinding
        return;
      }

      // crear marcha
      const distance = dist(fromT, toT);
      const travelSeconds = Math.max(0.5, distance / TRAVEL_SPEED); // en segundos
      const march = {
        id: uuidv4(),
        owner: socket.id,
        from,
        to,
        troops,
        startTime: now(),
        travelTime: travelSeconds * 1000, // ms
        progress: 0
      };

      // restar tropas del origen inmediatamente
      fromT.troops -= troops;
      if (fromT.troops < 0) fromT.troops = 0;

      marches.push(march);

      // emitir estado actualizado
      io.emit('state', { playerId: null, players, territories, marches });
    } catch (err) {
      console.error('orderMove error', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Jugador desconectado', socket.id);
    // mantener territorios libres si se desconecta
    // (podríamos detectar reconexión y reasignar)
    delete players[socket.id];
    // liberar territorios (opcional: los dejamos con owner null)
    territories.forEach(t => { if (t.owner === socket.id) t.owner = null; });
    io.emit('state', { playerId: null, players, territories, marches });
  });
});

// ---------- Loop principal (ticks) ----------
let tickCount = 0;
setInterval(() => {
  tickCount++;

  // avanzar marchas
  const nowTime = now();
  for (let m of marches) {
    const elapsed = nowTime - m.startTime;
    m.progress = Math.min(1, elapsed / m.travelTime);
  }

  // procesar marchas completadas (no durante iteración del array directamente)
  const arrived = marches.filter(m => m.progress >= 1);
  if (arrived.length > 0) {
    for (let m of arrived) {
      resolveArrival(m);
      // eliminar la marcha
      marches = marches.filter(x => x.id !== m.id);
    }
  }

  // producción por cada N ticks
  if (tickCount % PRODUCTION_TICKS === 0) {
    territories.forEach(t => {
      if (t.owner) {
        t.troops += t.income || PRODUCTION_PER_TERRITORY;
        // opcional: añadir recursos
        if (players[t.owner]) players[t.owner].resources = (players[t.owner].resources || 0) + (t.income || 1);
      }
    });
  }

  // emitir estado regular
  io.emit('state', { playerId: null, players, territories, marches });

}, TICK_MS);

// arrancar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
