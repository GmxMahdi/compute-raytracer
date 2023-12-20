import { Camera } from "./camera";
import { Sphere } from "./sphere";
export class SceneRaytracing {
    spheres: Sphere[];
    camera: Camera;

    constructor(sphereCount: number) {
        this.spheres = new Array(sphereCount);
        for (let i = 0; i < this.spheres.length; ++i) {
           this.spheres[i] = this.generateSphere();
        }

        this.camera = new Camera([0.0, 0.0, 0.0], 90, 0);
    }

    private generateSphere(): Sphere {
        const center: number[] = [
            -30.5 + 70.0 * Math.random(),
            -50.0 + 100.0 * Math.random(),
            100.0 + 100.0 * Math.random(),
       ]

       const radius: number =  0.1 + 1.9 * Math.random();

       const color: number[] = [
           0.3 + 0.7 * Math.random(),
           0.3 + 0.7 * Math.random(),
           0.3 + 0.7 * Math.random(),
       ];

       return new Sphere(center, radius, color);
    }

    update() {
    }
}