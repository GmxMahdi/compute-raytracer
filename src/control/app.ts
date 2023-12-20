import { Renderer } from "../view/renderer";
import { Scene } from "../model/scene";

export class App {

    canvas: HTMLCanvasElement;
    renderer: Renderer;
    scene: Scene;

    fpsLabel: HTMLElement;
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
        this.renderer = new Renderer(canvas);
        this.scene = new Scene();

        this.fpsLabel = document.getElementById('current-fps');
        this.keyLabel = document.getElementById('current-key');
        this.mouseXLabel = document.getElementById('mouse-x');
        this.mouseYLabel = document.getElementById('mouse-y');

        document.addEventListener('keydown', (event: KeyboardEvent) => this.handleKeyDownEvent(event));
        document.addEventListener('keyup', (event: KeyboardEvent) => this.handleKeyUpEvent(event));
        document.addEventListener("pointerlockchange", () => this.handlePointerLockChange(), false);
        canvas.onclick = () => {
            if (document.pointerLockElement) return;
            canvas.requestPointerLock();
        }
        canvas.addEventListener('mousemove', (event: MouseEvent) => this.handleMouseMove(event));

    }

    async initialize() {
        await this.renderer.initialize();
    }

    run() {
        this.lastTimeStamp = <number> document.timeline.currentTime;
        requestAnimationFrame(this._run);
    }

    private _run = (timeStamp: number) => {
        let running: boolean = true;

        this.updateDeltaTime(timeStamp);

        this.scene.update();
        this.scene.movePlayer(this.forwardsAmount, this.rightAmount);

        this.renderer.render(
            this.scene.getRenderables(),
            this.scene.player
        );

        if (running) {
            requestAnimationFrame(this._run);
        }
    }

    private updateDeltaTime(timeStamp: number) {
        this.dt = timeStamp - this.lastTimeStamp;
        this.dtAccumulated += this.dt;
        this.nbTicks += 1;
        this.lastTimeStamp = timeStamp;

        if (this.nbTicks % 10 === 0) {
            const fps = 1000.0 / (this.dtAccumulated / this.nbTicks);
            this.fpsLabel.innerText = fps.toFixed(0).toString();
            this.nbTicks = 0;
            this.dtAccumulated = 0;
        }
    }

    private handleKeyDownEvent(event: KeyboardEvent) {
        if (this.isControlsLocked) return;

        if (event.code === 'KeyW') this.forwardsAmount = 0.02;
        if (event.code === 'KeyS') this.forwardsAmount = -0.02;

        if (event.code === 'KeyA') this.rightAmount = -0.02;
        if (event.code === 'KeyD') this.rightAmount = 0.02;
        
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
        this.scene.spinPlayer(event.movementX * this.sensitivity, event.movementY * this.sensitivity);
    }

    private handlePointerLockChange() {
        this.isControlsLocked = document.pointerLockElement !== this.canvas;
    }
}