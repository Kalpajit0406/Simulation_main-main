const simCanvas = document.getElementById('simCanvas');
const ctx = simCanvas.getContext('2d');

// --- Parameters and State ---
let params = {
    shape: 'rect',
    objectDensity: 800, // kg/m³
    objectVolume: 2,    // L
    fluidDensity: 1000, // kg/m³
    gravity: 9.8,       // m/s²
};
let state = {
    y: 320,             // vertical position of object (pixels)
    vy: 0,              // vertical velocity (pixels/frame)
    dragging: false,
    dragOffset: 0,
    submerged: 0,       // fraction submerged
    lastUpdate: Date.now()
};

// --- Load Textures ---
const waterTexture = new Image();
waterTexture.src = 'textures/water.png'; // Path to water texture

// --- UI Sync ---
function syncInputs(id1, id2, cb) {
    const el1 = document.getElementById(id1);
    const el2 = document.getElementById(id2);
    el1.addEventListener('input', () => {
        el2.value = el1.value;
        cb(parseFloat(el1.value));
    });
    el2.addEventListener('input', () => {
        el1.value = el2.value;
        cb(parseFloat(el2.value));
    });
}
syncInputs('objectDensity', 'objectDensityNum', v => { params.objectDensity = v; });
syncInputs('objectVolume', 'objectVolumeNum', v => { params.objectVolume = v; });
syncInputs('fluidDensity', 'fluidDensityNum', v => { params.fluidDensity = v; });
syncInputs('gravity', 'gravityNum', v => { params.gravity = v; });

document.getElementById('objectShape').addEventListener('change', e => {
    params.shape = e.target.value;
    resetSim();
});
document.getElementById('resetBtn').addEventListener('click', resetSim);

// --- Reset Simulation ---
function resetSim() {
    state.y = getEquilibriumY();
    state.vy = 0;
    state.dragging = false;
    state.submerged = 0;
}

// --- Responsive Canvas ---
function resizeCanvas() {
    const parent = simCanvas.parentElement;
    let w = parent.offsetWidth, h = parent.offsetHeight;
    if (w / h > 16/9) w = h * 16/9;
    else h = w * 9/16;
    simCanvas.width = w;
    simCanvas.height = h;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Drag and Drop for Object ---
simCanvas.addEventListener('mousedown', e => {
    const rect = simCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (isOnObject(mx, my)) {
        state.dragging = true;
        state.dragOffset = my - state.y;
    }
});
window.addEventListener('mousemove', e => {
    if (!state.dragging) return;
    const rect = simCanvas.getBoundingClientRect();
    const my = e.clientY - rect.top;
    state.y = Math.max(80, Math.min(my - state.dragOffset, simCanvas.height - 80));
});
window.addEventListener('mouseup', () => {
    state.dragging = false;
});

// --- Physics and Drawing ---
function isOnObject(mx, my) {
    const {shape} = params;
    if (shape === 'rect') {
        const {x, y, w, h} = getObjectRect();
        return mx >= x && mx <= x + w && my >= y && my <= y + h;
    } else {
        const {cx, cy, r} = getObjectCircle();
        return Math.hypot(mx - cx, my - cy) <= r;
    }
}

function getObjectRect() {
    const V = params.objectVolume * 0.001;
    const w = 80, h = Math.max(40, 80 * V);
    const x = simCanvas.width / 2 - w / 2;
    const y = state.y - h / 2;
    return {x, y, w, h, V};
}

function getObjectCircle() {
    const V = params.objectVolume * 0.001;
    const r = Math.max(30, 80 * Math.cbrt(V));
    const cx = simCanvas.width / 2;
    const cy = state.y;
    return {cx, cy, r, V};
}

function getWaterLevel() {
    return simCanvas.height * 0.65;
}

function getEquilibriumY() {
    const g = params.gravity;
    const fluidRho = params.fluidDensity;
    const objRho = params.objectDensity;
    const V = params.objectVolume * 0.001;
    const m = objRho * V;
    const yWater = getWaterLevel();

    if (params.shape === 'rect') {
        const h = Math.max(40, 80 * V);
        let submFrac = Math.min(1, Math.max(0, (fluidRho * V * g) / (m * g)));
        return yWater + h / 2 - h * submFrac;
    } else {
        const r = Math.max(30, 80 * Math.cbrt(V));
        let submFrac = Math.min(1, Math.max(0, (fluidRho / objRho)));
        return yWater + r - 2 * r * submFrac;
    }
}

function calcPhysics() {
    const g = params.gravity;
    const fluidRho = params.fluidDensity;
    const objRho = params.objectDensity;
    const V = params.objectVolume * 0.001;
    const m = objRho * V;
    const yWater = getWaterLevel();

    let submergedV = 0;
    let submergedFrac = 0;
    let objBottom, objTop;
    if (params.shape === 'rect') {
        const {x, y, w, h} = getObjectRect();
        objTop = y;
        objBottom = y + h;
        if (objBottom < yWater) {
            submergedV = 0;
            submergedFrac = 0;
        } else if (objTop > yWater) {
            submergedV = V;
            submergedFrac = 1;
        } else {
            const submH = objBottom - yWater;
            submergedFrac = Math.min(1, Math.max(0, submH / h));
            submergedV = V * submergedFrac;
        }
    } else {
        const {cx, cy, r} = getObjectCircle();
        objTop = cy - r;
        objBottom = cy + r;
        if (objBottom < yWater) {
            submergedV = 0;
            submergedFrac = 0;
        } else if (objTop > yWater) {
            submergedV = V;
            submergedFrac = 1;
        } else {
            const h = objBottom - yWater;
            const capH = Math.min(2 * r, Math.max(0, h));
            const capV = (Math.PI * capH * capH * (3 * r - capH)) / 3;
            submergedV = V * (capV / ((4 / 3) * Math.PI * r * r * r));
            submergedFrac = Math.min(1, Math.max(0, capV / ((4 / 3) * Math.PI * r * r * r)));
        }
    }

    const weight = m * g;
    const buoyant = fluidRho * g * submergedV;
    const netForce = buoyant - weight;

    if (!state.dragging) {
        state.vy += netForce / (m || 1) * 0.5;
        state.vy *= 0.96;
        state.y += state.vy;
        if (params.shape === 'rect') {
            const {h} = getObjectRect();
            if (state.y > simCanvas.height - h / 2) {
                state.y = simCanvas.height - h / 2;
                state.vy = 0;
            }
            if (state.y < h / 2) {
                state.y = h / 2;
                state.vy = 0;
            }
        } else {
            const {r} = getObjectCircle();
            if (state.y > simCanvas.height - r) {
                state.y = simCanvas.height - r;
                state.vy = 0;
            }
            if (state.y < r) {
                state.y = r;
                state.vy = 0;
            }
        }
    }

    state.submerged = submergedFrac;

    document.getElementById('objectMassDisp').textContent = m.toFixed(2);
    document.getElementById('weightDisp').textContent = weight.toFixed(2);
    document.getElementById('buoyantDisp').textContent = buoyant.toFixed(2);
    document.getElementById('netForceDisp').textContent = netForce.toFixed(2);
    document.getElementById('submergedDisp').textContent = (submergedV * 1000).toFixed(2);
}

function drawSim() {
    ctx.clearRect(0, 0, simCanvas.width, simCanvas.height);

    // Draw water texture
    ctx.drawImage(waterTexture, 0, getWaterLevel(), simCanvas.width, simCanvas.height - getWaterLevel());

    // Draw equilibrium line
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = "#27ae60";
    ctx.lineWidth = 2;
    const eqY = getEquilibriumY();
    ctx.beginPath();
    ctx.moveTo(0, eqY);
    ctx.lineTo(simCanvas.width, eqY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "bold 1.1em Segoe UI";
    ctx.fillStyle = "#27ae60";
    ctx.fillText("Equilibrium", 20, eqY - 10);
    ctx.restore();

    // Draw object
    if (params.shape === 'rect') {
        const {x, y, w, h} = getObjectRect();
        ctx.save();
        ctx.fillStyle = "rgba(39,174,96,0.25)";
        if (y + h > getWaterLevel()) {
            const submH = Math.min(h, y + h - getWaterLevel());
            ctx.fillRect(x, y + h - submH, w, submH);
        }
        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#fbc02d";
        ctx.strokeStyle = "#b8860b";
        ctx.lineWidth = 3;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    } else {
        const {cx, cy, r} = getObjectCircle();
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.clip();
        ctx.fillStyle = "rgba(39,174,96,0.25)";
        if (cy + r > getWaterLevel()) {
            ctx.fillRect(cx - r, getWaterLevel(), 2 * r, cy + r - getWaterLevel());
        }
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fillStyle = "#fbc02d";
        ctx.strokeStyle = "#b8860b";
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Draw labels
    ctx.save();
    ctx.font = "bold 1.3em Segoe UI";
    ctx.fillStyle = "#1976d2";
    ctx.fillText("Fluid", 30, getWaterLevel() + 40);
    ctx.fillStyle = "#b8860b";
    ctx.fillText("Object", simCanvas.width / 2 - 60, 60);
    ctx.restore();
}

// --- Animation Loop ---
function loop() {
    resizeCanvas();
    calcPhysics();
    drawSim();
    requestAnimationFrame(loop);
}
loop();