import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
class OhmsLawSimulation {
    constructor() {
        this.voltage = 12.0;
        this.resistance = 6.0;
        this.current = this.voltage / this.resistance;
        
        this.particles = [];
        this.circuit = {};
        
        this.isCircuitOn = false; // Add power state

        this.init();
        this.createCircuit();
        this.createCurrentParticles();
        this.setupControls();
        this.createPowerSwitch();
        this.animate();
    }

    init() {
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f0f23);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 8, 12);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.getElementById('container').appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);

        // Grid helper
        const gridHelper = new THREE.GridHelper(20, 20, 0x333333, 0x333333);
        this.scene.add(gridHelper);
    }

    createCircuit() {
        // Circuit board base
        const boardGeometry = new THREE.BoxGeometry(12, 0.2, 8);
        const boardMaterial = new THREE.MeshLambertMaterial({ color: 0x2d5016 });
        const board = new THREE.Mesh(boardGeometry, boardMaterial);
        board.position.y = 0.1;
        board.receiveShadow = true;
        this.scene.add(board);

        // Create detailed battery
        const batteryGroup = new THREE.Group();
        
        // Main battery body
        const batteryBodyGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2.5, 16);
        const batteryBodyMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x444444,
            metalness: 0.7,
            roughness: 0.3
        });
        const batteryBody = new THREE.Mesh(batteryBodyGeometry, batteryBodyMaterial);
        
        // Battery positive terminal
        const posTerminalGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 16);
        const posTerminalMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        const posTerminal = new THREE.Mesh(posTerminalGeometry, posTerminalMaterial);
        posTerminal.position.y = 1.35;
        
        // Battery label
        const batteryLabelGeometry = new THREE.CylinderGeometry(0.51, 0.51, 1.5, 32);
        const batteryLabelMaterial = new THREE.MeshPhongMaterial({
            color: 0x1a75ff,
            metalness: 0.5,
            roughness: 0.5
        });
        const batteryLabel = new THREE.Mesh(batteryLabelGeometry, batteryLabelMaterial);
        
        batteryGroup.add(batteryBody, posTerminal, batteryLabel);
        batteryGroup.rotation.z = Math.PI / 2;
        batteryGroup.position.set(-4, 1.8, 0);
        this.circuit.battery = batteryGroup;
        this.scene.add(batteryGroup);

        // Resistor
        const resistorGeometry = new THREE.CylinderGeometry(0.3, 0.3, 2, 16);
        const resistorMaterial = new THREE.MeshLambertMaterial({ color: 0xffb74d });
        this.circuit.resistor = new THREE.Mesh(resistorGeometry, resistorMaterial);
        this.circuit.resistor.position.set(4, 1.8, 0);
        this.circuit.resistor.rotation.z = Math.PI / 2;
        this.circuit.resistor.castShadow = true;
        this.scene.add(this.circuit.resistor);

        // Resistor color bands for visual effect
        for (let i = 0; i < 3; i++) {
            const bandGeometry = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 16);
            const colors = [0xff0000, 0x00ff00, 0x0000ff];
            const bandMaterial = new THREE.MeshLambertMaterial({ color: colors[i] });
            const band = new THREE.Mesh(bandGeometry, bandMaterial);
            band.position.set(4 - 0.6 + i * 0.4, 1.8, 0);
            band.rotation.z = Math.PI / 2;
            this.scene.add(band);
        }

        // Wires
        const wireGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const wireMaterial = new THREE.MeshLambertMaterial({ color: 0x4fc3f7 });

        // Top wire
        const topWire = new THREE.Mesh(wireGeometry, wireMaterial);
        topWire.position.set(0, 3, 0);
        topWire.rotation.z = Math.PI / 2;
        topWire.scale.x = 6;
        this.scene.add(topWire);

        // Bottom wire
        const bottomWire = new THREE.Mesh(wireGeometry, wireMaterial);
        bottomWire.position.set(0, 0.6, 0);
        bottomWire.rotation.z = Math.PI / 2;
        bottomWire.scale.x = 6;
        this.scene.add(bottomWire);

        // Left connecting wire
        const leftWire = new THREE.Mesh(wireGeometry, wireMaterial);
        leftWire.position.set(-5.5, 1.8, 0);
        leftWire.scale.y = 2.4;
        this.scene.add(leftWire);

        // Right connecting wire
        const rightWire = new THREE.Mesh(wireGeometry, wireMaterial);
        rightWire.position.set(5, 1.8, 0);
        rightWire.scale.y = 2.4;
        this.scene.add(rightWire);

        // Current flow arrow
        const arrowGeometry = new THREE.ConeGeometry(0.2, 0.5, 8);
        const arrowMaterial = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
        this.circuit.arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
        this.circuit.arrow.position.set(-2, 3.5, 0);
        this.circuit.arrow.rotation.z = -Math.PI / 2;
        this.scene.add(this.circuit.arrow);

        // Create detailed box at the other end
        const boxGroup = new THREE.Group();
        
        // Main box
        const boxGeometry = new THREE.BoxGeometry(2, 1.5, 1.5);
        const boxMaterial = new THREE.MeshPhongMaterial({
            color: 0x808080,
            metalness: 0.5,
            roughness: 0.7
        });
        const box = new THREE.Mesh(boxGeometry, boxMaterial);
        
        // Add ventilation slots
        for (let i = 0; i < 3; i++) {
            const slotGeometry = new THREE.BoxGeometry(0.8, 0.1, 1.6);
            const slotMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
            const slot = new THREE.Mesh(slotGeometry, slotMaterial);
            slot.position.y = 0.3 - (i * 0.3);
            boxGroup.add(slot);
        }
        
        boxGroup.add(box);
        boxGroup.position.set(4, 1.8, 0);
        this.scene.add(boxGroup);
    }

    createCurrentParticles() {
        const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        const particleMaterial = new THREE.MeshLambertMaterial({ 
            color: 0xffff00,
            emissive: 0x444400
        });

        // Create particles along the circuit path
        for (let i = 0; i < 20; i++) {
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);
            const t = i / 20;
            
            // Position particles along circuit path
            if (t < 0.25) {
                // Top wire
                const x = THREE.MathUtils.lerp(-5.5, 5, t * 4);
                particle.position.set(x, 3, 0);
            } else if (t < 0.5) {
                // Right wire down
                const y = THREE.MathUtils.lerp(3, 0.6, (t - 0.25) * 4);
                particle.position.set(5, y, 0);
            } else if (t < 0.75) {
                // Bottom wire
                const x = THREE.MathUtils.lerp(5, -5.5, (t - 0.5) * 4);
                particle.position.set(x, 0.6, 0);
            } else {
                // Left wire up
                const y = THREE.MathUtils.lerp(0.6, 3, (t - 0.75) * 4);
                particle.position.set(-5.5, y, 0);
            }
            
            particle.userData = { t: t, speed: 0.01 };
            this.particles.push(particle);
            this.scene.add(particle);
        }
    }

    updateParticles() {
        if (!this.isCircuitOn) {
            this.particles.forEach(particle => {
                particle.visible = false;
            });
            return;
        }

        this.particles.forEach(particle => {
            particle.visible = true;
            // Update particle position based on current
            const speed = this.current * 0.002; // Scale speed with current
            particle.userData.t += speed;
            
            if (particle.userData.t > 1) {
                particle.userData.t = 0;
            }
            
            const t = particle.userData.t;
            
            // Move particles along circuit path
            if (t < 0.25) {
                const x = THREE.MathUtils.lerp(-5.5, 5, t * 4);
                particle.position.set(x, 3, 0);
            } else if (t < 0.5) {
                const y = THREE.MathUtils.lerp(3, 0.6, (t - 0.25) * 4);
                particle.position.set(5, y, 0);
            } else if (t < 0.75) {
                const x = THREE.MathUtils.lerp(5, -5.5, (t - 0.5) * 4);
                particle.position.set(x, 0.6, 0);
            } else {
                const y = THREE.MathUtils.lerp(0.6, 3, (t - 0.75) * 4);
                particle.position.set(-5.5, y, 0);
            }
            
            // Scale particle size with current intensity
            const scale = 0.5 + (this.current / 10);
            particle.scale.setScalar(scale);
        });
    }

    setupControls() {
        const voltageSlider = document.getElementById('voltageSlider');
        const resistanceSlider = document.getElementById('resistanceSlider');
        
        voltageSlider.addEventListener('input', (e) => {
            this.voltage = parseFloat(e.target.value);
            this.updateValues();
        });
        
        resistanceSlider.addEventListener('input', (e) => {
            this.resistance = parseFloat(e.target.value);
            this.updateValues();
        });
    }

    // Add new method for power switch
    createPowerSwitch() {
        // Create switch base
        const switchBaseGeometry = new THREE.BoxGeometry(1, 0.2, 0.5);
        const switchBaseMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
        this.circuit.switchBase = new THREE.Mesh(switchBaseGeometry, switchBaseMaterial);
        this.circuit.switchBase.position.set(-2, 0.2, 1.5);
        this.scene.add(this.circuit.switchBase);

        // Create switch lever
        const switchLeverGeometry = new THREE.BoxGeometry(0.2, 0.6, 0.2);
        const switchLeverMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        this.circuit.switchLever = new THREE.Mesh(switchLeverGeometry, switchLeverMaterial);
        this.circuit.switchLever.position.set(-2, 0.5, 1.5);
        this.scene.add(this.circuit.switchLever);

        // Add click event for switch
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        window.addEventListener('click', (event) => {
            mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, this.camera);
            const intersects = raycaster.intersectObject(this.circuit.switchLever);

            if (intersects.length > 0) {
                this.togglePower();
            }
        });
    }

    // Add power toggle method
    togglePower() {
        this.isCircuitOn = !this.isCircuitOn;
        
        // Update switch appearance
        this.circuit.switchLever.material.color.setHex(this.isCircuitOn ? 0x00ff00 : 0xff0000);
        this.circuit.switchLever.rotation.z = this.isCircuitOn ? Math.PI/4 : 0;
        
        // Update display
        document.getElementById('powerStatus').textContent = this.isCircuitOn ? 'ON' : 'OFF';
        
        // Update circuit elements
        this.updateValues();
    }

    // Modify updateValues method to respect power state
    updateValues() {
        if (!this.isCircuitOn) {
            this.current = 0;
            document.getElementById('currentDisplay').textContent = '0.00';
            this.circuit.arrow.visible = false;
            return;
        }

        this.circuit.arrow.visible = true;
        // Calculate current using Ohm's law: I = V / R
        this.current = this.voltage / this.resistance;
        
        // Update displays
        document.getElementById('voltageDisplay').textContent = this.voltage.toFixed(1);
        document.getElementById('currentDisplay').textContent = this.current.toFixed(2);
        document.getElementById('resistanceDisplay').textContent = this.resistance.toFixed(1);
        
        document.getElementById('voltageValue').textContent = this.voltage.toFixed(1);
        document.getElementById('resistanceValue').textContent = this.resistance.toFixed(1);
        
        // Update visual elements based on current
        const intensity = Math.min(this.current / 5, 1); // Normalize to 0-1
        
        // Update arrow color and size based on current
        this.circuit.arrow.material.color.setHSL(0.3, 1, 0.3 + intensity * 0.4);
        this.circuit.arrow.scale.setScalar(0.5 + intensity * 1.5);
        
        // Update battery glow based on voltage
        const voltageIntensity = this.voltage / 24;
        this.circuit.battery.material.emissive.setHSL(0, 1, voltageIntensity * 0.3);
        
        // Update resistor color based on resistance
        const resistanceHue = (1 - this.resistance / 20) * 0.1; // Red to orange
        this.circuit.resistor.material.color.setHSL(resistanceHue, 1, 0.5);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        this.updateParticles();
        
        // Rotate circuit elements slightly for visual appeal
        this.circuit.battery.rotation.y += 0.005;
        this.circuit.resistor.rotation.y += 0.003;
        
        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Initialize simulation
const simulation = new OhmsLawSimulation();

// Handle window resize
window.addEventListener('resize', () => simulation.handleResize());

// Initialize values
simulation.updateValues();
