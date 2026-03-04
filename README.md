# BDR-XR

## What This Project Does

BDR-XR (Brain-Controlled Drone Racing in XR) is a WebXR application built with Babylon.js. It provides a 3D environment where a user can fly a virtual drone along a floating racetrack over water. The application is designed to integrate with an external EEG (brain-signal) pipeline: it subscribes to an MQTT broker and displays a live "power" value from that pipeline in the VR interface. The same power value can later be used to drive or modulate gameplay (e.g., automatic nudge or throttle).

The project supports two ways to run:

1. **Web app (primary):** Open `index.html` in a browser (or serve the folder with a local server). You get the full 3D scene, drone, desktop and VR UI, and in-browser MQTT. You can fly the drone with the keyboard (desktop) or with VR controller thumbsticks (VR headset).

2. **Standalone MQTT client:** Run `npm start` (or `node mqtt_client.js`) to subscribe to the same MQTT topic and log EEG power values in the terminal. This is useful for testing the data pipeline without the browser.

---

## Project Files and How They Connect

| File | Purpose |
|------|--------|
| **index.html** | Entry point for the web app. Loads Babylon.js (core, loaders, GUI, materials library), the MQTT browser library, `styles.css`, and `app.js` (deferred). Contains a single fullscreen canvas used by Babylon for rendering. |
| **app.js** | Main application logic. Defines the `XRScene` class: creates the Babylon engine and scene, builds the world (sky, ground, track, water, finish line), creates the drone, 2D overlay GUI, and VR 3D UI, connects to MQTT and updates the VR "Power" button label, and sets up WebXR (VR) with camera follow and controller input. Also registers the per-frame logic for takeoff/landing, keyboard and VR stick movement, camera modes, and propeller animation. On `DOMContentLoaded`, a single `XRScene` instance is created. |
| **mqtt_client.js** | Standalone Node.js script. Connects to the same MQTT broker and topic as the web app, parses incoming JSON for `processedData.powerValue`, and logs it. Not loaded by the browser; run separately with Node for testing or logging. |
| **styles.css** | Styles the page: fullscreen canvas and layout for the XR button container. |
| **package.json** | Node project metadata. Declares the `mqtt` dependency and a `start` script that runs `mqtt_client.js`. Used only for the standalone MQTT client. |
| **assets/floor.png** | Diffuse texture for the racetrack surface. |
| **assets/floor_bump.PNG** | Bump texture for the racetrack surface. |

**Data flow:** An external connector (e.g., EEG processing service) publishes JSON messages to the MQTT topic `bdrxr/connectorToWeb`. Expected payload shape: `{ "processedData": { "powerValue": "0.000" } }`. The web app parses this and stores the value in `XRScene.latestPowerValue` and updates the VR "Nudge" button text to `Power: <value>%`. The standalone `mqtt_client.js` only logs the value.

---

## Detailed Walkthrough of the Code

### 1. Entry Point and Engine Setup

- **index.html** loads all scripts and the canvas. The only script that contains application logic is `app.js`, loaded with `defer` so it runs after the DOM is parsed.
- In **app.js**, when the `DOMContentLoaded` event fires, the code creates one instance of `XRScene`.
- **XRScene constructor** obtains the canvas by ID, creates a `BABYLON.Engine` bound to it, then calls `createScene()` to build the 3D world. It starts the engine render loop (each frame calls `this.scene.render()`), adds a window resize listener so the engine updates canvas dimensions, and then calls `initializeXR()` and `initializeMQTT()`.

### 2. MQTT (Browser)

- **initializeMQTT()** in `app.js` sets up the MQTT client used by the web app. It uses the same broker (HiveMQ Cloud over WSS) and topic (`bdrxr/connectorToWeb`) as `mqtt_client.js`. On connect, it subscribes to that topic. On each `message` event, it parses the payload as JSON; if `data.processedData.powerValue` exists, it assigns it to `this.latestPowerValue` and, if the VR nudge button exists, sets its text to `Power: <value>%`. Other handlers log connection, error, close, and reconnect.

### 3. Scene and World (createScene)

- **createScene()** creates a new `BABYLON.Scene` and defines shared dimensions as instance properties: `trackWidth`, `trackLength`, `trackHeight`, `waterLevel`, `trackElevation`. These are used for the track, camera, drone placement, and boundaries.
- It adds a **FreeCamera** (mouse look only; keyboard movement is removed), a **HemisphericLight**, and then calls **createDrone()** to build the drone.
- It sets **cameraMode** (0 = stationary, 1 = follow, 2 = side view) and calls **createGUI()** for the 2D overlay and **setupDroneControls()** for the main per-frame logic.
- It builds a **skybox** (large box with a cubemap texture), **ground** (large plane below water with a tiled texture), the **track** (box with diffuse and bump textures from `assets/`), **left and right racing lines** (thin strips on the track), **water** (plane with `WaterMaterial` and reflections), and the **finish line** (red strip near the end of the track). The camera’s initial position and target are set so the view looks down the track, and vertical look limits are applied. The finish line Z position is used later as the forward boundary for the drone.

### 4. Drone (createDrone)

- **createDrone()** creates a **TransformNode** (`droneContainer`) as the root. It adds a box for the body and, in a loop, four arms and four propeller cylinders at the corners, all parented to the container. The container is positioned at the start of the track (slightly in front of the camera). `initialDronePosition` is stored for the Reset action; `flyingHeight` and `isFlying` are set; and `this.drone` is set to the container so the rest of the code moves the whole drone by updating this node.

### 5. 2D GUI (createGUI)

- **createGUI()** creates a fullscreen **AdvancedDynamicTexture** and a horizontal **StackPanel** at the bottom-left with three buttons: Change View, Lift-Off, Reset Position.
- **Change View** cycles `cameraMode` 0 -> 1 -> 2 and updates the camera position/target and button label (Stationary / Follow / Side). In mode 0 the camera is reattached for mouse control; in 1 and 2 it is detached so the camera is driven by the follow logic.
- **Lift-Off** toggles `isFlying` and the button label (Lift-Off / Land).
- **Reset** sets the drone position to `initialDronePosition`, sets `isFlying` to false, and if camera mode is 0, resets the camera to the default position and target.

### 6. WebXR and VR Camera (initializeXR)

- **initializeXR()** calls `createDefaultXRExperienceAsync` with the track mesh as the only floor mesh. It then calls **createVRUI()** to build the VR 3D panel and **setupXRControllers()** to wire controller input.
- It subscribes to **onStateChangedObservable**. When the state becomes `IN_XR`, it saves the current camera mode, forces mode to 1 (follow), sets the XR camera position behind the drone, and adds a **onBeforeRenderObservable** observer that each frame (while still in XR) computes a target position from the current camera mode (stationary or behind the drone) and lerps the XR camera to it. When the state becomes `NOT_IN_XR`, it restores the saved camera mode and removes that observer.

### 7. VR 3D UI (createVRUI)

- **createVRUI()** defines a **panelOffset** used to position the 3D panel relative to the XR camera. Keydown handlers for Q/A, W/S, E/D adjust this offset for layout tuning.
- It creates a **GUI3DManager** and a **PlanePanel** with **HolographicButton** instances: Change View, Lift-Off, Reset, and Nudge. The Nudge button’s text is set to `Power: 0.000%` initially and is updated by the MQTT message handler to show `this.latestPowerValue`.
- **Change View** in VR toggles only between mode 0 and 1 (stationary / follow) and updates the button text. **Lift-Off** and **Reset** behave like the 2D GUI.
- **Nudge** click: if the drone exists and is flying, it initializes `nudgeState` (velocity, acceleration, deceleration, max velocity, target distance) and adds a **onBeforeRenderObservable** observer. That observer each frame accelerates then decelerates the drone along +Z, applies a small pitch and a tiny vertical wobble, clamps position to the finish line, and when the nudge is done (velocity near zero or distance reached), clears the observer. So the Nudge button triggers a short forward burst; the displayed power value is for feedback (and future use), not yet used to scale the nudge.
- Another **registerBeforeRender** updates the panel’s position each frame to the XR camera position plus `panelOffset`, so the panel follows the user in VR.

### 8. XR Controllers (setupXRControllers)

- **setupXRControllers()** disables default XR camera collision and clears default controller observables so the app fully controls the drone. On **onControllerAddedObservable** / **onMotionControllerInitObservable** it stores left and right controller references.
- A **onBeforeRenderObservable** observer runs only when the drone is flying. It reads the left controller thumbstick for forward/back (Z) and left/right (X), and the right thumbstick for up/down (Y). It lerps current velocities toward these inputs, applies them to `this.drone.position`, and clamps position to the track (Z between start and finish, X within half track width). It also sets the drone’s pitch and roll from velocity for a simple tilt effect.

### 9. Main Per-Frame Logic (setupDroneControls)

- **setupDroneControls()** creates a **sceneRoot** TransformNode (used in VR to move the world when the camera follows) and a single **registerBeforeRender** callback that runs every frame.
- **Takeoff and landing:** If `isFlying` and the drone is below `hoverHeight`, it moves the drone up with a velocity that accelerates then decelerates near the target, plus slight random wobble. If not flying and the drone is above the landing height, it moves the drone down the same way. When landed, pitch and roll are zeroed.
- **Keyboard movement (only when flying):** Arrow keys change velocity.z (forward/back) and velocity.x (left/right); Page Up/Down change velocity.y. Velocity is applied with acceleration and deceleration, and drone tilt is set from velocity. Position is updated and then clamped to the track Z and X limits.
- **Camera follow:** If mode is 1 (follow), in VR the code lerps `sceneRoot.position` so the world is centered relative to the drone (giving a “camera behind drone” feel); on desktop it lerps the camera position behind the drone and sets the target to the drone. If mode is 2 (side), same idea from the side. If mode is 0 and in VR, it lerps `sceneRoot.position` back to zero (stationary world).
- **Propellers:** For each of the four propeller meshes, rotation.y is incremented by a speed that depends on whether the drone is flying, transitioning (takeoff/landing), or idle, and on movement velocity.
- **XR parenting:** When the active camera is in XR, scene meshes (except camera and drone-related names) and the drone container are parented to `sceneRoot` so that moving `sceneRoot` moves the world. When not in XR, they are unparented and `sceneRoot.position` is reset to zero.

### 10. Standalone MQTT Client (mqtt_client.js)

- **mqtt_client.js** is a Node script. It requires the `mqtt` package, defines the same broker config and topic, and calls `mqtt.connect()`. On `connect` it subscribes to the topic. On `message` it parses the payload as JSON and, if `processedData.powerValue` exists, logs it. It also logs errors, close, and reconnect. This file is not referenced by the HTML; it is run separately for testing or logging the EEG stream.

---

## How to Run and Modify

- **Web app:** Serve the project folder with any static HTTP server (e.g., from the project root run `npx serve` or `python3 -m http.server`) and open the provided URL in a browser. For VR, use a WebXR-capable browser and headset.
- **Standalone MQTT:** From the project root run `npm install` then `npm start` (or `node mqtt_client.js`).
- **Modifying behavior:** Change track size or layout in `createScene` (dimensions and mesh positions). Change drone shape or start position in `createDrone`. Change movement speeds and boundaries in `setupDroneControls` (keyboard) and `setupXRControllers` (VR). Change MQTT topic or broker in `initializeMQTT` and in `mqtt_client.js`. To drive nudge or other behavior from the power value, use `this.latestPowerValue` inside the nudge observer or elsewhere in `app.js`.

### Broker configuration

The web app and the standalone MQTT client both use HiveMQ Cloud (WSS). Broker hostname, port, username, and password are set in `initializeMQTT()` in `app.js` and in `mqtt_client.js`. To use a different HiveMQ cluster, update the `hostname` (and optionally `port`) in both places; keep the same username and password, or obtain new credentials from the project maintainer and update the config accordingly.
