
import { RendererRaytracing } from "./rendering-raycast/renderer-raytracing";
import { SceneRaytracing } from "./rendering-raycast/scene-raytracing";

export class App {

    canvas: HTMLCanvasElement;
    renderer: RendererRaytracing;
    scene: SceneRaytracing;
    nbSpheres: number = 10;

    fpsLabel: HTMLElement;
    sphereCountLabel: HTMLElement;
    keyLabel: HTMLElement;
    mouseXLabel: HTMLElement;
    mouseYLabel: HTMLElement;

    // Calculate FPS
    dt: number = 0;
    dtAccumulated: number = 0;
    nbTicks: number = 0;
    lastTimeStamp: number = 0;

    isControlsLocked = true;
    forwardsAmount: number = 0;
    rightAmount: number = 0;
    sensitivity: number = 0.1;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    async initialize() {
        this.scene = new SceneRaytracing();
        await this.scene.createScene();

        let width = Math.floor(document.body.clientWidth * 0.9);
        let height = Math.floor(document.body.clientHeight * 0.9);
        this.renderer = new RendererRaytracing(this.canvas, width, height, this.scene);

        this.fpsLabel = document.getElementById('current-fps');
        this.sphereCountLabel = document.getElementById('sphere-count');
        this.sphereCountLabel.innerText = this.scene.triangles.length.toString();
        this.keyLabel = document.getElementById('current-key');
        this.mouseXLabel = document.getElementById('mouse-x');
        this.mouseYLabel = document.getElementById('mouse-y');

        document.addEventListener('keydown', (event: KeyboardEvent) => this.handleKeyDownEvent(event));
        document.addEventListener('keyup', (event: KeyboardEvent) => this.handleKeyUpEvent(event));
        document.addEventListener("pointerlockchange", () => this.handlePointerLockChange(), false);
        this.canvas.onclick = () => {
            if (document.pointerLockElement) return;
            this.canvas.requestPointerLock();
        }
        this.canvas.addEventListener('mousemove', (event: MouseEvent) => this.handleMouseMove(event));

        await this.renderer.initialize();
    }

    run() {
        this.lastTimeStamp = <number> document.timeline.currentTime;
        requestAnimationFrame(this._run);
    }

    private _run = (timeStamp: number) => {
        let running: boolean = true;

        this.updateDeltaTime(timeStamp);
        this.scene.update(this.dt);
        this.scene.camera.move(this.forwardsAmount * this.dt, this.rightAmount * this.dt);

        this.renderer.render().then(() => {
            if (running)
                requestAnimationFrame(this._run);
        });
    }

    private updateDeltaTime(timeStamp: number) {
        this.dt = timeStamp - this.lastTimeStamp;
        this.dtAccumulated += this.dt;
        this.dt /= 1000;
        this.nbTicks += 1;
        this.lastTimeStamp = timeStamp;

        // Update display
        if (this.nbTicks % 10 === 0) {
            const fps = 1000.0 / (this.dtAccumulated / this.nbTicks);
            this.fpsLabel.innerText = fps.toFixed(0).toString();
            this.nbTicks = 0;
            this.dtAccumulated = 0;
        }
    }

    private handleKeyDownEvent(event: KeyboardEvent) {
        if (this.isControlsLocked) return;
        const SPEED = 2;

        if (event.code === 'KeyW') this.forwardsAmount = SPEED;
        if (event.code === 'KeyS') this.forwardsAmount = -SPEED;

        if (event.code === 'KeyA') this.rightAmount = -SPEED;
        if (event.code === 'KeyD') this.rightAmount = SPEED;
        
        this.keyLabel.innerText = event.code;
    }

    private  handleKeyUpEvent(event: KeyboardEvent) {
        if (this.isControlsLocked) return;

        if (event.code === 'KeyW') this.forwardsAmount = 0;
        if (event.code === 'KeyS') this.forwardsAmount = 0;

        if (event.code === 'KeyA') this.rightAmount = 0;
        if (event.code === 'KeyD') this.rightAmount = 0;
    }

    private handleMouseMove(event: MouseEvent) {
        if (this.isControlsLocked) return;
        this.mouseXLabel.innerText = event.movementX.toString();
        this.mouseYLabel.innerText = event.movementY.toString();
        this.scene.camera.spin(event.movementX * this.sensitivity, event.movementY * this.sensitivity);
    }

    private handlePointerLockChange() {
        this.isControlsLocked = document.pointerLockElement !== this.canvas;
    }
}