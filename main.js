const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let territories = {};
let myId;

// Definición inicial del mapa (será reemplazada por servidor)
const mapData = [
    {id: 't1', x: 150, y: 150, owner: null, troops: 5},
    {id: 't2', x: 400, y: 150, owner: null, troops: 5},
    {id: 't3', x: 650, y: 150, owner: null, troops: 5},
    {id: 't4', x: 275, y: 350, owner: null, troops: 5},
    {id: 't5', x: 525, y: 350, owner: null, troops: 5},
];

// Click para mover tropas
let selectedTerritory = null;
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (let id in territories) {
        const t = territories[id];
        const dx = mx - t.x;
        const dy = my - t.y;
        if (Math.sqrt(dx*dx + dy*dy) < 30) {
            if (!selectedTerritory && t.owner === myId) {
                selectedTerritory = t;
            } else if (selectedTerritory && t.id !== selectedTerritory.id) {
                socket.emit('moveTroops', {
                    from: selectedTerritory.id,
                    to: t.id,
                    troops: Math.floor(selectedTerritory.troops / 2)
                });
                selectedTerritory = null;
            }
        }
    }
});

// Inicialización desde servidor
socket.on('init', (data) => {
    territories = data.territories;
    myId = data.id;
    draw();
});

// Actualización de estado
socket.on('update', (data) => {
    territories = data.territories;
    draw();
});

// Dibujar mapa
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawLine('t1','t2');
    drawLine('t2','t3');
    drawLine('t1','t4');
    drawLine('t2','t4');
    drawLine('t2','t5');
    drawLine('t3','t5');
    drawLine('t4','t5');

    for (let id in territories) {
        const t = territories[id];
        ctx.fillStyle = t.owner === myId ? 'blue' : (t.owner ? 'red' : 'gray');
        ctx.beginPath();
        ctx.arc(t.x, t.y, 30, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.troops, t.x, t.y);
    }
}

// Dibujar línea entre territorios
function drawLine(fromId, toId) {
    const f = territories[fromId];
    const t = territories[toId];
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
}
