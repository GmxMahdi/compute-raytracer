import {vec2, vec3, mat4} from 'gl-matrix';
import { clamp, deg2rad } from '../utils/more-math';

export class Camera {
    position: vec3;
    eulers: vec2;
    view: mat4;

    forwards: vec3;
    right: vec3;
    up: vec3;

    constructor(position: vec3, theta: number, phi: number) {
        this.position = position;
        this.eulers = vec2.fromValues(phi % 360, clamp(theta, 1, 180));
        this.forwards = vec3.create();
        this.right = vec3.create();
        this.up = vec3.create();
        this.view = mat4.create();
        this.update();
    }

    spin(dx: number, dy: number) {
        this.eulers[0] -= dx;
        this.eulers[0] %= 360;

        this.eulers[1] += dy;
        this.eulers[1] = clamp(this.eulers[1], 1, 180);
        this.update();
    }

    move(forwardsAmount: number, rightAmount: number) {
        vec3.scaleAndAdd(
            this.position, this.position,
            this.forwards, forwardsAmount);
            
        vec3.scaleAndAdd(
            this.position, this.position,
            this.right, rightAmount);  
    }

    update() {
        this.forwards = vec3.fromValues(
            Math.cos(deg2rad(this.eulers[0])) * Math.sin(deg2rad(this.eulers[1])),
            Math.cos(deg2rad(this.eulers[1])),
            Math.sin(deg2rad(this.eulers[0])) * Math.sin(deg2rad(this.eulers[1])),
        );

        vec3.cross(this.right, this.forwards, [0, -1, 0]);
        vec3.normalize(this.right, this.right);

        vec3.cross(this.up, this.right, this.forwards);
        vec3.normalize(this.up, this.up);

        const target: vec3 = vec3.create();
        vec3.add(target, this.position, this.forwards);

        this.view = mat4.create();
        mat4.lookAt(this.view, this.position, target, this.up);

        console.log(
            Math.round(this.forwards[0]*100)/100,
            Math.round(this.forwards[1]*100)/100,
            Math.round(this.forwards[2]*100)/100,
        );
    }

    get_view(): mat4 {
        return this.view;
    }
}