/**
 * XRScene: Main application class for the BDR-XR WebXR experience.
 * Builds the 3D world (track, water, sky), drone, 2D/VR GUI, MQTT subscription for EEG power,
 * and handles keyboard and XR controller input plus camera modes.
 */
class XRScene {
    constructor() {
        // Resolve the canvas element that Babylon.js will use for WebGL rendering
        this.canvas = document.getElementById("renderCanvas");
        // Create the Babylon engine (WebGL 2/1, antialias enabled) bound to the canvas
        this.engine = new BABYLON.Engine(this.canvas, true);

        // Build the scene: camera, lights, drone, environment (sky, ground, track, water), and 2D GUI
        this.createScene();

        // Run the render loop: each frame calls scene.render() to draw the 3D scene
        this.engine.runRenderLoop(() => {
            this.scene.render();
        });

        // When the window is resized, tell the engine to update the canvas size and aspect ratio
        window.addEventListener("resize", () => {
            this.engine.resize();
        });

        // Set up WebXR (VR) support: default XR experience, VR UI panel, and controller input
        this.initializeXR();
        // Connect to MQTT broker and subscribe for EEG power values; updates nudge button label
        this.initializeMQTT();
    }

    /**
     * Connects to the MQTT broker (HiveMQ Cloud) and subscribes to the connector topic.
     * Incoming messages are expected to be JSON with processedData.powerValue; that value
     * is stored in this.latestPowerValue and reflected on the VR nudge button text.
     */
    initializeMQTT() {
        // Broker connection settings for browser (WSS); must match connector/backend broker
        const brokerConfig = {
            protocol: 'wss',
            hostname: '21c4029e653247699764b7b976972f4f.s1.eu.hivemq.cloud',
            port: 8884,
            username: 'bdrXR1crimson',
            password: 'bdrXR1crimson',
            // Unique client ID per tab/session to avoid broker rejecting duplicate IDs
            clientId: 'eeg_reader_' + Math.random().toString(16).substr(2, 8)
        };

        // Topic on which the external EEG connector publishes processed data (e.g. power value)
        const topic = 'bdrxr/connectorToWeb';

        // Build WebSocket URL; HiveMQ Cloud expects path /mqtt for MQTT over WSS
        const url = `${brokerConfig.protocol}://${brokerConfig.hostname}/mqtt`;
        this.mqttClient = mqtt.connect(url, {
            username: brokerConfig.username,
            password: brokerConfig.password,
            clientId: brokerConfig.clientId,
            port: brokerConfig.port,
            protocol: brokerConfig.protocol
        });
        // Default power value shown until first MQTT message arrives
        this.latestPowerValue = "0.000";

        // When connected to the broker, subscribe to the connector topic
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

        // For each message on the topic: parse JSON and update latestPowerValue and VR nudge button
        this.mqttClient.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                if (data.processedData && data.processedData.powerValue) {
                    this.latestPowerValue = data.processedData.powerValue;
                    console.log(`Power Value: ${this.latestPowerValue}%`);
                    if (this.nudgeButton) {
                        this.nudgeButton.text = `Power: ${this.latestPowerValue}%`;
                    }
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        });

        this.mqttClient.on('error', (error) => {
            console.error('MQTT Error:', error);
        });
        this.mqttClient.on('close', () => {
            console.log('Disconnected from MQTT broker');
        });
        this.mqttClient.on('reconnect', () => {
            console.log('Reconnecting to MQTT broker...');
        });
    }

    /**
     * Creates the main Babylon scene: camera, lights, drone, skybox, ground, track, water, finish line.
     * Also sets initial camera position and registers keyboard controls via setupDroneControls.
     */
    async createScene() {
        this.scene = new BABYLON.Scene(this.engine);

        // World dimensions used by track, boundaries, camera, and drone placement
        this.trackWidth = 10;
        this.trackLength = 100;
        this.trackHeight = 0.3;
        this.waterLevel = -1;
        this.trackElevation = 10;

        // FreeCamera for desktop: orbit/look with mouse; position and target set below
        this.camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 5, -10), this.scene);
        this.camera.setTarget(BABYLON.Vector3.Zero());
        this.camera.attachControl(this.canvas, true);
        // Disable keyboard movement so only drone moves via arrow keys
        this.camera.inputs.removeByType("FreeCameraKeyboardMoveInput");

        // Single hemispheric light for basic shading (direction from above)
        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 1.0;

        this.createDrone();

        // 0 = stationary, 1 = follow drone, 2 = side view; used by GUI and setupDroneControls
        this.cameraMode = 0;
        this.originalCameraPosition = this.camera.position.clone();
        this.originalCameraTarget = new BABYLON.Vector3(0, this.trackElevation + 2.0, this.trackLength/2);

        this.createGUI();
        this.setupDroneControls();

        // Large box with cubemap texture to simulate sky (no geometry culling on inside)
        const skybox = BABYLON.MeshBuilder.CreateBox("skyBox", { size: 1000.0 }, this.scene);
        const skyboxMaterial = new BABYLON.StandardMaterial("skyBox", this.scene);
        skyboxMaterial.backFaceCulling = false;
        skyboxMaterial.reflectionTexture = new BABYLON.CubeTexture("https://playground.babylonjs.com/textures/TropicalSunnyDay", this.scene);
        skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;
        skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
        skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        skyboxMaterial.disableLighting = true;
        skybox.material = skyboxMaterial;

        // Ground plane below the water; used in reflections and as visual base
        const groundMaterial = new BABYLON.StandardMaterial("groundMaterial", this.scene);
        groundMaterial.diffuseTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/ground.jpg", this.scene);
        groundMaterial.diffuseTexture.uScale = 4;
        groundMaterial.diffuseTexture.vScale = 4;

        const ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: 512,
            height: 512,
            subdivisions: 32
        }, this.scene);
        ground.position.y = this.waterLevel - 1;
        ground.material = groundMaterial;

        // Floating racetrack platform (box) at trackElevation; also used as XR floor mesh
        const track = BABYLON.MeshBuilder.CreateBox("track", {
            width: this.trackWidth,
            height: this.trackHeight,
            depth: this.trackLength
        }, this.scene);
        track.position.y = this.trackElevation;

        const trackMaterial = new BABYLON.StandardMaterial("trackMaterial", this.scene);
        trackMaterial.diffuseTexture = new BABYLON.Texture("assets/floor.png", this.scene);
        trackMaterial.diffuseTexture.uScale = 10;
        trackMaterial.diffuseTexture.vScale = 100;
        trackMaterial.bumpTexture = new BABYLON.Texture("assets/floor_bump.PNG", this.scene);
        trackMaterial.bumpTexture.uScale = 10;
        trackMaterial.bumpTexture.vScale = 100;
        trackMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        trackMaterial.specularPower = 64;
        trackMaterial.useParallax = true;
        trackMaterial.useParallaxOcclusion = true;
        trackMaterial.parallaxScaleBias = 0.1;
        track.material = trackMaterial;

        // Two thin strips (left/right) on the track to suggest lane boundaries
        const lineWidth = 0.3;
        const leftLine = BABYLON.MeshBuilder.CreateGround("leftLine", {
            width: lineWidth,
            height: this.trackLength
        }, this.scene);
        leftLine.position.x = -this.trackWidth/4;
        leftLine.position.y = this.trackElevation + this.trackHeight/2 + 0.01;

        const rightLine = BABYLON.MeshBuilder.CreateGround("rightLine", {
            width: lineWidth,
            height: this.trackLength
        }, this.scene);
        rightLine.position.x = this.trackWidth/4;
        rightLine.position.y = this.trackElevation + this.trackHeight/2 + 0.01;

        const lineMaterial = new BABYLON.StandardMaterial("lineMaterial", this.scene);
        lineMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        lineMaterial.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5); // Add some glow
        lineMaterial.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        leftLine.material = lineMaterial;
        rightLine.material = lineMaterial;

        // Water plane at waterLevel; uses WaterMaterial for animated waves and reflections
        const waterMesh = BABYLON.MeshBuilder.CreateGround("waterMesh", {
            width: 512,
            height: 512,
            subdivisions: 64
        }, this.scene);
        waterMesh.position.y = this.waterLevel;

        const water = new BABYLON.WaterMaterial("water", this.scene);
        water.windForce = -15;
        water.waveHeight = 0.5;
        water.windDirection = new BABYLON.Vector2(1, 1);
        water.waterColor = new BABYLON.Color3(0, 0.3, 0.5);
        water.colorBlendFactor = 0.1;
        water.waveLength = 0.005;
        water.waveSpeed = 40.0;
        water.bumpHeight = 0.001;
        water.waveCount = 80;
        water.addToRenderList(skybox);
        water.addToRenderList(track);
        water.addToRenderList(leftLine);
        water.addToRenderList(rightLine);
        water.addToRenderList(ground);
        waterMesh.material = water;

        // Initial camera: centered on track, looking down the length; height above track
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

        this.camera.upperBetaLimit = Math.PI / 2;
        this.camera.lowerBetaLimit = -Math.PI / 2;

        // Finish line mesh: goal position; drone movement is clamped to this Z
        const finishLine = BABYLON.MeshBuilder.CreateGround("finishLine", {
            width: this.trackWidth,
            height: 0.5
        }, this.scene);
        
        // Position it near the end of the track
        finishLine.position.x = 0;
        finishLine.position.y = this.trackElevation + this.trackHeight/2 + 0.01;
        finishLine.position.z = this.trackLength/2 - 2;
        const finishLineMaterial = new BABYLON.StandardMaterial("finishLineMaterial", this.scene);
        finishLineMaterial.diffuseColor = new BABYLON.Color3(1, 0, 0);
        finishLineMaterial.emissiveColor = new BABYLON.Color3(0.5, 0, 0); // Add glow effect
        finishLineMaterial.alpha = 0.8;
        finishLine.material = finishLineMaterial;
    }

    /**
     * Builds the drone: a TransformNode with body box, four arms, and four propeller cylinders.
     * All parts are parented to droneContainer so moving the container moves the whole drone.
     * Initial position is near the start of the track; initialDronePosition used for reset.
     */
    createDrone() {
        this.droneContainer = new BABYLON.TransformNode("droneContainer", this.scene);
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
        this.drone = this.droneContainer;
    }

    /**
     * Creates the 2D overlay GUI (desktop): fullscreen texture with a horizontal strip of buttons
     * at the bottom-left. Buttons: Change View (cycle camera mode), Lift-Off/Land, Reset Position.
     */
    createGUI() {
        const advancedTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");
        const stackPanel = new BABYLON.GUI.StackPanel();
        stackPanel.isVertical = false;
        stackPanel.height = "40px";
        stackPanel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        stackPanel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        stackPanel.left = "20px";
        stackPanel.top = "-20px";
        advancedTexture.addControl(stackPanel);

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
        this.flightButton = flightButton;

        viewButton.onPointerClickObservable.add(() => {
            this.cameraMode = (this.cameraMode + 1) % 3;
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

    /**
     * Sets up WebXR: default XR experience with track as floor, VR 3D UI panel, and per-frame
     * camera follow. On enter VR, camera mode is forced to follow and a before-render observer
     * moves the XR camera (or keeps it stationary when mode 0). On exit, camera mode is restored.
     */
    async initializeXR() {
        try {
            const xrHelper = await this.scene.createDefaultXRExperienceAsync({
                floorMeshes: [this.scene.getMeshByName("track")]
            });
            this.createVRUI(xrHelper);

            xrHelper.baseExperience.onStateChangedObservable.add((state) => {
                if (state === BABYLON.WebXRState.IN_XR) {
                    this.previousCameraMode = this.cameraMode;
                    this.cameraMode = 1;
                    const followDistance = 5;
                    const followHeight = 2;
                    xrHelper.baseExperience.camera.position = new BABYLON.Vector3(
                        this.drone.position.x,
                        this.drone.position.y + followHeight,
                        this.drone.position.z - followDistance
                    );
                    if (!this.xrCameraFollow) {
                        this.xrCameraFollow = this.scene.onBeforeRenderObservable.add(() => {
                            if (xrHelper.baseExperience.state === BABYLON.WebXRState.IN_XR) {
                                const followDistance = 5;
                                const followHeight = 2;
                                let targetPosition;
                                switch (this.cameraMode) {
                                    case 0:
                                        targetPosition = new BABYLON.Vector3(
                                            0,
                                            this.trackElevation + followHeight,
                                            -this.trackLength/2 + 4
                                        );
                                        break;
                                    case 1:
                                    default:
                                        targetPosition = new BABYLON.Vector3(
                                            this.drone.position.x,
                                            this.drone.position.y + followHeight,
                                            this.drone.position.z - followDistance
                                        );
                                        break;
                                }
                                xrHelper.baseExperience.camera.position = BABYLON.Vector3.Lerp(
                                    xrHelper.baseExperience.camera.position,
                                    targetPosition,
                                    0.05
                                );
                            }
                        });
                    }
                } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
                    if (this.previousCameraMode !== undefined) {
                        this.cameraMode = this.previousCameraMode;
                    }
                    if (this.xrCameraFollow) {
                        this.scene.onBeforeRenderObservable.remove(this.xrCameraFollow);
                        this.xrCameraFollow = null;
                    }
                }
            });
            this.setupXRControllers(xrHelper);
        } catch (error) {
            console.log("XR not available:", error);
        }
    }

    /**
     * Creates the VR 3D UI: a plane panel with holographic buttons (View, Lift-Off, Reset, Nudge).
     * Panel position is updated each frame to follow the XR camera with panelOffset. Q/A, W/S, E/D
     * adjust panelOffset for layout tuning. Nudge button shows latest MQTT power and triggers a
     * short forward burst (accel then decel) when pressed while flying.
     */
    createVRUI(xrHelper) {
        this.panelOffset = { x: 0.80, y: -0.90, z: 1.20 };
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

        const manager = new BABYLON.GUI.GUI3DManager(this.scene);
        const panel = new BABYLON.GUI.PlanePanel();
        manager.addControl(panel);
        panel.margin = 0.01;
        panel.scaling = new BABYLON.Vector3(0.25, 0.25, 0.25);

        const viewButton = new BABYLON.GUI.HolographicButton("viewButton");
        panel.addControl(viewButton);
        viewButton.text = "Change View";

        const flightButton = new BABYLON.GUI.HolographicButton("flightButton");
        panel.addControl(flightButton);
        flightButton.text = "Lift-Off";

        const resetButton = new BABYLON.GUI.HolographicButton("resetButton");
        panel.addControl(resetButton);
        resetButton.text = "Reset";
        const nudgeButton = new BABYLON.GUI.HolographicButton("nudgeButton");
        panel.addControl(nudgeButton);
        nudgeButton.text = "Power: 0.000%";
        this.nudgeButton = nudgeButton;

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
                panel.position = new BABYLON.Vector3(
                    camera.position.x + this.panelOffset.x,
                    camera.position.y + this.panelOffset.y,
                    camera.position.z + this.panelOffset.z
                );
            }
        });
    }

    /**
     * Binds XR controller thumbsticks to drone movement when flying: left stick = forward/back
     * and strafe, right stick = up/down. Velocities are smoothed and clamped to track boundaries.
     * Default Babylon controller movement/rotation is disabled so we drive the drone only.
     */
    setupXRControllers(xrHelper) {
        this.xrVelocity = { x: 0, y: 0, z: 0 };
        const maxSpeed = 0.5;
        const maxTilt = 0.2;
        const finishLinePosition = this.trackLength/2 - 2;
        const startPosition = -this.trackLength/2;
        this.leftController = null;
        this.rightController = null;

        xrHelper.baseExperience.camera.checkCollisions = false;
        xrHelper.input.xrCamera.checkCollisions = false;
        xrHelper.input.onControllerAddedObservable.add((controller) => {
            controller.onMotionControllerInitObservable.add((motionController) => {
                console.log(`XR Controller ${motionController.handedness} initialized`);
                if (motionController.handedness === 'left') {
                    this.leftController = controller;
                } else if (motionController.handedness === 'right') {
                    this.rightController = controller;
                }
                const thumbstick = motionController.getComponent("thumbstick");
                if (thumbstick) {
                    thumbstick.onAxisValueChangedObservable.clear();
                    controller.onAxisValueChangedObservable.clear();
                }
            });
        });

        this.scene.onBeforeRenderObservable.add(() => {
            if (!this.isFlying || !this.drone) return;
            try {
                if (this.leftController?.motionController) {
                    const leftStick = this.leftController.motionController.getComponent("thumbstick");
                    if (leftStick) {
                        this.xrVelocity.z = BABYLON.Scalar.Lerp(
                            this.xrVelocity.z,
                            -leftStick.axes.y * maxSpeed,
                            0.1
                        );
                        this.xrVelocity.x = BABYLON.Scalar.Lerp(
                            this.xrVelocity.x,
                            leftStick.axes.x * maxSpeed,
                            0.1
                        );
                        this.drone.rotation.x = maxTilt * (this.xrVelocity.z / maxSpeed);
                        this.drone.rotation.z = -maxTilt * (this.xrVelocity.x / maxSpeed);
                    }
                }
                if (this.rightController?.motionController) {
                    const rightStick = this.rightController.motionController.getComponent("thumbstick");
                    if (rightStick) {
                        this.xrVelocity.y = BABYLON.Scalar.Lerp(
                            this.xrVelocity.y,
                            -rightStick.axes.y * maxSpeed * 0.5,
                            0.1
                        );
                    }
                }
                this.drone.position.x += this.xrVelocity.x;
                this.drone.position.y += this.xrVelocity.y;
                this.drone.position.z += this.xrVelocity.z;
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

    /**
     * Registers the main per-frame logic: takeoff/landing animation, keyboard movement (arrows,
     * PageUp/PageDown), track boundaries, camera follow (or sceneRoot in VR), propeller spin,
     * and in VR parenting of meshes to sceneRoot so the world moves with follow camera.
     */
    setupDroneControls() {
        const maxSpeed = 0.5;
        const acceleration = 0.005;
        const deceleration = 0.050;
        const rotationSpeed = 0.05;
        const maxTilt = 0.2;
        const followDistance = 5;
        const followHeight = 2;
        const sideViewDistance = 8;
        const finishLinePosition = this.trackLength/2 - 2;
        const startPosition = -this.trackLength/2;
        const keysPressed = {};
        const velocity = { x: 0, y: 0, z: 0 };

        window.addEventListener("keydown", (e) => {
            keysPressed[e.key] = true;
        });
        window.addEventListener("keyup", (e) => {
            keysPressed[e.key] = false;
        });

        const maxTakeoffSpeed = 0.1;
        const minTakeoffSpeed = 0.01;  // Minimum speed for smooth final approach
        const takeoffAcceleration = 0.002;
        const takeoffDeceleration = 0.003;  // For smooth slowdown
        let verticalTransitionVelocity = 0;
        const targetLandingHeight = this.trackElevation + this.trackHeight/2 + 0.2;
        const hoverHeight = this.flyingHeight;
        this.sceneRoot = new BABYLON.TransformNode("sceneRoot", this.scene);

        this.scene.registerBeforeRender(() => {
            if (!this.drone) return;

            if (this.isFlying && this.drone.position.y < hoverHeight) {
                const heightDifference = hoverHeight - this.drone.position.y;
                const distanceFactor = Math.min(heightDifference / 2, 1);
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
                    const wobbleFactor = Math.min(distanceFactor, 0.5);
                    this.drone.rotation.x = (Math.random() - 0.5) * 0.05 * wobbleFactor;
                    this.drone.rotation.z = (Math.random() - 0.5) * 0.05 * wobbleFactor;
                }
            } else if (!this.isFlying && this.drone.position.y > targetLandingHeight) {
                const heightDifference = this.drone.position.y - targetLandingHeight;
                const distanceFactor = Math.min(heightDifference / 2, 1);
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
                    const wobbleFactor = Math.min(distanceFactor, 0.5);
                    this.drone.rotation.x = (Math.random() - 0.5) * 0.03 * wobbleFactor;
                    this.drone.rotation.z = (Math.random() - 0.5) * 0.03 * wobbleFactor;
                }
            } else {
                verticalTransitionVelocity = 0;
                if (!this.isFlying && this.drone.position.y <= targetLandingHeight + 0.01) {
                    this.drone.rotation.x = 0;
                    this.drone.rotation.z = 0;
                }
            }
            const isTransitioning =
                (this.isFlying && this.drone.position.y < hoverHeight - 0.01) ||
                (!this.isFlying && this.drone.position.y > targetLandingHeight + 0.01);

            if (this.isFlying) {
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
                this.drone.position.x += velocity.x;
                this.drone.position.y += velocity.y;
                this.drone.position.z += velocity.z;
                if (this.drone.position.z > finishLinePosition) {
                    this.drone.position.z = finishLinePosition;
                    velocity.z = 0;
                }
                if (this.drone.position.z < startPosition) {
                    this.drone.position.z = startPosition;
                    velocity.z = 0;
                }
                const sideLimit = this.trackWidth/2 - 0.4;
                if (Math.abs(this.drone.position.x) > sideLimit) {
                    this.drone.position.x = Math.sign(this.drone.position.x) * sideLimit;
                    velocity.x = 0;
                }
            }
            if (this.cameraMode === 1) {
                if (this.scene.activeCamera.inputSource?.xrInput) {
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
            else if (this.cameraMode === 2) {
                if (this.scene.activeCamera.inputSource?.xrInput) {
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
            for (let i = 0; i < 4; i++) {
                const propeller = this.scene.getMeshByName(`propeller${i}`);
                let baseSpeed = 0.2;
                if (this.isFlying) {
                    if (isTransitioning) {
                        baseSpeed = 0.4;
                    } else {
                        baseSpeed = 0.2 + (Math.abs(velocity.x) + Math.abs(velocity.y) + Math.abs(velocity.z)) * 0.2;
                    }
                } else {
                    if (isTransitioning) {
                        baseSpeed = 0.3 * (this.drone.position.y - targetLandingHeight) / (hoverHeight - targetLandingHeight);
                    } else {
                        baseSpeed = 0;
                    }
                }
                propeller.rotation.y += baseSpeed;
            }
            const isInXR = this.scene.activeCamera?.inputSource?.xrInput;
            if (isInXR) {
                this.scene.meshes.forEach(mesh => {
                    if (mesh.name !== "camera" &&
                        !mesh.parent && 
                        !mesh.name.includes("drone") && 
                        !mesh.name.includes("propeller") && 
                        !mesh.name.includes("arm")) {
                        mesh.parent = this.sceneRoot;
                    }
                });
                if (this.droneContainer && !this.droneContainer.parent) {
                    this.droneContainer.parent = this.sceneRoot;
                }
            } else {
                this.scene.meshes.forEach(mesh => {
                    if (mesh.parent === this.sceneRoot) {
                        mesh.parent = null;
                    }
                });
                if (this.droneContainer && this.droneContainer.parent === this.sceneRoot) {
                    this.droneContainer.parent = null;
                }
                this.sceneRoot.position = BABYLON.Vector3.Zero();
            }
        });
    }
}

// Bootstrap: once the DOM is ready, create the single XRScene instance (canvas, engine, scene, XR, MQTT).
window.addEventListener("DOMContentLoaded", () => {
    new XRScene();
}); 