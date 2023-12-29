import { mat4, vec3 } from "gl-matrix";
import { deg2rad } from "../../utils/more-math";

export class Model {
    model: mat4;
    position: vec3;
    eulers: vec3;

    constructor(position: vec3, eulers: vec3) {
        this.position = position;
        this.eulers = eulers;
        this.calculateTransform();
    }

    update(dt: number) {
        const SPEED = 90;
        this.eulers[1] += SPEED * dt;
        if (this.eulers[1] > 360) this.eulers[1] -= 360;
        this.calculateTransform();
    }

    private calculateTransform() {
        this.model = mat4.create();
        mat4.translate(this.model, this.model, this.position);    
        mat4.rotateY(this.model, this.model, deg2rad(this.eulers[1]));
    }
}