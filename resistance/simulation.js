import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

class WireResistanceSimulation {
    // Configuration constants
    static CONFIG = {
        WIRE: {
            MIN_LENGTH: 0.5,
            MAX_LENGTH: 3.0,
            MIN_DIAMETER: 1.0,
            MAX_DIAMETER: 5.0,
            DEFAULT_LENGTH: 1.0,
            DEFAULT_DIAMETER: 2.0
        },
        TEMPERATURE: {
            MIN: -50,
            MAX: 200,
            DEFAULT: 20,
            REFERENCE: 20
        },
        ELECTRICAL: {
            MIN_VOLTAGE: 0,
            MAX_VOLTAGE: 12,
            DEFAULT_VOLTAGE: 5.0
        },
        MATERIAL: {
            COPPER: {
                RESISTIVITY: 1.68e-8,
                TEMP_COEFFICIENT: 0.00393
            }
        },
        PARTICLES: {
            COUNT: 50,
            MIN_SPEED: 0.1,
            MAX_SPEED: 3.0
        },
        CAMERA: {
            FOV: 75,
            NEAR: 0.1,
            FAR: 1000,
            POSITION: { x: 0, y: 2, z: 5 }
        }
    };

    constructor() {
        // Add validation for WebGL support
        if (!this.checkWebGLSupport()) {
            throw new Error('WebGL is not supported in your browser');
        }

        // Initialize state with validation
        this.initializeState();
        
        // Remove this line since we'll initialize in the initialize() method
        // this.initializeRenderingComponents();
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.wire = null;
        this.particles = null;
    }

    checkWebGLSupport() {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext && 
            (canvas.getContext('webgl') || canvas.getContext('experimental-web-gl')));
    }

    initializeState() {
        this.state = {
            temperature: this.validateRange(
                WireResistanceSimulation.CONFIG.TEMPERATURE.DEFAULT,
                WireResistanceSimulation.CONFIG.TEMPERATURE.MIN,
                WireResistanceSimulation.CONFIG.TEMPERATURE.MAX
            ),
            voltage: this.validateRange(
                WireResistanceSimulation.CONFIG.ELECTRICAL.DEFAULT_VOLTAGE,
                WireResistanceSimulation.CONFIG.ELECTRICAL.MIN_VOLTAGE,
                WireResistanceSimulation.CONFIG.ELECTRICAL.MAX_VOLTAGE
            ),
            wireLength: this.validateRange(
                WireResistanceSimulation.CONFIG.WIRE.DEFAULT_LENGTH,
                WireResistanceSimulation.CONFIG.WIRE.MIN_LENGTH,
                WireResistanceSimulation.CONFIG.WIRE.MAX_LENGTH
            ),
            wireDiameter: this.validateRange(
                WireResistanceSimulation.CONFIG.WIRE.DEFAULT_DIAMETER,
                WireResistanceSimulation.CONFIG.WIRE.MIN_DIAMETER,
                WireResistanceSimulation.CONFIG.WIRE.MAX_DIAMETER
            ),
            isInitialized: false,
            isRunning: false,
            lastFrameTime: 0,
            frameCount: 0
        };
    }

    validateRange(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    async initialize() {
        try {
            this.initializeScene();
            this.initializeControls();
            this.createWireModel();
            this.createParticles();
            this.setupEventListeners();
            this.state.isInitialized = true;
            
            // Add performance monitoring
            this.initializePerformanceMonitoring();
            
            this.startSimulation();
        } catch (error) {
            this.handleError(error);
            throw error; // Re-throw to prevent partial initialization
        }
    }

    // Add performance monitoring
    initializePerformanceMonitoring() {
        this.stats = {
            fps: 0,
            frameTime: 0,
            particleCount: WireResistanceSimulation.CONFIG.PARTICLES.COUNT
        };

        // Update stats every second
        setInterval(() => {
            this.updatePerformanceStats();
        }, 1000);
    }

    updatePerformanceStats() {
        if (!this.state.isRunning) return;

        const currentTime = performance.now();
        this.stats.fps = this.state.frameCount;
        this.stats.frameTime = (currentTime - this.state.lastFrameTime) / this.state.frameCount;
        
        // Reset counters
        this.state.frameCount = 0;
        this.state.lastFrameTime = currentTime;

        // Adjust particle count based on performance
        this.adjustParticleCount();
    }

    adjustParticleCount() {
        // Add throttling to prevent too frequent updates
        if (!this.lastParticleAdjustTime || 
            performance.now() - this.lastParticleAdjustTime > 1000) { // Only adjust every second
        
            if (this.stats.fps < 30 && this.stats.particleCount > 10) {
                this.stats.particleCount = Math.max(10, this.stats.particleCount - 5);
                this.recreateParticles();
            } else if (this.stats.fps > 55 && 
                       this.stats.particleCount < WireResistanceSimulation.CONFIG.PARTICLES.COUNT) {
                this.stats.particleCount = Math.min(
                    WireResistanceSimulation.CONFIG.PARTICLES.COUNT,
                    this.stats.particleCount + 5
                );
                this.recreateParticles();
            }
        
            this.lastParticleAdjustTime = performance.now();
        }
    }

    initializeScene() {
        const container = document.getElementById('canvas-container');
        if (!container) throw new Error('Canvas container not found');

        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);

        // Camera setup
        const { FOV, NEAR, FAR } = WireResistanceSimulation.CONFIG.CAMERA;
        this.camera = new THREE.PerspectiveCamera(
            FOV,
            container.clientWidth / container.clientHeight,
            NEAR,
            FAR
        );
        this.camera.position.copy(WireResistanceSimulation.CONFIG.CAMERA.POSITION);

        // Renderer setup
        this.renderer = this.createRenderer(container);

        // Lighting
        this.setupLighting();
    }

    createRenderer(container) {
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });

        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        return renderer;
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        const mainLight = new THREE.DirectionalLight(0xffffff, 1);
        mainLight.position.set(5, 5, 5);
        mainLight.castShadow = true;

        // Improve shadow quality
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;

        this.scene.add(ambientLight, mainLight);
    }

    createWireModel() {
        // Create wire geometry
        const wireGeometry = new THREE.CylinderGeometry(
            this.state.wireDiameter * 0.1,
            this.state.wireDiameter * 0.1,
            this.state.wireLength,
            32
        );

        // Create wire material with temperature-dependent color
        const wireMaterial = new THREE.MeshStandardMaterial({
            metalness: 0.8,
            roughness: 0.2,
            emissive: new THREE.Color(0xff0000),
            emissiveIntensity: 0
        });

        this.wire = new THREE.Mesh(wireGeometry, wireMaterial);
        this.wire.castShadow = true;
        this.wire.receiveShadow = true;
        this.scene.add(this.wire);

        this.updateWireAppearance();
    }

    updateWireAppearance() {
        if (!this.wire) return;

        // Update color based on temperature
        const normalizedTemp = (this.state.temperature - WireResistanceSimulation.CONFIG.TEMPERATURE.MIN) /
            (WireResistanceSimulation.CONFIG.TEMPERATURE.MAX - WireResistanceSimulation.CONFIG.TEMPERATURE.MIN);
        
        this.wire.material.emissiveIntensity = Math.max(0, normalizedTemp);
        
        // Update dimensions
        this.wire.scale.set(
            this.state.wireDiameter * 0.1,
            this.state.wireLength,
            this.state.wireDiameter * 0.1
        );
    }

    setupEventListeners() {
        // Temperature control
        const tempSlider = document.getElementById('temperature-slider');
        tempSlider?.addEventListener('input', (e) => {
            this.state.temperature = parseFloat(e.target.value);
            this.updateSimulation();
        });

        // Voltage control
        const voltageSlider = document.getElementById('voltage-slider');
        voltageSlider?.addEventListener('input', (e) => {
            this.state.voltage = parseFloat(e.target.value);
            this.updateSimulation();
        });

        // Wire properties controls
        const lengthSlider = document.getElementById('length-slider');
        lengthSlider?.addEventListener('input', (e) => {
            this.state.wireLength = parseFloat(e.target.value);
            this.updateSimulation();
        });

        const diameterSlider = document.getElementById('diameter-slider');
        diameterSlider?.addEventListener('input', (e) => {
            this.state.wireDiameter = parseFloat(e.target.value);
            this.updateSimulation();
        });

        // Window resize handling
        window.addEventListener('resize', () => this.handleResize());
    }

    updateSimulation() {
        this.updateWireAppearance();
        this.updateCalculations();
        this.updateDisplayValues();
    }

    updateCalculations() {
        // Calculate resistance using temperature coefficient formula
        const { RESISTIVITY, TEMP_COEFFICIENT } = WireResistanceSimulation.CONFIG.MATERIAL.COPPER;
        const tempDiff = this.state.temperature - WireResistanceSimulation.CONFIG.TEMPERATURE.REFERENCE;
        
        // R = ρ * L / A * (1 + α * ΔT)
        const area = Math.PI * Math.pow(this.state.wireDiameter / 2000, 2); // Convert mm to m
        const baseResistance = RESISTIVITY * this.state.wireLength / area;
        const resistance = baseResistance * (1 + TEMP_COEFFICIENT * tempDiff);

        // Calculate current and power
        const current = this.state.voltage / resistance;
        const power = this.state.voltage * current;

        // Update display values
        this.updateReadings(resistance, current, power);
    }

    updateReadings(resistance, current, power) {
        // Update resistance reading
        const resistanceElement = document.getElementById('resistance-reading');
        if (resistanceElement) {
            resistanceElement.textContent = `${resistance.toFixed(3)} Ω`;
        }

        // Update current reading
        const currentElement = document.getElementById('current-reading');
        if (currentElement) {
            currentElement.textContent = `${current.toFixed(1)} A`;
        }

        // Update power reading
        const powerElement = document.getElementById('power-reading');
        if (powerElement) {
            powerElement.textContent = `${power.toFixed(1)} W`;
        }

        // Update status indicator
        this.updateStatusIndicator(current, power);
    }

    updateStatusIndicator(current, power) {
        const statusIndicator = document.getElementById('status-indicator');
        if (!statusIndicator) return;

        let status = 'Normal Operation';
        let color = 'rgba(76, 175, 80, 0.2)';

        if (power > 1000) {
            status = 'High Power Warning';
            color = 'rgba(255, 152, 0, 0.2)';
        }
        if (current > 200) {
            status = 'Overcurrent Warning';
            color = 'rgba(244, 67, 54, 0.2)';
        }

        statusIndicator.textContent = status;
        statusIndicator.style.background = color;
    }

    startSimulation() {
        if (!this.state.isInitialized) return;
        this.state.isRunning = true;
        this.animate();
    }

    // Update the animation loop
    animate(timestamp = 0) {
        if (!this.state.isRunning || !this.state.isInitialized) return;

        const deltaTime = timestamp - this.state.lastFrameTime;
        
        // Skip frame if deltaTime is too high (tab was inactive)
        if (deltaTime > 100) {
            requestAnimationFrame((t) => this.animate(t));
            return;
        }

        try {
            this.updateParticles(deltaTime);
            this.controls?.update();
            this.renderer.render(this.scene, this.camera);
            
            this.state.frameCount++;
            
            requestAnimationFrame((t) => this.animate(t));
        } catch (error) {
            this.handleError(error);
            this.state.isRunning = false;
        }
    }

    createParticles() {
        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = WireResistanceSimulation.CONFIG.PARTICLES.COUNT;
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * this.state.wireLength;
            positions[i3 + 1] = (Math.random() - 0.5) * 0.1;
            positions[i3 + 2] = (Math.random() - 0.5) * 0.1;
            velocities[i] = Math.random() * 0.02 + 0.01;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const particleMaterial = new THREE.PointsMaterial({
            color: 0x00ff00,
            size: 0.05,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(particleGeometry, particleMaterial);
        this.particles.userData.velocities = velocities;
        this.scene.add(this.particles);
    }

    recreateParticles() {
        // Remove existing particles
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }

        // Create new particles with updated count
        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = this.stats.particleCount;
        const positions = new Float32Array(particleCount * 3);
        const velocities = new Float32Array(particleCount);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * this.state.wireLength;
            positions[i3 + 1] = (Math.random() - 0.5) * 0.1;
            positions[i3 + 2] = (Math.random() - 0.5) * 0.1;
            velocities[i] = Math.random() * 0.02 + 0.01;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const particleMaterial = new THREE.PointsMaterial({
            color: 0x00ff00,
            size: 0.05,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(particleGeometry, particleMaterial);
        this.particles.userData.velocities = velocities;
        this.scene.add(this.particles);
    }

    // Update particle system with improved performance
    updateParticles(deltaTime) {
        if (!this.particles || !this.state.isRunning) return;

        const positions = this.particles.geometry.attributes.position;
        const velocities = this.particles.userData.velocities;
        
        // Use local variables for better performance
        const array = positions.array;
        const voltage = this.state.voltage;
        const wireLength = this.state.wireLength;
        const count = positions.count;
        
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            array[i3] += velocities[i] * (voltage / 5) * (deltaTime / 16.67);

            if (array[i3] > wireLength / 2) {
                array[i3] = -wireLength / 2;
                array[i3 + 1] = (Math.random() - 0.5) * 0.1;
                array[i3 + 2] = (Math.random() - 0.5) * 0.1;
            }
        }

        positions.needsUpdate = true;
        
        // Update particle appearance based on current
        const current = voltage / this.calculateResistance();
        this.particles.material.opacity = this.validateRange(current / 10, 0.1, 0.8);
    }

    initializeControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 10;
    }

    calculateResistance() {
        const { RESISTIVITY, TEMP_COEFFICIENT } = WireResistanceSimulation.CONFIG.MATERIAL.COPPER;
        const tempDiff = this.state.temperature - WireResistanceSimulation.CONFIG.TEMPERATURE.REFERENCE;
        const area = Math.PI * Math.pow(this.state.wireDiameter / 2000, 2);
        return RESISTIVITY * this.state.wireLength / area * (1 + TEMP_COEFFICIENT * tempDiff);
    }

    updateDisplayValues() {
        const resistance = this.calculateResistance();
        const current = this.state.voltage / resistance;
        const power = this.state.voltage * current;
        this.updateReadings(resistance, current, power);
    }

    handleResize() {
        if (!this.camera || !this.renderer) return;

        const container = document.getElementById('canvas-container');
        if (!container) return;

        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }

    handleError(error) {
        console.error('Simulation Error:', error);
        
        const errorContainer = document.createElement('div');
        errorContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(244, 67, 54, 0.9);
            padding: 20px;
            border-radius: 10px;
            color: white;
            z-index: 1000;
            font-family: sans-serif;
        `;
        errorContainer.textContent = `Simulation Error: ${error.message}`;
        document.body.appendChild(errorContainer);
    }

    dispose() {
        try {
            this.state.isRunning = false;
            this.state.isInitialized = false;

            // Clean up THREE.js resources
            this.disposeThreeJSResources();
            
            // Remove event listeners
            this.removeEventListeners();
            
            // Clear stats interval
            if (this.statsInterval) {
                clearInterval(this.statsInterval);
            }

        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

export default WireResistanceSimulation;



