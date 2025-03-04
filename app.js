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

        // Add a camera
        this.camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 5, -10), this.scene);
        this.camera.setTarget(BABYLON.Vector3.Zero());
        this.camera.attachControl(this.canvas, true);

        // Add lights
        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 1.0;

        // Define common dimensions and levels
        const trackWidth = 10;
        const trackLength = 100;  // Increased from 30 to 100
        const trackHeight = 0.3;
        const waterLevel = -1;
        const trackElevation = 10;

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
        ground.position.y = waterLevel - 1; // Position it just below water level
        ground.material = groundMaterial;

        // Create floating platform (racetrack)
        const track = BABYLON.MeshBuilder.CreateBox("track", {
            width: trackWidth,
            height: trackHeight,
            depth: trackLength
        }, this.scene);
        track.position.y = trackElevation; // Elevated above water

        // Apply racetrack material
        const trackMaterial = new BABYLON.StandardMaterial("trackMaterial", this.scene);
        trackMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Dark gray for asphalt
        track.material = trackMaterial;

        // Add racing lines - adjust their height to match track
        const lineWidth = 0.3;
        const leftLine = BABYLON.MeshBuilder.CreateGround("leftLine", {
            width: lineWidth,
            height: trackLength
        }, this.scene);
        leftLine.position.x = -trackWidth/4;
        leftLine.position.y = trackElevation + trackHeight/2 + 0.01; // Adjusted height

        const rightLine = BABYLON.MeshBuilder.CreateGround("rightLine", {
            width: lineWidth,
            height: trackLength
        }, this.scene);
        rightLine.position.x = trackWidth/4;
        rightLine.position.y = trackElevation + trackHeight/2 + 0.01; // Adjusted height

        // White material for lines
        const lineMaterial = new BABYLON.StandardMaterial("lineMaterial", this.scene);
        lineMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        leftLine.material = lineMaterial;
        rightLine.material = lineMaterial;

        // Create water
        const waterMesh = BABYLON.MeshBuilder.CreateGround("waterMesh", {
            width: 512,
            height: 512,
            subdivisions: 64  // Increased for finer wave detail
        }, this.scene);
        waterMesh.position.y = waterLevel;

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
            trackElevation + cameraHeight,  // Standing height above track
            -trackLength/2 + 4              // Moved back a bit more to see longer track
        );
        this.camera.setTarget(new BABYLON.Vector3(
            0,                      // Looking straight ahead
            trackElevation + 2.0,   // Same height as before
            trackLength/2           // Looking toward the end of the longer track
        ));

        // Optional: Restrict camera movement for a more controlled experience
        this.camera.upperBetaLimit = Math.PI / 2;    // Limit looking up
        this.camera.lowerBetaLimit = -Math.PI / 2;   // Limit looking down
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