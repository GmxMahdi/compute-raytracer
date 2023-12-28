export class Cylinder {
    center: Float32Array;
    radius: number;
    height: number;
    color: Float32Array;

    constructor(center: number[], radius: number, height: number, color: number[]) {
        this.center = new Float32Array(center);
        this.color = new Float32Array(color);
        this.radius = radius;
        this.height = height;
    }
}