import { vec3 } from "gl-matrix";
import { off } from "process";

export class Triangle {
    corners: vec3[];
    color: vec3;
    centroid: vec3;

    constructor(center: vec3, offsets: vec3[], color: vec3) {
        this.color = color;
        this.corners = [];
        this.centroid = [0, 0, 0];

        const THIRD = 1.0/3.0;
        const weight: vec3 = [THIRD, THIRD, THIRD];

        for (let offset of offsets) {
            const corner: vec3 = vec3.add(vec3.create(), center, offset);
            this.corners.push(corner);

            let tempCorner = vec3.multiply(vec3.create(), center, weight);
            vec3.add(this.centroid, this.centroid, tempCorner);
        }
    }
}