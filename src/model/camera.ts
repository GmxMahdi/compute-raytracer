import {vec3, mat4} from 'gl-matrix';
import { deg2rad } from '../utils/more-math';

export class Camera {
    position: vec3;
    eulers: vec3;
    view: mat4;

    forwards: vec3;
    right: vec3;
    up: vec3;

    constructor(position: vec3, theta: number, phi: number) {
        this.position = position;
        this.eulers = vec3.fromValues(0, phi, theta);
        this.forwards = vec3.create();
        this.right = vec3.create();
        this.up = vec3.create();
        this.view = mat4.create();
    }

    update() {
        this.forwards = vec3.fromValues(
            Math.cos(deg2rad(this.eulers[2])) * Math.cos(deg2rad(this.eulers[1])),
            Math.sin(deg2rad(this.eulers[2])) * Math.cos(deg2rad(this.eulers[1])),
            Math.sin(deg2rad(this.eulers[1]))
        );

        vec3.cross(this.right, this.forwards, [0, 0, 1]);
        vec3.normalize(this.right, this.right);

        vec3.cross(this.up, this.right, this.forwards);
        vec3.normalize(this.up, this.up)

        const target: vec3 = vec3.create();
        vec3.add(target, this.position, this.forwards);

        this.view = mat4.create();
        mat4.lookAt(this.view, this.position, target, this.up);
    }

    get_view(): mat4 {
        return this.view;
    }
}