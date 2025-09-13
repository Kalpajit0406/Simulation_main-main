/* -------------------------------------------------------------
   Barlow’s Wheel – Three.js simulation (wheel.js)
   -----------------------------------------------------------*/

let scene, camera, renderer;
let wheel, axle;
let isRunning = false;

// --- USER‑CONTROLLABLE PARAMETERS ---------------------------------
let V = 6;                // battery voltage (V)
let Bperc = 0.5;          // magnetic field as a fraction of max (0‑1)
let R = 20;               // series resistance (Ω)
let friction = 0.05;      // angular damping (0‑0.2)

const wheelRadius = 2;    // radius of the wheel (world units)
const conductorLen = 0.5; // effective length of current‑carrying segment

// --- PHYSICS HELPERS ----------------------------------------------
let angularVelocity = 0;   // rad / s (positive = clockwise)

// ---------------------------------------------------------------
// 1️⃣ Initialise Three‑js scene
// ---------------------------------------------------------------
function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1526);

    camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
    camera.position.set(0, 4, 10);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    window.addEventListener('resize', onResize);
}

// ---------------------------------------------------------------
// 2️⃣ Build the experiment (wheel, magnet, battery, mercury trough)
// ---------------------------------------------------------------
function buildExperiment() {
    // ---- Wheel -------------------------------------------------
    const wheelGrp = new THREE.Group();

    // Main disc
    const discGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.2, 32);
    const discMat = new THREE.MeshStandardMaterial({
        color: 0x2e86c1,
        metalness: 0.9,
        roughness: 0.1
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    wheelGrp.add(disc);
    wheel = disc; // keep a reference for rotation

    // Simple spokes (visual only)
    const spokeGeo = new THREE.CylinderGeometry(0.04, 0.04, wheelRadius, 8);
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0x1b4f72 });
    for (let i = 0; i < 12; i++) {
        const spoke = new THREE.Mesh(spokeGeo, spokeMat);
        const ang = (i / 12) * Math.PI * 2;
        spoke.position.set(Math.cos(ang) * wheelRadius * 0.45,
                         Math.sin(ang) * wheelRadius * 0.45,
                         0);
        spoke.rotation.z = ang;
        spoke.castShadow = true;
        wheelGrp.add(spoke);
    }

    // Axle (acts as the current carrier)
    const axleGeo = new THREE.CylinderGeometry(0.12, 0.12, 3, 16);
    const axleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const axleMesh = new THREE.Mesh(axleGeo, axleMat);
    axleMesh.rotation.x = Math.PI / 2;
    axleMesh.position.set(0, 0, 0);
    axleMesh.castShadow = true;
    wheelGrp.add(axleMesh);
    axle = axleMesh;

    scene.add(wheelGrp);

    // ---- Magnet (drawn as two coloured blocks) ---------------
    const magGrp = new THREE.Group();

    const poleGeo = new THREE.BoxGeometry(1, 1.5, 1);
    const northMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    const southMat = new THREE.MeshStandardMaterial({ color: 0x4444ff });

    const north = new THREE.Mesh(poleGeo, northMat);
    north.position.set(0, -0.95, 1.5);
    magGrp.add(north);

    const south = new THREE.Mesh(poleGeo, southMat);
    south.position.set(0, -0.95, -1.5);
    magGrp.add(south);

    // simple base (non‑magnetic)
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 4), baseMat);
    base.position.y = -1.6;
    magGrp.add(base);

    scene.add(magGrp);

    // ---- Battery ------------------------------------------------
    const batGrp = new THREE.Group();
    const batBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 2.2, 32),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    batBody.position.set(-5, 0.5, 0);
    batBody.castShadow = true;
    batGrp.add(batBody);

    const posTerm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.2, 32),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    posTerm.position.set(-5, 1.2, 0);
    batGrp.add(posTerm);

    const negTerm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.1, 32),
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    negTerm.position.set(-5, -0.2, 0);
    batGrp.add(negTerm);
    scene.add(batGrp);

    // ---- Mercury trough (visual only) --------------------------
    const trough = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 0.4, 32),
        new THREE.MeshStandardMaterial({ color: 0x777777 })
    );
    trough.position.set(0, -1.7, 0);
    trough.receiveShadow = true;
    scene.add(trough);
}

// ---------------------------------------------------------------
// 3️⃣ UI & event wiring
// ---------------------------------------------------------------
function bindUI() {
    const vSlider = document.getElementById('voltage');
    const vVal = document.getElementById('voltageVal');
    vSlider.addEventListener('input', () => {
        V = Number(vSlider.value);
        vVal.textContent = V;
    });

    const fSlider = document.getElementById('field');
    const fVal = document.getElementById('fieldVal');
    fSlider.addEventListener('input', () => {
        Bperc = Number(fSlider.value) / 100;
        fVal.textContent = fSlider.value;
    });

    const rSlider = document.getElementById('resistance');
    const rVal = document.getElementById('resistanceVal');
    rSlider.addEventListener('input', () => {
        R = Number(rSlider.value);
        rVal.textContent = R;
    });

    const fricSlider = document.getElementById('friction');
    const fricVal = document.getElementById('frictionVal');
    fricSlider.addEventListener('input', () => {
        friction = Number(fricSlider.value) / 100;
        fricVal.textContent = friction.toFixed(2);
    });

    document.getElementById('runBtn').addEventListener('click', () => {
        isRunning = !isRunning;
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        V = 6; Bperc = 0.5; R = 20; friction = 0.05; angularVelocity = 0; isRunning = false;
        vSlider.value = V; vVal.textContent = V;
        fSlider.value = Bperc * 100; fVal.textContent = Bperc * 100;
        rSlider.value = R; rVal.textContent = R;
        fricSlider.value = friction * 100; fricVal.textContent = friction.toFixed(2);
    });
}

// ---------------------------------------------------------------
// 4️⃣ Physics – compute current, force, torque, angular velocity
// ---------------------------------------------------------------
function computePhysics(dt) {
    // Ohm's law (ignore internal battery resistance)
    const I = V / R;                     // A
    const B = 0.6 * Bperc;              // Tesla (max ≈0.6 T, adjustable by %)
    const F = B * I * conductorLen;     // N  (Lorentz force)
    const τ = F * wheelRadius;          // N·m (torque = force × radius)

    // Angular acceleration (τ = I·α). Approx. moment of inertia for a thin disc:
    const Idisc = 0.5 * 1.0 * wheelRadius * wheelRadius; // assume unit mass 1 kg
    const α = τ / Idisc;                // rad / s²

    // Update angular velocity with simple Euler integration
    if (isRunning) {
        angularVelocity += α * dt;
    } else {
        // Motor off – just let friction slowly stop the wheel
    }

    // Apply linear friction (damping)
    angularVelocity *= (1 - friction);
    if (Math.abs(angularVelocity) < 0.0005) angularVelocity = 0;

    // Rotate the wheel
    wheel.rotation.z += angularVelocity * dt;

    // ----- Update UI values -----
    document.getElementById('current').textContent = I.toFixed(2);
    document.getElementById('force').textContent = F.toFixed(3);
    document.getElementById('torque').textContent = τ.toFixed(3);
    document.getElementById('speed').textContent = angularVelocity.toFixed(3);
}

// ---------------------------------------------------------------
// 5️⃣ Render loop
// ---------------------------------------------------------------
let lastTime = 0;
function animate(timestamp) {
    requestAnimationFrame(animate);
    const dt = (timestamp - lastTime) / 1000; // seconds
    lastTime = timestamp;

    computePhysics(dt);
    renderer.render(scene, camera);
}

// ---------------------------------------------------------------
// 6️⃣ Helper – window resize
// ---------------------------------------------------------------
function onResize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}

// ---------------------------------------------------------------
// 7️⃣ Initialise everything
// ---------------------------------------------------------------
initThree();
buildExperiment();
bindUI();
animate(); // kick‑off the render loop
