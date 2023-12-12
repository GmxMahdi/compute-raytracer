import { Triangle } from "./triangle";
import { Camera } from "./camera";
import { vec3 } from "gl-matrix";
import { clamp } from "../utils/more-math";

export class Scene {

    triangles: Triangle[];
    player: Camera;

    constructor() {
        this.triangles = [];
        this.triangles.push(
            new Triangle([2, 0, 0], 0)
        );

        this.player = new Camera([-2, 0, 0.5], 0, 0);
    }

    update() {
        this.player.update();
        for (const triangle of this.triangles) {
            triangle.update();
        }
    }

    spin_player(dx: number, dy: number) {
        this.player.eulers[2] -= dx;
        this.player.eulers[2] %= 360;

        this.player.eulers[1] -= dy;
        this.player.eulers[1] = clamp(this.player.eulers[1], -89, 89);
    }

    move_player(forwardsAmount: number, rightAmount: number) {
        vec3.scaleAndAdd(
            this.player.position, this.player.position,
            this.player.forwards, forwardsAmount);
            
        vec3.scaleAndAdd(
            this.player.position, this.player.position,
            this.player.right, rightAmount);  
    }

    get_player(): Camera {
        return this.player;
    }

    get_triangles(): Triangle[] {
        return this.triangles;
    }
}