import { Renderer } from "../view/renderer";
import { Scene } from "../model/scene";

export class App {

    canvas: HTMLCanvasElement;
    renderer: Renderer;
    scene: Scene;

    keyLabel: HTMLElement;
    mouseXLabel: HTMLElement;
    mouseYLabel: HTMLElement;

    isControlsLocked = true;
    forwardsAmount: number = 0;
    rightAmount: number = 0;
    sensitivity: number = 0.1;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.renderer = new Renderer(canvas);
        this.scene = new Scene();

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

    run = () => {
        let running: boolean = true;

        this.scene.update();
        this.scene.move_player(this.forwardsAmount, this.rightAmount);

        this.renderer.render(
            this.scene.get_player(),
            this.scene.get_triangles(),
            this.scene.triangleCount
        );

        if (running) {
            requestAnimationFrame(this.run);
        }
    }

    handleKeyDownEvent(event: KeyboardEvent) {
        if (this.isControlsLocked) return;

        if (event.code === 'KeyW') this.forwardsAmount = 0.02;
        if (event.code === 'KeyS') this.forwardsAmount = -0.02;

        if (event.code === 'KeyA') this.rightAmount = -0.02;
        if (event.code === 'KeyD') this.rightAmount = 0.02;
        
        this.keyLabel.innerText = event.code;
    }

    handleKeyUpEvent(event: KeyboardEvent) {
        if (this.isControlsLocked) return;

        if (event.code === 'KeyW') this.forwardsAmount = 0;
        if (event.code === 'KeyS') this.forwardsAmount = 0;

        if (event.code === 'KeyA') this.rightAmount = 0;
        if (event.code === 'KeyD') this.rightAmount = 0;
    }

    handleMouseMove(event: MouseEvent) {
        if (this.isControlsLocked) return;
        this.mouseXLabel.innerText = event.movementX.toString();
        this.mouseYLabel.innerText = event.movementY.toString();
        this.scene.spin_player(event.movementX * this.sensitivity, event.movementY * this.sensitivity);
    }

    handlePointerLockChange() {
        this.isControlsLocked = document.pointerLockElement !== this.canvas;
    }
}