import { Triangle } from "./triangle";
import { Quad } from "./quad";
import { Camera } from "./camera";
import { vec3, mat4 } from "gl-matrix";
import { clamp } from "../utils/more-math";
import { ObjectTypes, RenderData } from "../definitions/definitions";
import { Statue } from "./statue";

export class Scene {

    triangles: Triangle[];
    triangleCount: number = 0;

    quads: Quad[];
    quadCount: number = 0;

    statue: Statue;

    objectData: Float32Array;

    player: Camera;

    constructor() {
        this.triangles = [];
        this.quads = [];
        this.triangleCount = 0;
        this.objectData = new Float32Array(16 * 1024);

        this.makeTriangles();
        this.makeQuads();
        this.statue = new Statue([0, 0, 0], [0, 0, 0]);

        this.player = new Camera([-2, 0.5, 0], 0, 0);
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

        for (const quad of this.quads) {
            quad.update();
            let model = quad.get_model();
            for (let k = 0; k < 16; ++k) {
                this.objectData[16 * i + k] = <number> model.at(k);
            }
            ++i;
        }

        this.statue.update();
        let model = this.statue.get_model();
        for (let k = 0; k < 16; ++k) {
            this.objectData[16 * i + k] = <number> model.at(k);
        }
        ++i;
    }

    makeTriangles() {
        let i: number = 0;
        for (let j = -5; j < 5; ++j) {
            this.triangles.push(new Triangle(
                [2, 0.5, j],
                0
            ));

            let blankMatrix = mat4.create();
            for (let k = 0; k < 16; ++k) {
                this.objectData[16 * i + k] = <number> blankMatrix.at(k);
            }
            ++i;
            ++this.triangleCount;
        }
    }

    makeQuads() {
        let i: number = this.triangleCount;
        for (let x = -2; x <= 2; ++x)
            for (let y = -2; y <= 2; ++y) {
                this.quads.push(new Quad(
                    [x, 0, y],
                ));

                let blankMatrix = mat4.create();
                for (let k = 0; k < 16; ++k) {
                    this.objectData[16 * i + k] = <number> blankMatrix.at(k);
                }
                ++i;
                ++this.quadCount;
            }
    }

    spinPlayer(dx: number, dy: number) {
        this.player.eulers[2] += dx;
        this.player.eulers[2] %= 360;

        this.player.eulers[1] -= dy;
        this.player.eulers[1] = clamp(this.player.eulers[1], -89, 89);
    }

    movePlayer(forwardsAmount: number, rightAmount: number) {
        vec3.scaleAndAdd(
            this.player.position, this.player.position,
            this.player.forwards, forwardsAmount);
            
        vec3.scaleAndAdd(
            this.player.position, this.player.position,
            this.player.right, rightAmount);  
    }

    getPlayer(): Camera {
        return this.player;
    }

    getRenderables(): RenderData {
        return {
            viewTransform: this.player.get_view(),
            modelTranforms: this.objectData,
            objectCounts: {
                [ObjectTypes.TRIANGLE]: this.triangleCount,
                [ObjectTypes.QUAD]: this.quadCount
            }
        };
    }
}