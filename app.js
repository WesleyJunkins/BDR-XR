class XRScene {
    constructor() {
        // Get the canvas element
        this.canvas = document.getElementById("renderCanvas");
        this.engine = new BABYLON.Engine(this.canvas, true);

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
        
        // Initialize MQTT client
        this.initializeMQTT();
    }

    // Initialize MQTT client
    initializeMQTT() {
        // MQTT Broker configuration
        const brokerConfig = {
            protocol: 'wss',
            hostname: '21c4029e653247699764b7b976972f4f.s1.eu.hivemq.cloud',
            port: 8884,
            username: 'bdrXR1crimson',
            password: 'bdrXR1crimson',
            clientId: 'eeg_reader_' + Math.random().toString(16).substr(2, 8)
        };

        // Topic to subscribe to
        const topic = 'bdrxr/connectorToWeb';

        // Create MQTT client with full URL and proper configuration
        const url = `${brokerConfig.protocol}://${brokerConfig.hostname}/mqtt`;  // Add /mqtt to the URL
        this.mqttClient = mqtt.connect(url, {
            username: brokerConfig.username,
            password: brokerConfig.password,
            clientId: brokerConfig.clientId,
            port: brokerConfig.port,
            protocol: brokerConfig.protocol
        });
        
        // Store the latest power value
        this.latestPowerValue = "0.000";

        // Handle connection
        this.mqttClient.on('connect', () => {
            console.log('Connected to MQTT broker');
            this.mqttClient.subscribe(topic, (err) => {
                if (!err) {
                    console.log(`Subscribed to topic: ${topic}`);
                } else {
                    console.error('Subscription error:', err);
                }
            });
        });

        // Handle incoming messages
        this.mqttClient.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                
                // Extract power value from the processed data
                if (data.processedData && data.processedData.powerValue) {
                    this.latestPowerValue = data.processedData.powerValue;
                    console.log(`Power Value: ${this.latestPowerValue}%`);
                    
                    // Update the nudge button text if it exists
                    if (this.nudgeButton) {
                        this.nudgeButton.text = `Power: ${this.latestPowerValue}%`;
                    }
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        // Handle errors
        this.mqttClient.on('error', (error) => {
            console.error('MQTT Error:', error);
        });

        // Handle connection close
        this.mqttClient.on('close', () => {
            console.log('Disconnected from MQTT broker');
        });

        // Handle reconnection
        this.mqttClient.on('reconnect', () => {
            console.log('Reconnecting to MQTT broker...');
        });
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

        // Create GUI
        this.createGUI();

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
        trackMaterial.diffuseTexture = new BABYLON.Texture("assets/floor.png", this.scene);
        trackMaterial.diffuseTexture.uScale = 10;  // Increased from 4 to 10 for width
        trackMaterial.diffuseTexture.vScale = 100; // Increased from 40 to 100 for length

        // Add bump texture for more realism
        trackMaterial.bumpTexture = new BABYLON.Texture("assets/floor_bump.PNG", this.scene);
        trackMaterial.bumpTexture.uScale = 10;     // Match the diffuse texture scaling
        trackMaterial.bumpTexture.vScale = 100;    // Match the diffuse texture scaling

        // Adjust material properties
        trackMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        trackMaterial.specularPower = 64;
        trackMaterial.useParallax = true;
        trackMaterial.useParallaxOcclusion = true;
        trackMaterial.parallaxScaleBias = 0.1;

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

        // Add finish line near the end of track
        const finishLine = BABYLON.MeshBuilder.CreateGround("finishLine", {
            width: this.trackWidth,
            height: 0.5
        }, this.scene);
        
        // Position it near the end of the track
        finishLine.position.x = 0;
        finishLine.position.y = this.trackElevation + this.trackHeight/2 + 0.01;
        finishLine.position.z = this.trackLength/2 - 2; // 2 units from the end
        
        // Create red material for finish line
        const finishLineMaterial = new BABYLON.StandardMaterial("finishLineMaterial", this.scene);
        finishLineMaterial.diffuseColor = new BABYLON.Color3(1, 0, 0);
        finishLineMaterial.emissiveColor = new BABYLON.Color3(0.5, 0, 0); // Add glow effect
        finishLineMaterial.alpha = 0.8;
        finishLine.material = finishLineMaterial;
    }

    createDrone() {
        // Create a parent transform node for the drone
        this.droneContainer = new BABYLON.TransformNode("droneContainer", this.scene);
        
        // Create the main body and parent it to the container
        const body = BABYLON.MeshBuilder.CreateBox("droneBody", {
            width: 0.8,
            height: 0.2,
            depth: 0.8
        }, this.scene);
        body.parent = this.droneContainer;

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
            arm.parent = this.droneContainer;
            arm.position = new BABYLON.Vector3(pos.x, 0, pos.z);

            // Create propeller
            const propeller = BABYLON.MeshBuilder.CreateCylinder(`propeller${index}`, {
                height: 0.05,
                diameter: 0.3
            }, this.scene);
            propeller.parent = this.droneContainer;
            propeller.position = new BABYLON.Vector3(pos.x, 0.1, pos.z);

            // Material for propellers
            const propMaterial = new BABYLON.StandardMaterial(`propMaterial${index}`, this.scene);
            propMaterial.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
            propeller.material = propMaterial;
        });

        // Position the drone container on the ground at start
        const cameraHeight = 2.2;
        this.droneContainer.position = new BABYLON.Vector3(
            0,                                  // Centered on x-axis
            this.trackElevation + this.trackHeight/2 + 0.2, // Just above track surface
            -this.trackLength/2 + 8            // A few units in front of camera
        );

        // Store initial position for reset
        this.initialDronePosition = this.droneContainer.position.clone();
        this.flyingHeight = this.trackElevation + cameraHeight;
        this.isFlying = false;

        // Store drone reference for later use
        this.drone = this.droneContainer;
    }

    createGUI() {
        // Create AdvancedDynamicTexture for GUI
        const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

        // Create a horizontal stack panel for buttons
        const stackPanel = new BABYLON.GUI.StackPanel();
        stackPanel.isVertical = false;
        stackPanel.height = "40px";
        stackPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        stackPanel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        stackPanel.left = "20px";
        stackPanel.top = "-20px";
        advancedTexture.addControl(stackPanel);

        // Create View Button
        const viewButton = BABYLON.GUI.Button.CreateSimpleButton("viewButton", "Change View (Stationary)");
        viewButton.width = "180px";
        viewButton.height = "40px";
        viewButton.color = "white";
        viewButton.cornerRadius = 5;
        viewButton.background = "rgba(51, 51, 51, 0.8)";
        viewButton.paddingRight = "10px";
        stackPanel.addControl(viewButton);

        // Create Flight Button
        const flightButton = BABYLON.GUI.Button.CreateSimpleButton("flightButton", "Lift-Off");
        flightButton.width = "120px";
        flightButton.height = "40px";
        flightButton.color = "white";
        flightButton.cornerRadius = 5;
        flightButton.background = "rgba(51, 51, 51, 0.8)";
        flightButton.paddingRight = "10px";
        flightButton.paddingLeft = "10px";
        stackPanel.addControl(flightButton);

        // Create Reset Button
        const resetButton = BABYLON.GUI.Button.CreateSimpleButton("resetButton", "Reset Position");
        resetButton.width = "140px";
        resetButton.height = "40px";
        resetButton.color = "white";
        resetButton.cornerRadius = 5;
        resetButton.background = "rgba(51, 51, 51, 0.8)";
        resetButton.paddingLeft = "10px";
        stackPanel.addControl(resetButton);

        // Store button reference
        this.flightButton = flightButton;

        // Add click handlers
        viewButton.onPointerClickObservable.add(() => {
            this.cameraMode = (this.cameraMode + 1) % 3;
            
            if (this.cameraMode === 0) { // Stationary
                const cameraHeight = 2.2;
                this.camera.position = new BABYLON.Vector3(
                    0,
                    this.trackElevation + cameraHeight,
                    -this.trackLength/2 + 4
                );
                
                this.camera.setTarget(new BABYLON.Vector3(
                    0,
                    this.trackElevation + 2.0,
                    this.trackLength/2
                ));
                
                this.camera.attachControl(this.canvas, true);
                viewButton.textBlock.text = "Change View (Stationary)";
            } else {
                this.camera.detachControl();
                if (this.cameraMode === 1) {
                    viewButton.textBlock.text = "Change View (Follow)";
                } else {
                    viewButton.textBlock.text = "Change View (Side)";
                }
            }
        });

        flightButton.onPointerClickObservable.add(() => {
            if (!this.isFlying) {
                this.isFlying = true;
                flightButton.textBlock.text = "Land";
            } else {
                this.isFlying = false;
                flightButton.textBlock.text = "Lift-Off";
            }
        });

        resetButton.onPointerClickObservable.add(() => {
            this.drone.position = this.initialDronePosition.clone();
            this.isFlying = false;
            flightButton.textBlock.text = "Lift-Off";
            
            if (this.cameraMode === 0) {
                const cameraHeight = 2.2;
                this.camera.position = new BABYLON.Vector3(
                    0,
                    this.trackElevation + cameraHeight,
                    -this.trackLength/2 + 4
                );
                this.camera.setTarget(new BABYLON.Vector3(
                    0,
                    this.trackElevation + 2.0,
                    this.trackLength/2
                ));
            }
        });
    }

    async initializeXR() {
        try {
            // Check if XR is available
            const xrHelper = await this.scene.createDefaultXRExperienceAsync({
                floorMeshes: [this.scene.getMeshByName("track")]
            });

            // Create 3D UI for VR
            this.createVRUI(xrHelper);

            // Handle initial VR camera position and follow behavior
            xrHelper.baseExperience.onStateChangedObservable.add((state) => {
                if (state === BABYLON.WebXRState.IN_XR) {
                    // Store original camera mode to restore when exiting XR
                    this.previousCameraMode = this.cameraMode;
                    
                    // Force follow mode in XR
                    this.cameraMode = 1; // Follow mode
                    
                    // Initial XR camera position behind drone
                    const followDistance = 5;
                    const followHeight = 2;
                    
                    // Position the XR camera behind the drone
                    xrHelper.baseExperience.camera.position = new BABYLON.Vector3(
                        this.drone.position.x,
                        this.drone.position.y + followHeight,
                        this.drone.position.z - followDistance
                    );

                    // Add XR camera follow behavior
                    if (!this.xrCameraFollow) {
                        this.xrCameraFollow = this.scene.onBeforeRenderObservable.add(() => {
                            if (xrHelper.baseExperience.state === BABYLON.WebXRState.IN_XR) {
                                const followDistance = 5;
                                const followHeight = 2;
                                let targetPosition;

                                // Only two modes now: Stationary and Follow
                                switch (this.cameraMode) {
                                    case 0: // Stationary
                                        targetPosition = new BABYLON.Vector3(
                                            0,
                                            this.trackElevation + followHeight,
                                            -this.trackLength/2 + 4
                                        );
                                        break;

                                    case 1: // Follow
                                    default:
                                        // Position behind drone but maintain camera's original rotation
                                        targetPosition = new BABYLON.Vector3(
                                            this.drone.position.x,
                                            this.drone.position.y + followHeight,
                                            this.drone.position.z - followDistance
                                        );
                                        break;
                                }

                                // Smoothly move XR camera to target position
                                xrHelper.baseExperience.camera.position = BABYLON.Vector3.Lerp(
                                    xrHelper.baseExperience.camera.position,
                                    targetPosition,
                                    0.05
                                );

                                // Remove all the look-at and rotation code to allow free head movement
                            }
                        });
                    }
                } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
                    // Restore original camera mode when exiting XR
                    if (this.previousCameraMode !== undefined) {
                        this.cameraMode = this.previousCameraMode;
                    }

                    // Remove XR camera follow behavior
                    if (this.xrCameraFollow) {
                        this.scene.onBeforeRenderObservable.remove(this.xrCameraFollow);
                        this.xrCameraFollow = null;
                    }
                }
            });

            // Set up XR controller input handling
            this.setupXRControllers(xrHelper);

        } catch (error) {
            console.log("XR not available:", error);
        }
    }

    createVRUI(xrHelper) {
        // Add panel position offset that we can adjust
        this.panelOffset = {
            x: 0.80,
            y: -0.90,
            z: 1.20
        };

        // Add keyboard controls for panel position
        window.addEventListener("keydown", (e) => {
            const adjustmentAmount = 0.1;
            switch(e.key.toLowerCase()) {
                case 'q':
                    this.panelOffset.x += adjustmentAmount;
                    console.log(`Panel X offset: ${this.panelOffset.x.toFixed(2)}`);
                    break;
                case 'a':
                    this.panelOffset.x -= adjustmentAmount;
                    console.log(`Panel X offset: ${this.panelOffset.x.toFixed(2)}`);
                    break;
                case 'w':
                    this.panelOffset.y += adjustmentAmount;
                    console.log(`Panel Y offset: ${this.panelOffset.y.toFixed(2)}`);
                    break;
                case 's':
                    this.panelOffset.y -= adjustmentAmount;
                    console.log(`Panel Y offset: ${this.panelOffset.y.toFixed(2)}`);
                    break;
                case 'e':
                    this.panelOffset.z += adjustmentAmount;
                    console.log(`Panel Z offset: ${this.panelOffset.z.toFixed(2)}`);
                    break;
                case 'd':
                    this.panelOffset.z -= adjustmentAmount;
                    console.log(`Panel Z offset: ${this.panelOffset.z.toFixed(2)}`);
                    break;
            }
        });

        // Create a 3D UI panel that follows the user
        const manager = new BABYLON.GUI.GUI3DManager(this.scene);
        const panel = new BABYLON.GUI.PlanePanel();
        manager.addControl(panel);
        panel.margin = 0.01;

        // Initial scaling
        panel.scaling = new BABYLON.Vector3(0.25, 0.25, 0.25);

        // Create VR buttons
        const viewButton = new BABYLON.GUI.HolographicButton("viewButton");
        panel.addControl(viewButton);
        viewButton.text = "Change View";

        const flightButton = new BABYLON.GUI.HolographicButton("flightButton");
        panel.addControl(flightButton);
        flightButton.text = "Lift-Off";

        const resetButton = new BABYLON.GUI.HolographicButton("resetButton");
        panel.addControl(resetButton);
        resetButton.text = "Reset";

        // Add new Nudge Forward button
        const nudgeButton = new BABYLON.GUI.HolographicButton("nudgeButton");
        panel.addControl(nudgeButton);
        nudgeButton.text = "Power: 0.000%";
        
        // Store reference to the nudge button
        this.nudgeButton = nudgeButton;

        // Add click handlers
        viewButton.onPointerUpObservable.add(() => {
            if (xrHelper.baseExperience.state === BABYLON.WebXRState.IN_XR) {
                // In XR mode, only toggle between stationary and follow
                this.cameraMode = (this.cameraMode + 1) % 2; // Toggle between 0 and 1
                viewButton.text = this.cameraMode === 0 ? "View: Stationary" : "View: Follow";
            } else {
                // Regular non-XR mode keeps all three views
                this.cameraMode = (this.cameraMode + 1) % 3;
                if (this.cameraMode === 0) {
                    viewButton.text = "View: Stationary";
                } else if (this.cameraMode === 1) {
                    viewButton.text = "View: Follow";
                } else {
                    viewButton.text = "View: Side";
                }
            }
        });

        flightButton.onPointerUpObservable.add(() => {
            if (!this.isFlying) {
                this.isFlying = true;
                flightButton.text = "Land";
            } else {
                this.isFlying = false;
                flightButton.text = "Lift-Off";
            }
        });

        resetButton.onPointerUpObservable.add(() => {
            this.drone.position = this.initialDronePosition.clone();
            this.isFlying = false;
            flightButton.text = "Lift-Off";
        });

        // Add Nudge Forward button handler
        nudgeButton.onPointerUpObservable.add(() => {
            if (this.drone && this.isFlying) {
                // Initialize or reset nudge state
                this.nudgeState = {
                    velocity: 0,
                    isNudging: true,
                    acceleration: 0.025,
                    deceleration: 0.01,
                    maxVelocity: 0.15,
                    distanceTraveled: 0,
                    targetDistance: 2.0  // Total distance to travel
                };

                // Remove existing observer if it exists
                if (this.nudgeObserver) {
                    this.scene.onBeforeRenderObservable.remove(this.nudgeObserver);
                }

                // Create new observer for the nudge physics
                this.nudgeObserver = this.scene.onBeforeRenderObservable.add(() => {
                    if (!this.nudgeState.isNudging) return;

                    const finishLinePosition = this.trackLength/2 - 2;
                    const currentZ = this.drone.position.z;

                    // Determine if we should start decelerating
                    const shouldDecelerate = this.nudgeState.distanceTraveled >= this.nudgeState.targetDistance/2;

                    if (!shouldDecelerate && this.nudgeState.velocity < this.nudgeState.maxVelocity) {
                        // Acceleration phase
                        this.nudgeState.velocity += this.nudgeState.acceleration;
                        this.drone.rotation.x = Math.min(0.15, this.nudgeState.velocity * 0.5);
                    } else {
                        // Deceleration phase
                        this.nudgeState.velocity = Math.max(0, this.nudgeState.velocity - this.nudgeState.deceleration);
                        this.drone.rotation.x = Math.max(0, this.drone.rotation.x - 0.01);
                    }

                    // Move drone forward if within bounds
                    if (currentZ + this.nudgeState.velocity <= finishLinePosition) {
                        this.drone.position.z += this.nudgeState.velocity;
                        this.nudgeState.distanceTraveled += this.nudgeState.velocity;
                    } else {
                        this.drone.position.z = finishLinePosition;
                        this.nudgeState.isNudging = false;
                    }

                    // Add subtle hovering effect
                    this.drone.position.y += Math.sin(this.scene.getEngine().getDeltaTime() * 0.01) * 0.001;

                    // Stop conditions
                    if (this.nudgeState.velocity < 0.001 || 
                        this.nudgeState.distanceTraveled >= this.nudgeState.targetDistance) {
                        this.nudgeState.isNudging = false;
                        this.nudgeState.velocity = 0;
                        this.drone.rotation.x = 0;
                        
                        // Clean up the observer
                        if (this.nudgeObserver) {
                            this.scene.onBeforeRenderObservable.remove(this.nudgeObserver);
                            this.nudgeObserver = null;
                        }
                    }
                });
            }
        });

        // Update the panel follow behavior to use the offset values
        this.scene.registerBeforeRender(() => {
            if (xrHelper.baseExperience && xrHelper.baseExperience.camera) {
                const camera = xrHelper.baseExperience.camera;
                
                // Set panel position directly with fixed offset from camera
                panel.position = new BABYLON.Vector3(
                    camera.position.x + this.panelOffset.x,
                    camera.position.y + this.panelOffset.y,
                    camera.position.z + this.panelOffset.z
                );
            }
        });
    }

    setupXRControllers(xrHelper) {
        // Store velocities as class properties so they persist between frames
        this.xrVelocity = { x: 0, y: 0, z: 0 };
        const maxSpeed = 0.5;
        const maxTilt = 0.2;
        const finishLinePosition = this.trackLength/2 - 2;
        const startPosition = -this.trackLength/2;

        // Store controller references
        this.leftController = null;
        this.rightController = null;

        // Disable default controller behavior
        xrHelper.baseExperience.camera.checkCollisions = false;
        xrHelper.input.xrCamera.checkCollisions = false;
        
        // Disable default controller movement
        xrHelper.input.onControllerAddedObservable.add((controller) => {
            // Disable default movement/rotation behavior
            controller.onMotionControllerInitObservable.add((motionController) => {
                console.log(`XR Controller ${motionController.handedness} initialized`);
                
                // Store controller reference
                if (motionController.handedness === 'left') {
                    this.leftController = controller;
                } else if (motionController.handedness === 'right') {
                    this.rightController = controller;
                }

                // Disable default thumbstick behavior
                const thumbstick = motionController.getComponent("thumbstick");
                if (thumbstick) {
                    thumbstick.onAxisValueChangedObservable.clear(); // Clear default behaviors
                    controller.onAxisValueChangedObservable.clear(); // Clear controller level behaviors
                }
            });
        });

        // Handle movement in the scene's beforeRender loop
        this.scene.onBeforeRenderObservable.add(() => {
            if (!this.isFlying || !this.drone) return;

            try {
                // Handle left controller for forward/backward and left/right movement
                if (this.leftController?.motionController) {
                    const leftStick = this.leftController.motionController.getComponent("thumbstick");
                    if (leftStick) {
                        // Forward/Backward (Z-axis)
                        this.xrVelocity.z = BABYLON.Scalar.Lerp(
                            this.xrVelocity.z,
                            -leftStick.axes.y * maxSpeed, // Forward/Backward
                            0.1
                        );

                        // Left/Right (X-axis)
                        this.xrVelocity.x = BABYLON.Scalar.Lerp(
                            this.xrVelocity.x,
                            leftStick.axes.x * maxSpeed, // Left/Right
                            0.1
                        );

                        // Update drone tilt
                        this.drone.rotation.x = maxTilt * (this.xrVelocity.z / maxSpeed);
                        this.drone.rotation.z = -maxTilt * (this.xrVelocity.x / maxSpeed);
                    }
                }

                // Handle right controller for up/down movement
                if (this.rightController?.motionController) {
                    const rightStick = this.rightController.motionController.getComponent("thumbstick");
                    if (rightStick) {
                        // Up/Down (Y-axis)
                        this.xrVelocity.y = BABYLON.Scalar.Lerp(
                            this.xrVelocity.y,
                            -rightStick.axes.y * maxSpeed * 0.5,
                            0.1
                        );
                    }
                }

                // Apply movement
                this.drone.position.x += this.xrVelocity.x;
                this.drone.position.y += this.xrVelocity.y;
                this.drone.position.z += this.xrVelocity.z;

                // Apply boundaries
                if (this.drone.position.z > finishLinePosition) {
                    this.drone.position.z = finishLinePosition;
                    this.xrVelocity.z = 0;
                }
                if (this.drone.position.z < startPosition) {
                    this.drone.position.z = startPosition;
                    this.xrVelocity.z = 0;
                }

                const sideLimit = this.trackWidth/2 - 0.4;
                if (Math.abs(this.drone.position.x) > sideLimit) {
                    this.drone.position.x = Math.sign(this.drone.position.x) * sideLimit;
                    this.xrVelocity.x = 0;
                }

            } catch (error) {
                console.warn("XR controller update error:", error);
            }
        });
    }

    setupDroneControls() {
        // Movement settings
        const maxSpeed = 0.5;
        const acceleration = 0.005;
        const deceleration = 0.050;
        const rotationSpeed = 0.05;
        const maxTilt = 0.2;
        
        // Add camera follow parameters
        const followDistance = 5;
        const followHeight = 2;
        const sideViewDistance = 8;
        
        // Add track boundary
        const finishLinePosition = this.trackLength/2 - 2;
        const startPosition = -this.trackLength/2;
        
        // Track key states
        const keysPressed = {};
        const velocity = { x: 0, y: 0, z: 0 };
        
        // Handle keydown
        window.addEventListener("keydown", (e) => {
            keysPressed[e.key] = true;
        });
        
        // Handle keyup
        window.addEventListener("keyup", (e) => {
            keysPressed[e.key] = false;
        });

        // Enhanced vertical transition settings
        const maxTakeoffSpeed = 0.1;
        const minTakeoffSpeed = 0.01;  // Minimum speed for smooth final approach
        const takeoffAcceleration = 0.002;
        const takeoffDeceleration = 0.003;  // For smooth slowdown
        let verticalTransitionVelocity = 0;
        const targetLandingHeight = this.trackElevation + this.trackHeight/2 + 0.2;
        const hoverHeight = this.flyingHeight;
        
        // Create a root node for the entire scene
        this.sceneRoot = new BABYLON.TransformNode("sceneRoot", this.scene);
        
        this.scene.registerBeforeRender(() => {
            if (!this.drone) return;

            // Handle takeoff and landing with smooth acceleration/deceleration
            if (this.isFlying && this.drone.position.y < hoverHeight) {
                // Smooth accelerating takeoff with deceleration near target
                const heightDifference = hoverHeight - this.drone.position.y;
                const distanceFactor = Math.min(heightDifference / 2, 1); // Start slowing down halfway
                const targetSpeed = Math.max(
                    minTakeoffSpeed,
                    Math.min(maxTakeoffSpeed, heightDifference * 0.1) * distanceFactor
                );
                
                if (heightDifference > 0.01) {
                    if (verticalTransitionVelocity < targetSpeed) {
                        verticalTransitionVelocity += takeoffAcceleration;
                    } else if (verticalTransitionVelocity > targetSpeed) {
                        verticalTransitionVelocity -= takeoffDeceleration;
                    }
                    
                    this.drone.position.y += verticalTransitionVelocity;
                    
                    // Reduce wobble as it reaches target
                    const wobbleFactor = Math.min(distanceFactor, 0.5);
                    this.drone.rotation.x = (Math.random() - 0.5) * 0.05 * wobbleFactor;
                    this.drone.rotation.z = (Math.random() - 0.5) * 0.05 * wobbleFactor;
                }
            } else if (!this.isFlying && this.drone.position.y > targetLandingHeight) {
                // Smooth decelerating landing
                const heightDifference = this.drone.position.y - targetLandingHeight;
                const distanceFactor = Math.min(heightDifference / 2, 1); // Start slowing down halfway
                const targetSpeed = Math.max(
                    minTakeoffSpeed,
                    Math.min(maxTakeoffSpeed, heightDifference * 0.1) * distanceFactor
                );
                
                if (heightDifference > 0.01) {
                    if (verticalTransitionVelocity < targetSpeed) {
                        verticalTransitionVelocity += takeoffAcceleration;
                    } else if (verticalTransitionVelocity > targetSpeed) {
                        verticalTransitionVelocity -= takeoffDeceleration;
                    }
                    
                    this.drone.position.y -= verticalTransitionVelocity;
                    
                    // Reduce wobble as it approaches ground
                    const wobbleFactor = Math.min(distanceFactor, 0.5);
                    this.drone.rotation.x = (Math.random() - 0.5) * 0.03 * wobbleFactor;
                    this.drone.rotation.z = (Math.random() - 0.5) * 0.03 * wobbleFactor;
                }
            } else {
                // Reset vertical transition velocity when not transitioning
                verticalTransitionVelocity = 0;
                
                // If landed, ensure drone is level
                if (!this.isFlying && this.drone.position.y <= targetLandingHeight + 0.01) {
                    this.drone.rotation.x = 0;
                    this.drone.rotation.z = 0;
                }
            }

            // Modify the transition check to be more precise
            const isTransitioning = 
                (this.isFlying && this.drone.position.y < hoverHeight - 0.01) || 
                (!this.isFlying && this.drone.position.y > targetLandingHeight + 0.01);

            // Only allow movement controls when flying (remove the transition check)
            if (this.isFlying) {
                // Forward/Backward movement
                if (keysPressed["ArrowUp"]) {
                    velocity.z = Math.min(velocity.z + acceleration, maxSpeed);
                    this.drone.rotation.x = maxTilt * (velocity.z / maxSpeed);
                } else if (keysPressed["ArrowDown"]) {
                    velocity.z = Math.max(velocity.z - acceleration, -maxSpeed);
                    this.drone.rotation.x = maxTilt * (velocity.z / maxSpeed);
                } else {
                    if (Math.abs(velocity.z) > 0) {
                        velocity.z *= (1 - deceleration);
                        if (Math.abs(velocity.z) < 0.001) velocity.z = 0;
                        this.drone.rotation.x = maxTilt * (velocity.z / maxSpeed);
                    }
                }

                // Left/Right movement
                if (keysPressed["ArrowLeft"]) {
                    velocity.x = Math.max(velocity.x - acceleration, -maxSpeed);
                    this.drone.rotation.z = -maxTilt * (velocity.x / maxSpeed);
                } else if (keysPressed["ArrowRight"]) {
                    velocity.x = Math.min(velocity.x + acceleration, maxSpeed);
                    this.drone.rotation.z = -maxTilt * (velocity.x / maxSpeed);
                } else {
                    if (Math.abs(velocity.x) > 0) {
                        velocity.x *= (1 - deceleration);
                        if (Math.abs(velocity.x) < 0.001) velocity.x = 0;
                        this.drone.rotation.z = -maxTilt * (velocity.x / maxSpeed);
                    }
                }

                // Vertical movement
                if (keysPressed["PageUp"]) {
                    velocity.y = Math.min(velocity.y + acceleration, maxSpeed);
                } else if (keysPressed["PageDown"]) {
                    velocity.y = Math.max(velocity.y - acceleration, -maxSpeed);
                } else {
                    if (Math.abs(velocity.y) > 0) {
                        velocity.y *= (1 - deceleration);
                        if (Math.abs(velocity.y) < 0.001) velocity.y = 0;
                    }
                }

                // Apply velocities
                this.drone.position.x += velocity.x;
                this.drone.position.y += velocity.y;
                this.drone.position.z += velocity.z;

                // Check track boundaries
                if (this.drone.position.z > finishLinePosition) {
                    this.drone.position.z = finishLinePosition;
                    velocity.z = 0;
                }
                if (this.drone.position.z < startPosition) {
                    this.drone.position.z = startPosition;
                    velocity.z = 0;
                }

                // Side boundaries
                const sideLimit = this.trackWidth/2 - 0.4;
                if (Math.abs(this.drone.position.x) > sideLimit) {
                    this.drone.position.x = Math.sign(this.drone.position.x) * sideLimit;
                    velocity.x = 0;
                }
            }

            // Camera follow logic - modified for XR
            if (this.cameraMode === 1) { // Follow behind
                if (this.scene.activeCamera.inputSource?.xrInput) {
                    // In VR, move the scene root instead of the camera
                    const targetPosition = new BABYLON.Vector3(
                        -this.drone.absolutePosition.x,
                        -this.drone.absolutePosition.y,
                        -this.drone.absolutePosition.z + followDistance
                    );
                    
                    this.sceneRoot.position = BABYLON.Vector3.Lerp(
                        this.sceneRoot.position,
                        targetPosition,
                        0.1
                    );
                } else {
                    // Regular camera follow for non-VR
                    const behind = new BABYLON.Vector3(
                        this.drone.position.x,
                        this.drone.position.y + followHeight,
                        this.drone.position.z - followDistance
                    );
                    
                    this.camera.position = BABYLON.Vector3.Lerp(
                        this.camera.position,
                        behind,
                        0.1
                    );
                    
                    this.camera.setTarget(this.drone.position);
                }
            } 
            else if (this.cameraMode === 2) { // Side view
                if (this.scene.activeCamera.inputSource?.xrInput) {
                    // In VR, move the scene root instead of the camera
                    const targetPosition = new BABYLON.Vector3(
                        -this.drone.absolutePosition.x + sideViewDistance,
                        -this.drone.absolutePosition.y,
                        -this.drone.absolutePosition.z
                    );
                    
                    this.sceneRoot.position = BABYLON.Vector3.Lerp(
                        this.sceneRoot.position,
                        targetPosition,
                        0.1
                    );
                } else {
                    // Regular side view for non-VR
                    const side = new BABYLON.Vector3(
                        this.drone.position.x - sideViewDistance,
                        this.drone.position.y + followHeight,
                        this.drone.position.z
                    );
                    
                    this.camera.position = BABYLON.Vector3.Lerp(
                        this.camera.position,
                        side,
                        0.1
                    );
                    
                    this.camera.setTarget(this.drone.position);
                }
            }
            else if (this.cameraMode === 0 && this.scene.activeCamera.inputSource?.xrInput) {
                // Reset scene position in stationary mode for VR
                const targetPosition = new BABYLON.Vector3(
                    0,
                    0,
                    0
                );
                
                this.sceneRoot.position = BABYLON.Vector3.Lerp(
                    this.sceneRoot.position,
                    targetPosition,
                    0.1
                );
            }

            // Adjust propeller rotation based on state
            for(let i = 0; i < 4; i++) {
                const propeller = this.scene.getMeshByName(`propeller${i}`);
                let baseSpeed = 0.2;
                
                if (this.isFlying) {
                    if (isTransitioning) {
                        // Faster during takeoff/landing
                        baseSpeed = 0.4;
                    } else {
                        // Normal flying speed plus movement
                        baseSpeed = 0.2 + (Math.abs(velocity.x) + Math.abs(velocity.y) + Math.abs(velocity.z)) * 0.2;
                    }
                } else {
                    if (isTransitioning) {
                        // Slowing down during landing
                        baseSpeed = 0.3 * (this.drone.position.y - targetLandingHeight) / (hoverHeight - targetLandingHeight);
                    } else {
                        // Stopped
                        baseSpeed = 0;
                    }
                }
                
                propeller.rotation.y += baseSpeed;
            }

            // Handle XR mode changes
            const isInXR = this.scene.activeCamera?.inputSource?.xrInput;
            
            if (isInXR) {
                // In XR mode, parent scene objects to scene root
                this.scene.meshes.forEach(mesh => {
                    // Don't parent camera or drone parts
                    if (mesh.name !== "camera" && 
                        !mesh.parent && 
                        !mesh.name.includes("drone") && 
                        !mesh.name.includes("propeller") && 
                        !mesh.name.includes("arm")) {
                        mesh.parent = this.sceneRoot;
                    }
                });
                // Parent the drone container to scene root
                if (this.droneContainer && !this.droneContainer.parent) {
                    this.droneContainer.parent = this.sceneRoot;
                }
            } else {
                // In non-XR mode, unparent everything from scene root
                this.scene.meshes.forEach(mesh => {
                    if (mesh.parent === this.sceneRoot) {
                        mesh.parent = null;
                    }
                });
                // Unparent drone container
                if (this.droneContainer && this.droneContainer.parent === this.sceneRoot) {
                    this.droneContainer.parent = null;
                }
                
                // Reset scene root position
                this.sceneRoot.position = BABYLON.Vector3.Zero();
            }
        });
    }
}

// Initialize the XR scene when the window loads
window.addEventListener("DOMContentLoaded", () => {
    console.log("14");
    new XRScene();
}); 