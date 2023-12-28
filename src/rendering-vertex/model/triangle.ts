import {vec3, mat4} from 'gl-matrix';
import { deg2rad } from '../../utils/more-math';

export class Triangle {
    position: vec3;
    eulers: vec3;
    model: mat4;

    constructor(position: vec3, theta: number) {
        this.position = position;
        this.eulers = vec3.create();
        this.eulers[1] = theta;
    }

    update() {
        this.eulers[1] += 1;
        this.eulers[1] %= 360;

        this.model = mat4.create();
        mat4.translate(this.model, this.model, this.position);
        mat4.rotateY(this.model, this.model, deg2rad(this.eulers[1]));
    }

    get_model(): mat4 {
        return this.model;
    }
}