class XRScene {
    constructor() {
        // Get the canvas element
        this.canvas = document.getElementById("renderCanvas");
        this.engine = new BABYLON.Engine(this.canvas, true);
        this.xrButton = document.getElementById("xr-button");

        // Create our scene
        this.createScene();

        // Start render loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        // Handle window resize
        window.addEventListener("resize", () => {
            this.engine.resize();
        });

        // Initialize XR support
        this.initializeXR();
    }

    async createScene() {
        // Create a new scene
        this.scene = new BABYLON.Scene(this.engine);

        // Define common dimensions and levels first as class properties
        this.trackWidth = 10;
        this.trackLength = 100;  // Increased from 30 to 100
        this.trackHeight = 0.3;
        this.waterLevel = -1;
        this.trackElevation = 10;

        // Add a camera
        this.camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 5, -10), this.scene);
        this.camera.setTarget(BABYLON.Vector3.Zero());
        this.camera.attachControl(this.canvas, true);
        this.camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

        // Add lights
        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 1.0;

        // Create drone
        this.createDrone();

        // Add camera modes
        this.cameraMode = 0; // 0: stationary, 1: follow, 2: side view
        this.originalCameraPosition = this.camera.position.clone();
        this.originalCameraTarget = new BABYLON.Vector3(0, this.trackElevation + 2.0, this.trackLength/2);

        // Create camera switch button
        this.createViewButton();

        // Add keyboard controls for the drone
        this.setupDroneControls();

        // Create skybox
        const skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, this.scene);
        const skyboxMaterial = new BABYLON.StandardMaterial("skyBox", this.scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.reflectionTexture = new BABYLON.CubeTexture("https://playground.babylonjs.com/textures/TropicalSunnyDay", this.scene);
        skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
        skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
        skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        skyboxMaterial.disableLighting = true;
        skybox.material = skyboxMaterial;

        // Create textured ground underneath water
        const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", this.scene);
        groundMaterial.diffuseTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/ground.jpg", this.scene);
        groundMaterial.diffuseTexture.uScale = 4;
        groundMaterial.diffuseTexture.vScale = 4;

        const ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: 512,
            height: 512,
            subdivisions: 32
        }, this.scene);
        ground.position.y = this.waterLevel - 1; // Position it just below water level
        ground.material = groundMaterial;

        // Create floating platform (racetrack)
        const track = BABYLON.MeshBuilder.CreateBox("track", {
            width: this.trackWidth,
            height: this.trackHeight,
            depth: this.trackLength
        }, this.scene);
        track.position.y = this.trackElevation;

        // Create and configure track material with asphalt texture
        const trackMaterial = new BABYLON.StandardMaterial("trackMaterial", this.scene);

        // Add floor texture
        trackMaterial.diffuseTexture = new BABYLON.Texture("assets/floor.jpg", this.scene);
        trackMaterial.diffuseTexture.uScale = 4;  // Adjust texture tiling on width
        trackMaterial.diffuseTexture.vScale = 40; // Adjust texture tiling on length

        // Add bump texture for more realism
        trackMaterial.bumpTexture = new BABYLON.Texture("assets/floor_bump.jpg", this.scene);
        trackMaterial.bumpTexture.uScale = 4;
        trackMaterial.bumpTexture.vScale = 40;

        // Adjust material properties
        trackMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Reduce shininess
        trackMaterial.specularPower = 64; // Adjust specular highlight
        trackMaterial.useParallax = true; // Enable parallax mapping for more depth
        trackMaterial.useParallaxOcclusion = true; // Enhanced parallax effect
        trackMaterial.parallaxScaleBias = 0.1; // Adjust parallax effect strength

        track.material = trackMaterial;

        // Add racing lines - adjust their height to match track
        const lineWidth = 0.3;
        const leftLine = BABYLON.MeshBuilder.CreateGround("leftLine", {
            width: lineWidth,
            height: this.trackLength
        }, this.scene);
        leftLine.position.x = -this.trackWidth/4;
        leftLine.position.y = this.trackElevation + this.trackHeight/2 + 0.01; // Adjusted height

        const rightLine = BABYLON.MeshBuilder.CreateGround("rightLine", {
            width: lineWidth,
            height: this.trackLength
        }, this.scene);
        rightLine.position.x = this.trackWidth/4;
        rightLine.position.y = this.trackElevation + this.trackHeight/2 + 0.01; // Adjusted height

        // Make the racing lines more visible
        const lineMaterial = new BABYLON.StandardMaterial("lineMaterial", this.scene);
        lineMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        lineMaterial.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5); // Add some glow
        lineMaterial.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        leftLine.material = lineMaterial;
        rightLine.material = lineMaterial;

        // Create water
        const waterMesh = BABYLON.MeshBuilder.CreateGround("waterMesh", {
            width: 512,
            height: 512,
            subdivisions: 64  // Increased for finer wave detail
        }, this.scene);
        waterMesh.position.y = this.waterLevel;

        const water = new BABYLON.WaterMaterial("water", this.scene);
        
        // Enhanced water properties - more dynamic waves and faster flow
        water.windForce = -15;           // Increased wind force for more movement
        water.waveHeight = 0.5;          // Reduced for finer waves
        water.windDirection = new BABYLON.Vector2(1, 1);
        water.waterColor = new BABYLON.Color3(0, 0.3, 0.5);
        water.colorBlendFactor = 0.1;    // Reduced for more visible waves
        water.waveLength = 0.005;         // Reduced for finer ripples
        water.waveSpeed = 40.0;          // Doubled for faster movement
        water.bumpHeight = 0.001;          // Adjusted for better wave definition
        water.waveCount = 80;            // Doubled for more frequent waves
        
        // Add ground to water reflections
        water.addToRenderList(skybox);
        water.addToRenderList(track);
        water.addToRenderList(leftLine);
        water.addToRenderList(rightLine);
        water.addToRenderList(ground); // Add ground to water reflections

        // Assign the water material
        waterMesh.material = water;

        // Adjust camera position to see more of the longer track
        const cameraHeight = 2.2;
        this.camera.position = new BABYLON.Vector3(
            0,                              // Centered on track
            this.trackElevation + cameraHeight,  // Standing height above track
            -this.trackLength/2 + 4              // Moved back a bit more to see longer track
        );
        this.camera.setTarget(new BABYLON.Vector3(
            0,                      // Looking straight ahead
            this.trackElevation + 2.0,   // Same height as before
            this.trackLength/2           // Looking toward the end of the longer track
        ));

        // Optional: Restrict camera movement for a more controlled experience
        this.camera.upperBetaLimit = Math.PI / 2;    // Limit looking up
        this.camera.lowerBetaLimit = -Math.PI / 2;   // Limit looking down
    }

    createDrone() {
        // Create a parent transform node for the drone
        const drone = new BABYLON.TransformNode("drone", this.scene);
        
        // Create the main body
        const body = BABYLON.MeshBuilder.CreateBox("droneBody", {
            width: 0.8,
            height: 0.2,
            depth: 0.8
        }, this.scene);
        body.parent = drone;

        // Create material for the body
        const bodyMaterial = new BABYLON.StandardMaterial("bodyMaterial", this.scene);
        bodyMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        body.material = bodyMaterial;

        // Create four arms
        const armLength = 0.6;
        const armWidth = 0.1;
        const armHeight = 0.05;

        const armPositions = [
            { x: armLength/2, z: armLength/2 },
            { x: armLength/2, z: -armLength/2 },
            { x: -armLength/2, z: armLength/2 },
            { x: -armLength/2, z: -armLength/2 }
        ];

        armPositions.forEach((pos, index) => {
            const arm = BABYLON.MeshBuilder.CreateBox(`arm${index}`, {
                width: armWidth,
                height: armHeight,
                depth: armWidth
            }, this.scene);
            arm.parent = drone;
            arm.position = new BABYLON.Vector3(pos.x, 0, pos.z);

            // Create propeller
            const propeller = BABYLON.MeshBuilder.CreateCylinder(`propeller${index}`, {
                height: 0.05,
                diameter: 0.3
            }, this.scene);
            propeller.parent = drone;
            propeller.position = new BABYLON.Vector3(pos.x, 0.1, pos.z);

            // Material for propellers
            const propMaterial = new BABYLON.StandardMaterial(`propMaterial${index}`, this.scene);
            propMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
            propeller.material = propMaterial;
        });

        // Position the drone in front of the camera
        const cameraHeight = 2.2;
        drone.position = new BABYLON.Vector3(
            0,                                  // Centered on x-axis
            this.trackElevation + cameraHeight, // Same height as camera view
            -this.trackLength/2 + 8            // A few units in front of camera
        );

        // Add animation to rotate propellers
        this.scene.registerBeforeRender(() => {
            for(let i = 0; i < 4; i++) {
                const propeller = this.scene.getMeshByName(`propeller${i}`);
                propeller.rotation.y += 0.2; // Rotate propellers continuously
            }
        });

        // Store drone reference for later use
        this.drone = drone;
    }

    createViewButton() {
        // Create button element
        const viewButton = document.createElement('button');
        viewButton.textContent = 'Change View (Stationary)';
        viewButton.style.position = 'absolute';
        viewButton.style.bottom = '20px';
        viewButton.style.left = '20px';
        viewButton.style.padding = '10px';
        viewButton.style.zIndex = '1000';
        document.body.appendChild(viewButton);

        // Add click handler
        viewButton.addEventListener('click', () => {
            this.cameraMode = (this.cameraMode + 1) % 3;
            
            // Reset camera controls based on mode
            if (this.cameraMode === 0) { // Stationary
                // Calculate new camera position based on drone's current position
                const cameraHeight = 2.2;
                const cameraOffset = 4; // Distance behind drone
                
                this.camera.position = new BABYLON.Vector3(
                    this.drone.position.x, // Same x as drone
                    this.trackElevation + cameraHeight, // Fixed height
                    this.drone.position.z - cameraOffset // Slightly behind drone
                );
                
                // Look at a point ahead of the drone
                this.camera.setTarget(new BABYLON.Vector3(
                    this.drone.position.x, // Same x as drone
                    this.trackElevation + 2.0, // Fixed height for looking
                    this.drone.position.z + this.trackLength/4 // Look ahead of drone
                ));
                
                this.camera.attachControl(this.canvas, true);
                viewButton.textContent = 'Change View (Stationary)';
            } else {
                this.camera.detachControl(); // Disable manual camera control in follow modes
                if (this.cameraMode === 1) { // Follow behind
                    viewButton.textContent = 'Change View (Follow)';
                } else { // Side view
                    viewButton.textContent = 'Change View (Side)';
                }
            }
        });
    }

    setupDroneControls() {
        // Movement settings
        const maxSpeed = 0.5;
        const acceleration = 0.005;
        const deceleration = 0.050;  // Increased from 0.003 to 0.015 for faster deceleration
        const rotationSpeed = 0.05;
        const maxTilt = 0.2;
        const verticalAcceleration = 0.004;
        const maxVerticalSpeed = 0.15;
        
        // Velocity state
        const velocity = {
            x: 0,
            y: 0,
            z: 0
        };
        
        // Track key states
        const keysPressed = {};
        
        // Handle keydown
        window.addEventListener("keydown", (e) => {
            keysPressed[e.key] = true;
        });
        
        // Handle keyup
        window.addEventListener("keyup", (e) => {
            keysPressed[e.key] = false;
        });
        
        // Add camera follow parameters
        const followDistance = 5;
        const followHeight = 2;
        const sideViewDistance = 8;
        
        // Register frame-by-frame movement
        this.scene.registerBeforeRender(() => {
            if (!this.drone) return;

            // Forward/Backward movement
            if (keysPressed["ArrowUp"]) {
                velocity.z = Math.min(velocity.z + acceleration, maxSpeed);
                this.drone.rotation.x = maxTilt * (velocity.z / maxSpeed); // Changed from negative to positive
            } else if (keysPressed["ArrowDown"]) {
                velocity.z = Math.max(velocity.z - acceleration, -maxSpeed);
                this.drone.rotation.x = maxTilt * (velocity.z / maxSpeed); // Changed from negative to positive
            } else {
                // Decelerate
                if (Math.abs(velocity.z) > 0) {
                    velocity.z *= (1 - deceleration);
                    if (Math.abs(velocity.z) < 0.001) velocity.z = 0;
                    this.drone.rotation.x = maxTilt * (velocity.z / maxSpeed); // Changed from negative to positive
                }
            }

            // Left/Right movement
            if (keysPressed["ArrowLeft"]) {
                velocity.x = Math.max(velocity.x - acceleration, -maxSpeed);
                this.drone.rotation.z = -maxTilt * (velocity.x / maxSpeed); // Proportional bank
            } else if (keysPressed["ArrowRight"]) {
                velocity.x = Math.min(velocity.x + acceleration, maxSpeed);
                this.drone.rotation.z = -maxTilt * (velocity.x / maxSpeed); // Proportional bank
            } else {
                // Decelerate
                if (Math.abs(velocity.x) > 0) {
                    velocity.x *= (1 - deceleration);
                    if (Math.abs(velocity.x) < 0.001) velocity.x = 0;
                    this.drone.rotation.z = -maxTilt * (velocity.x / maxSpeed); // Maintain proportional bank
                }
            }

            // Vertical movement
            if (keysPressed["PageUp"]) {
                velocity.y = Math.min(velocity.y + verticalAcceleration, maxVerticalSpeed);
            } else if (keysPressed["PageDown"]) {
                velocity.y = Math.max(velocity.y - verticalAcceleration, -maxVerticalSpeed);
            } else {
                // Vertical deceleration
                if (Math.abs(velocity.y) > 0) {
                    velocity.y *= (1 - deceleration);
                    if (Math.abs(velocity.y) < 0.001) velocity.y = 0;
                }
            }

            // Apply velocities to position
            this.drone.position.x += velocity.x;
            this.drone.position.y += velocity.y;
            this.drone.position.z += velocity.z;

            // Add camera update logic after applying velocities
            if (this.cameraMode === 1) { // Follow behind
                // Calculate target position behind drone
                const behind = new BABYLON.Vector3(
                    this.drone.position.x,
                    this.drone.position.y + followHeight,
                    this.drone.position.z - followDistance
                );
                
                // Smoothly move camera to position
                this.camera.position = BABYLON.Vector3.Lerp(
                    this.camera.position,
                    behind,
                    0.1
                );
                
                // Look at drone
                this.camera.setTarget(this.drone.position);
            } 
            else if (this.cameraMode === 2) { // Side view
                // Calculate target position to the side of drone
                const side = new BABYLON.Vector3(
                    this.drone.position.x - sideViewDistance,
                    this.drone.position.y + followHeight,
                    this.drone.position.z
                );
                
                // Smoothly move camera to position
                this.camera.position = BABYLON.Vector3.Lerp(
                    this.camera.position,
                    side,
                    0.1
                );
                
                // Look at drone
                this.camera.setTarget(this.drone.position);
            }

            // Adjust propeller speeds based on movement
            const baseRotationSpeed = 0.2;
            const speedFactor = Math.max(
                Math.abs(velocity.x), 
                Math.abs(velocity.y), 
                Math.abs(velocity.z)
            ) / maxSpeed;
            
            for(let i = 0; i < 4; i++) {
                const propeller = this.scene.getMeshByName(`propeller${i}`);
                propeller.rotation.y += baseRotationSpeed + (speedFactor * 0.3);
            }
        });
    }

    async initializeXR() {
        try {
            // Check if XR is available
            const xrHelper = await this.scene.createDefaultXRExperienceAsync({
                floorMeshes: [this.scene.getMeshByName("track")]
            });

            // Enable XR button when available
            this.xrButton.disabled = false;
            
            // Handle XR button click
            this.xrButton.addEventListener("click", () => {
                xrHelper.baseExperience.enterXRAsync("immersive-vr", "local-floor");
            });

            // Update button text based on session state
            xrHelper.baseExperience.onStateChanged.add((state) => {
                if (state === BABYLON.WebXRState.IN_XR) {
                    this.xrButton.textContent = "Exit XR";
                } else {
                    this.xrButton.textContent = "Enter XR";
                }
            });

        } catch (error) {
            console.log("XR not available:", error);
            this.xrButton.textContent = "XR Not Available";
        }
    }
}

// Initialize the XR scene when the window loads
window.addEventListener("DOMContentLoaded", () => {
    new XRScene();
}); 