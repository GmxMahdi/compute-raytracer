import { vec3 } from "gl-matrix";

export class AABB {
    min: vec3;
    max: vec3;

    constructor() {
        this.min = vec3.fromValues( 1e30,  1e30,  1e30);
        this.max = vec3.fromValues(-1e30, -1e30, -1e30);
    }

    grow(corner: vec3) {
        vec3.min(this.min, this.min, corner);
        vec3.max(this.max, this.max, corner);
    }

    surfaceArea() {
        const extents: vec3 = vec3.subtract(vec3.create(), this.max, this.min);
        return 2 * (extents[0] * extents[1] + extents[1] * extents[2] + extents[2] * extents[0]);
    }
}