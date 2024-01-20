import { mat4, vec3 } from "gl-matrix";
import { deg2rad } from "../../utils/more-math";

export class Model {
    model: mat4;
    position: vec3;
    eulers: vec3;
    eulerSpeed: vec3;
    meshIndex: number = 0;

    constructor(meshIndex: number, position: vec3, eulers: vec3, eulerSpeed?: vec3) {
        this.meshIndex = meshIndex;
        this.position = position;
        this.eulers = eulers;
        this.eulerSpeed = eulerSpeed ? <vec3> eulerSpeed.valueOf() : [0, 0, 0];
        this.calculateTransform();
    }

    update(dt: number) {
        let rotation: vec3 = vec3.mul(vec3.create(), this.eulerSpeed, [dt, dt, dt]);
        vec3.add(this.eulers, this.eulers, rotation);

        if (this.eulers[0] >  360) this.eulers[0] -= 360;
        if (this.eulers[1] >  360) this.eulers[1] -= 360;
        if (this.eulers[2] >  360) this.eulers[2] -= 360;
        if (this.eulers[0] < -360) this.eulers[0] += 360;
        if (this.eulers[1] < -360) this.eulers[1] += 360;
        if (this.eulers[2] < -360) this.eulers[2] += 360;

        this.calculateTransform();
    }

    private calculateTransform() {
        this.model = mat4.create();
        mat4.translate(this.model, this.model, this.position);    
        mat4.rotateY(this.model, this.model, deg2rad(this.eulers[1]));
    }
}