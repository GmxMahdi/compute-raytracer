import { Triangle } from "./triangle";
import { Camera } from "./camera";
import { vec3, mat4 } from "gl-matrix";
import { clamp } from "../utils/more-math";

export class Scene {

    triangles: Triangle[];
    triangleCount: number = 0;
    objectData: Float32Array;

    player: Camera;

    constructor() {
        this.triangles = [];
        this.triangleCount = 0;
        this.objectData = new Float32Array(16 * 1024);

        let i: number = 0;
        for (let j = -5; j < 5; ++j) {
            this.triangles.push(new Triangle(
                [2, j, 0],
                0
            ));

            let blankMatrix = mat4.create();
            for (let k = 0; k < 16; ++k) {
                this.objectData[16 * i + k] = <number> blankMatrix.at(k);
            }
            ++i;
            ++this.triangleCount;
        }


        this.player = new Camera([-2, 0, 0.5], 0, 0);
    }

    update() {
        this.player.update();

        let i = 0;
        for (const triangle of this.triangles) {
            triangle.update();
            let model = triangle.get_model();
            for (let k = 0; k < 16; ++k) {
                this.objectData[16 * i + k] = <number> model.at(k);
            }
            ++i;
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

    get_triangles(): Float32Array {
        return this.objectData;
    }
}