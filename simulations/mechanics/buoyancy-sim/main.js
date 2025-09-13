// --- Enhanced Buoyancy Simulator ---
// Features added: 
// - Realistic drag (grab anywhere on object)
// - Snap-to-equilibrium button
// - Show equilibrium line
// - Show force values on arrows
// - Show water density presets
// - Responsive canvas
// - Improved physics stability

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

// --- Water presets ---
const waterPresets = [
    { name: "Fresh Water", value: 1000 },
    { name: "Sea Water", value: 1030 },
    { name: "Glycerin", value: 1260 },
    { name: "Mercury", value: 13546 },
    { name: "Oil", value: 900 }
];
const fluidDensityInput = document.getElementById('fluidDensity');
const fluidDensityNum = document.getElementById('fluidDensityNum');
const fluidGroup = fluidDensityInput.parentElement;
const presetDiv = document.createElement('div');
presetDiv.style.marginTop = "6px";
waterPresets.forEach(p => {
    const btn = document.createElement('button');
    btn.textContent = p.name;
    btn.style.marginRight = "6px";
    btn.style.fontSize = "0.95em";
    btn.style.padding = "2px 8px";
    btn.style.background = "#e3f2fd";
    btn.style.border = "1px solid #b3e0fc";
    btn.style.borderRadius = "4px";
    btn.style.cursor = "pointer";
    btn.onclick = () => {
        fluidDensityInput.value = p.value;
        fluidDensityNum.value = p.value;
        params.fluidDensity = p.value;
    };
    presetDiv.appendChild(btn);
});
fluidGroup.appendChild(presetDiv);

// --- Snap to equilibrium button ---
const snapBtn = document.createElement('button');
snapBtn.textContent = "Snap to Equilibrium";
snapBtn.style.marginTop = "10px";
snapBtn.style.background = "#27ae60";
snapBtn.style.color = "#fff";
snapBtn.style.fontWeight = "bold";
snapBtn.style.border = "none";
snapBtn.style.borderRadius = "6px";
snapBtn.style.padding = "8px 12px";
snapBtn.style.cursor = "pointer";
snapBtn.onclick = snapToEquilibrium;
document.querySelector('.button-group').appendChild(snapBtn);

function resetSim() {
    state.y = getEquilibriumY();
    state.vy = 0;
    state.dragging = false;
    state.submerged = 0;
}

function snapToEquilibrium() {
    state.y = getEquilibriumY();
    state.vy = 0;
    state.dragging = false;
}

// --- Responsive canvas ---
function resizeCanvas() {
    // Maintain 16:9 aspect ratio
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
    // Volume in m³, 1L = 0.001 m³, assume square base
    const V = params.objectVolume * 0.001;
    const w = 80, h = Math.max(40, 80 * V); // visually scale with volume
    const x = simCanvas.width/2 - w/2;
    const y = state.y - h/2;
    return {x, y, w, h, V};
}
function getObjectCircle() {
    // V = 4/3 π r³ => r = (3V/4π)^(1/3)
    const V = params.objectVolume * 0.001;
    const r = Math.max(30, 80 * Math.cbrt(V));
    const cx = simCanvas.width/2;
    const cy = state.y;
    return {cx, cy, r, V};
}

function getWaterLevel() {
    return simCanvas.height * 0.65;
}

function getEquilibriumY() {
    // Find y where net force = 0 (for current params)
    // For block: solve for y so that buoyant = weight
    const g = params.gravity;
    const fluidRho = params.fluidDensity;
    const objRho = params.objectDensity;
    const V = params.objectVolume * 0.001;
    const m = objRho * V;
    const yWater = getWaterLevel();

    if (params.shape === 'rect') {
        const h = Math.max(40, 80 * V);
        let submFrac = Math.min(1, Math.max(0, (fluidRho * V * g) / (m * g)));
        // y = yWater + h/2 - h*submFrac
        return yWater + h/2 - h * submFrac;
    } else {
        // Sphere: submFrac = (fluidRho / objRho)
        const r = Math.max(30, 80 * Math.cbrt(V));
        let submFrac = Math.min(1, Math.max(0, (fluidRho / objRho)));
        // Place so that the correct fraction is below water
        // y = yWater + r - 2*r*submFrac
        return yWater + r - 2 * r * submFrac;
    }
}

function calcPhysics() {
    // Calculate forces and update state
    const g = params.gravity;
    const fluidRho = params.fluidDensity;
    const objRho = params.objectDensity;
    const V = params.objectVolume * 0.001; // m³
    const m = objRho * V; // kg
    const yWater = getWaterLevel();

    // Find submerged volume
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
            // Spherical cap volume formula
            const h = objBottom - yWater;
            const capH = Math.min(2*r, Math.max(0, h));
            const capV = (Math.PI * capH * capH * (3*r - capH)) / 3;
            submergedV = V * (capV / ((4/3)*Math.PI*r*r*r));
            submergedFrac = Math.min(1, Math.max(0, capV / ((4/3)*Math.PI*r*r*r)));
        }
    }

    // Forces
    const weight = m * g;
    const buoyant = fluidRho * g * submergedV;
    const netForce = buoyant - weight;

    // Update velocity and position if not dragging
    if (!state.dragging) {
        state.vy += netForce / (m || 1) * 0.5; // dt fudge for smoothness
        state.vy *= 0.96; // more damping for stability
        state.y += state.vy;
        // Boundaries
        if (params.shape === 'rect') {
            const {h} = getObjectRect();
            if (state.y > simCanvas.height - h/2) {
                state.y = simCanvas.height - h/2;
                state.vy = 0;
            }
            if (state.y < h/2) {
                state.y = h/2;
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

    // Update state
    state.submerged = submergedFrac;

    // Update UI
    document.getElementById('objectMassDisp').textContent = m.toFixed(2);
    document.getElementById('weightDisp').textContent = weight.toFixed(2);
    document.getElementById('buoyantDisp').textContent = buoyant.toFixed(2);
    document.getElementById('netForceDisp').textContent = netForce.toFixed(2);
    document.getElementById('submergedDisp').textContent = (submergedV * 1000).toFixed(2);
}

function drawSim() {
    ctx.clearRect(0, 0, simCanvas.width, simCanvas.height);

    // Draw water
    const yWater = getWaterLevel();
    ctx.save();
    ctx.fillStyle = "#b3e0fc";
    ctx.fillRect(0, yWater, simCanvas.width, simCanvas.height - yWater);
    ctx.strokeStyle = "#1976d2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, yWater);
    ctx.lineTo(simCanvas.width, yWater);
    ctx.stroke();
    ctx.restore();

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
        // Submerged part
        ctx.save();
        ctx.fillStyle = "rgba(39,174,96,0.25)";
        if (y + h > yWater) {
            const submH = Math.min(h, y + h - yWater);
            ctx.fillRect(x, y + h - submH, w, submH);
        }
        ctx.restore();
        // Outline
        ctx.save();
        ctx.fillStyle = "#fbc02d";
        ctx.strokeStyle = "#b8860b";
        ctx.lineWidth = 3;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
        // Drag handle
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + w/2, y, 12, 0, 2*Math.PI);
        ctx.fillStyle = "#1976d2";
        ctx.fill();
        ctx.restore();
    } else {
        const {cx, cy, r} = getObjectCircle();
        // Submerged part
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2*Math.PI);
        ctx.clip();
        ctx.fillStyle = "rgba(39,174,96,0.25)";
        if (cy + r > yWater) {
            ctx.fillRect(cx - r, yWater, 2*r, cy + r - yWater);
        }
        ctx.restore();
        // Outline
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2*Math.PI);
        ctx.fillStyle = "#fbc02d";
        ctx.strokeStyle = "#b8860b";
        ctx.lineWidth = 3;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        // Drag handle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy - r, 12, 0, 2*Math.PI);
        ctx.fillStyle = "#1976d2";
        ctx.fill();
        ctx.restore();
    }

    // Draw force arrows
    drawForces();

    // Draw labels
    ctx.save();
    ctx.font = "bold 1.3em Segoe UI";
    ctx.fillStyle = "#1976d2";
    ctx.fillText("Fluid", 30, yWater + 40);
    ctx.fillStyle = "#b8860b";
    ctx.fillText("Object", simCanvas.width/2 - 60, 60);
    ctx.restore();
}

function drawForces() {
    // Draw weight (down) and buoyant (up) arrows with values
    const g = params.gravity;
    const fluidRho = params.fluidDensity;
    const objRho = params.objectDensity;
    const V = params.objectVolume * 0.001;
    const m = objRho * V;
    const yWater = getWaterLevel();

    let objCenterY;
    if (params.shape === 'rect') {
        const {x, y, w, h} = getObjectRect();
        objCenterY = y + h/2;
    } else {
        const {cx, cy} = getObjectCircle();
        objCenterY = cy;
    }

    // Forces
    const weight = m * g;
    let submergedV = 0;
    if (params.shape === 'rect') {
        const {x, y, w, h, V} = getObjectRect();
        const objBottom = y + h;
        if (objBottom < yWater) {
            submergedV = 0;
        } else if (y > yWater) {
            submergedV = V;
        } else {
            const submH = Math.min(h, objBottom - yWater);
            submergedV = V * (submH / h);
        }
    } else {
        const {cx, cy, r, V} = getObjectCircle();
        const objBottom = cy + r;
        const objTop = cy - r;
        if (objBottom < yWater) {
            submergedV = 0;
        } else if (objTop > yWater) {
            submergedV = V;
        } else {
            const h = objBottom - yWater;
            const capH = Math.min(2*r, Math.max(0, h));
            const capV = (Math.PI * capH * capH * (3*r - capH)) / 3;
            submergedV = V * (capV / ((4/3)*Math.PI*r*r*r));
        }
    }
    const buoyant = fluidRho * g * submergedV;

    // Weight arrow (down)
    drawArrowWithValue(simCanvas.width/2 + 60, objCenterY, simCanvas.width/2 + 60, objCenterY + 80, "#e74c3c", 6, weight, "N", "down");
    // Buoyant arrow (up)
    drawArrowWithValue(simCanvas.width/2 - 60, objCenterY, simCanvas.width/2 - 60, objCenterY - 80, "#27ae60", 6, buoyant, "N", "up");
}

function drawArrowWithValue(x1, y1, x2, y2, color, width, value, unit, direction) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 16 * Math.cos(angle - 0.4), y2 - 16 * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - 16 * Math.cos(angle + 0.4), y2 - 16 * Math.sin(angle + 0.4));
    ctx.lineTo(x2, y2);
    ctx.fillStyle = color;
    ctx.fill();

    // Value label
    ctx.font = "bold 1.1em Segoe UI";
    ctx.fillStyle = color;
    if (direction === "down")
        ctx.fillText(value.toFixed(1) + " " + unit, x2 + 10, y2 + 18);
    else
        ctx.fillText(value.toFixed(1) + " " + unit, x2 + 10, y2 - 8);
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