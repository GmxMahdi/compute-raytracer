import { mat4, vec3 } from "gl-matrix";

export class BLAS {
    minCorner: vec3;
    maxCorner: vec3;
    center: vec3;
    inverseModel: mat4 = mat4.create();
    rootNodeIndex: number;
    triangleLookupIndex: number = 0;

    constructor(rootNodeIndex: number, minCorner: vec3, maxCorner: vec3, model: mat4) {
        this.rootNodeIndex = rootNodeIndex;
        this.minCorner = [1e30, 1e30, 1e30];
        this.maxCorner = [-1e30, -1e30, -1e30];

        const corners: vec3[] = [
            [minCorner[0], minCorner[1], minCorner[2]],
            [minCorner[0], minCorner[1], maxCorner[2]],
            [minCorner[0], maxCorner[1], minCorner[2]],
            [minCorner[0], maxCorner[1], maxCorner[2]],
            [maxCorner[0], minCorner[1], minCorner[2]],
            [maxCorner[0], minCorner[1], maxCorner[2]],
            [maxCorner[0], maxCorner[1], minCorner[2]],
            [maxCorner[0], maxCorner[1], maxCorner[2]],
        ]

        let corner: vec3 = vec3.create();
        for (let i = 0; i < corners.length; ++i) {
            vec3.transformMat4(corner, corners[i], model);
            vec3.min(this.minCorner, this.minCorner, corner);
            vec3.max(this.maxCorner, this.maxCorner, corner);
        }

        this.center = vec3.create();
        vec3.add(this.center, this.minCorner, this.maxCorner);
        vec3.div(this.center, this.center, [2, 2, 2]);

        mat4.invert(this.inverseModel, model);
    }
}