import { Camera } from "./camera";
import { Sphere } from "./sphere";
import { Node } from "./acceleration/node";
import { vec3 } from "gl-matrix";

export class SceneRaytracing {
    spheres: Sphere[];
    camera: Camera;

    nodes: Node[];
    nodesUsed: number = 0;
    sphereIndices: number[];

    constructor(sphereCount: number) {
        this.spheres = new Array(sphereCount);
        for (let i = 0; i < this.spheres.length; ++i) {
           this.spheres[i] = this.generateSphere();
        }

        this.camera = new Camera([0.0, 0.0, 0.0], 90, 0);

        this.buildBVH();
    }

    update() {
    }

    private generateSphere(): Sphere {
        const center: number[] = [
            -25.0 + 50.0 * Math.random(),
            -25.0 + 50.0 * Math.random(),
             50.0 + 50.0 * Math.random(),
       ]

       const radius: number =  0.1 + 1.9 * Math.random();

       const color: number[] = [
           0.3 + 0.7 * Math.random(),
           0.3 + 0.7 * Math.random(),
           0.3 + 0.7 * Math.random(),
       ];

       return new Sphere(center, radius, color);
    }

    private buildBVH() {
        this.sphereIndices = new Array(this.spheres.length);
        for (let i: number = 0; i < this.spheres.length; ++i)
            this.sphereIndices[i] = i;

        this.nodes = new Array(2 * this.spheres.length - 1);
        for (let i: number = 0; i < this.nodes.length; ++i)
            this.nodes[i] = new Node();

        let root: Node = this.nodes[0];
        root.leftChild = 0;
        root.sphereCount = this.spheres.length;
        this.nodesUsed += 1;

        this.updateBounds(0);
        this.subdivide(0);
    }

    private updateBounds(nodeIndex: number) {

        var node: Node = this.nodes[nodeIndex];
        node.minCorner = [999999, 999999, 999999];
        node.maxCorner = [-999999, -999999, -999999];

        for (var i: number = 0; i < node.sphereCount; i += 1) {
            const sphere: Sphere = this.spheres[this.sphereIndices[node.leftChild + i]];
            const axis: vec3 = [sphere.radius, sphere.radius, sphere.radius];

            var temp: vec3 = [0, 0, 0]
            vec3.subtract(temp, sphere.center, axis);
            vec3.min(node.minCorner, node.minCorner, temp);

            vec3.add(temp, sphere.center, axis);
            vec3.max(node.maxCorner, node.maxCorner, temp);
        }
    }

    private subdivide(nodeIndex: number) {

        var node: Node = this.nodes[nodeIndex];

        if (node.sphereCount <= 2) {
            return;
        }

        var extent: vec3 = [0, 0, 0];
        vec3.subtract(extent, node.maxCorner, node.minCorner);
        var axis: number = 0;
        if (extent[1] > extent[axis]) {
            axis = 1;
        }
        if (extent[2] > extent[axis]) {
            axis = 2;
        }

        const splitPosition: number = node.minCorner[axis] + extent[axis] / 2;

        var i: number = node.leftChild;
        var j: number = i + node.sphereCount - 1;

        while (i <= j) {
            if (this.spheres[this.sphereIndices[i]].center[axis] < splitPosition) {
                i += 1;
            }
            else {
                var temp: number = this.sphereIndices[i];
                this.sphereIndices[i] = this.sphereIndices[j];
                this.sphereIndices[j] = temp;
                j -= 1;
            }
        }

        var leftCount: number = i - node.leftChild;
        if (leftCount == 0 || leftCount == node.sphereCount) {
            return;
        }

        const leftChildIndex: number = this.nodesUsed;
        this.nodesUsed += 1;
        const rightChildIndex: number = this.nodesUsed;
        this.nodesUsed += 1;

        this.nodes[leftChildIndex].leftChild = node.leftChild;
        this.nodes[leftChildIndex].sphereCount = leftCount;

        this.nodes[rightChildIndex].leftChild = i;
        this.nodes[rightChildIndex].sphereCount = node.sphereCount - leftCount;

        node.leftChild = leftChildIndex;
        node.sphereCount = 0;

        this.updateBounds(leftChildIndex);
        this.updateBounds(rightChildIndex);
        this.subdivide(leftChildIndex);
        this.subdivide(rightChildIndex);
    }
}