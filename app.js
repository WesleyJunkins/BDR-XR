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

        // Add a ground
        const ground = BABYLON.MeshBuilder.CreateGround("ground", {
            width: 6,
            height: 6
        }, this.scene);

        // Add a simple box
        const box = BABYLON.MeshBuilder.CreateBox("box", {
            size: 0.3
        }, this.scene);
        box.position.y = 0.5;
    }

    async initializeXR() {
        try {
            // Check if XR is available
            const xrHelper = await this.scene.createDefaultXRExperienceAsync({
                floorMeshes: [this.scene.getMeshByName("ground")]
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