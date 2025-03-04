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
        this.camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 1.6, -3), this.scene);
        this.camera.setTarget(BABYLON.Vector3.Zero());
        this.camera.attachControl(this.canvas, true);

        // Add lights
        const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), this.scene);
        light.intensity = 0.7;

        // Create room
        const roomWidth = 10;
        const roomLength = 30;
        const roomHeight = 4;

        // Floor (racetrack)
        const floor = BABYLON.MeshBuilder.CreateGround("floor", {
            width: roomWidth,
            height: roomLength
        }, this.scene);
        
        // Apply racetrack material
        const trackMaterial = new BABYLON.StandardMaterial("trackMaterial", this.scene);
        trackMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Dark gray for asphalt
        floor.material = trackMaterial;

        // Add racing lines
        const lineWidth = 0.3;
        const leftLine = BABYLON.MeshBuilder.CreateGround("leftLine", {
            width: lineWidth,
            height: roomLength
        }, this.scene);
        leftLine.position.x = -roomWidth/4;
        leftLine.position.y = 0.01; // Slightly above floor to prevent z-fighting

        const rightLine = BABYLON.MeshBuilder.CreateGround("rightLine", {
            width: lineWidth,
            height: roomLength
        }, this.scene);
        rightLine.position.x = roomWidth/4;
        rightLine.position.y = 0.01;

        // White material for lines
        const lineMaterial = new BABYLON.StandardMaterial("lineMaterial", this.scene);
        lineMaterial.diffuseColor = new BABYLON.Color3(1, 1, 1);
        leftLine.material = lineMaterial;
        rightLine.material = lineMaterial;

        // Create walls
        const wallMaterial = new BABYLON.StandardMaterial("wallMaterial", this.scene);
        wallMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.9); // Light blue-gray

        // Left wall
        const leftWall = BABYLON.MeshBuilder.CreatePlane("leftWall", {
            width: roomLength,
            height: roomHeight
        }, this.scene);
        leftWall.position = new BABYLON.Vector3(-roomWidth/2, roomHeight/2, roomLength/2 - roomLength/2);
        leftWall.rotation.y = Math.PI/2;
        leftWall.material = wallMaterial;

        // Right wall
        const rightWall = BABYLON.MeshBuilder.CreatePlane("rightWall", {
            width: roomLength,
            height: roomHeight
        }, this.scene);
        rightWall.position = new BABYLON.Vector3(roomWidth/2, roomHeight/2, roomLength/2 - roomLength/2);
        rightWall.rotation.y = -Math.PI/2;
        rightWall.material = wallMaterial;

        // Front wall
        const frontWall = BABYLON.MeshBuilder.CreatePlane("frontWall", {
            width: roomWidth,
            height: roomHeight
        }, this.scene);
        frontWall.position = new BABYLON.Vector3(0, roomHeight/2, roomLength - roomLength/2);
        frontWall.rotation.y = Math.PI;
        frontWall.material = wallMaterial;

        // Back wall
        const backWall = BABYLON.MeshBuilder.CreatePlane("backWall", {
            width: roomWidth,
            height: roomHeight
        }, this.scene);
        backWall.position = new BABYLON.Vector3(0, roomHeight/2, -roomLength/2);
        backWall.material = wallMaterial;

        // Ceiling
        const ceiling = BABYLON.MeshBuilder.CreatePlane("ceiling", {
            width: roomWidth,
            height: roomLength
        }, this.scene);
        ceiling.position = new BABYLON.Vector3(0, roomHeight, 0);
        ceiling.rotation.x = Math.PI/2;
        ceiling.material = wallMaterial;

        // Adjust camera position to better starting point
        this.camera.position = new BABYLON.Vector3(0, 1.6, -roomLength/2 + 2);
    }

    async initializeXR() {
        try {
            // Check if XR is available
            const xrHelper = await this.scene.createDefaultXRExperienceAsync({
                floorMeshes: [this.scene.getMeshByName("floor")]
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