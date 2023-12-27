import { Camera } from "../camera";
import { Sphere } from "../raycast/sphere";
import { Node } from "../acceleration/node";
import { vec3 } from "gl-matrix";
import { Triangle } from "./triangle";
import { ObjectMesh } from "../../view/obj-mesh";
import urlCatObj from "../../models/mousey/mousey.obj?url";

export class SceneRaytracing {
    camera: Camera

    spheres: Sphere[];
    triangleCount: number;
    sphereIndices: number[];
    triangles: Triangle[];

    mesh: ObjectMesh;

    nodes: Node[];
    nodesUsed: number = 0;

    constructor(sphereCount: number) {

        // this.sphereCount = sphereCount;
        // this.spheres = new Array(sphereCount);
        // this.triangles = new Array(sphereCount);
        // for (let i = 0; i < this.spheres.length; i++)
        //     this.triangles[i] = this.generateTriangle();
        // this.triangles[sphereCount - 1] = new Triangle(
        //     [0, -2, 0],
        //     [
        //         [0, 0, 0],
        //         [0, 0, 10],
        //         [10, 0, 0]
        //     ],
        //     [0.5, 0.5, 0.5]
        // )

        // this.triangles[sphereCount - 2] = new Triangle(
        //     [0, -2, 0],
        //     [
        //         [10, 0, 10],
        //         [0, 0, 10],
        //         [10, 0, 0]
        //     ],
        //     [0.5, 0.5, 0.5]
        // )

        this.camera = new Camera([-2.0, 0.0, 0.0], 90, 0);
    }

    async createScene() {
        // Mesh
        this.mesh = new ObjectMesh([0, 0, 5], [0, 45, 0]);
        let meshColor: vec3 = [0.9, 0.7, 0.78];
        await this.mesh.initialize(urlCatObj, meshColor, /*invertYZ*/false, /*alignBottom*/true, /*scale*/0.1);

        // Populate triangle array
        this.triangles = [];
        for (const triangle of this.mesh.triangles) this.triangles.push(triangle);
        this.triangleCount = this.triangles.length;

        console.log('there is ', this.triangleCount, ' triangles');

        this.buildBVH();
    }

    update() {
        //this.mesh.update(3);
    }

    private generateSphere() {

        const center: number[] = [
            -10 + 20.0 * Math.random(),
            -10 + 20.0 * Math.random(),
            +25 + 10.0 * Math.random()
        ];

        const radius: number = 0.1 + 1.2 * Math.random();

        const color: number[] = [
            0.7 + 0.3 * Math.random(),
            0.7 + 0.3 * Math.random(),
            0.7 + 0.3 * Math.random()
        ];

        return new Sphere(center, radius, color);
    }

    private generateFlatTriangle() {
        // const center: vec3 = [
        //     -20 + 40.0 * Math.random(),
        //     -20 + 40.0 * Math.random(),
        //     +25 + 20.0 * Math.random()
        // ];

        // let axis = Math.floor(Math.random() * 3);
        // const offsets: vec3[] = 
        // [
        //     [
        //         3 + 6 * Math.random(),
        //         -3 + 6 * Math.random(),
        //         -3 + 6 * Math.random()
        //     ],
        //     [
        //         -3 + 6 * Math.random(),
        //         3 + 6 * Math.random(),
        //         -3 + 6 * Math.random()
        //     ],
        //     [
        //         -3 + 6 * Math.random(),
        //         -3 + 6 * Math.random(),
        //         3 + 6 * Math.random()
        //     ]
        // ];

        // offsets[0][axis] = 0;
        // offsets[1][axis] = 0;
        // offsets[2][axis] = 0;


        // const color: vec3 = [
        //     Math.random(),
        //     Math.random(),
        //     Math.random()
        // ];

        // return new Triangle(center, offsets, color);
    }

    private generateTriangle() {

        const center: vec3 = [
            -20 + 40.0 * Math.random(),
            -20 + 40.0 * Math.random(),
            +25 + 40.0 * Math.random()
        ];

        const offsets: vec3[] = 
        [
            [
                3 + 6 * Math.random(),
                -3 + 6 * Math.random(),
                -3 + 6 * Math.random()
            ],
            [
                -3 + 6 * Math.random(),
                3 + 6 * Math.random(),
                -3 + 6 * Math.random()
            ],
            [
                -3 + 6 * Math.random(),
                -3 + 6 * Math.random(),
                3 + 6 * Math.random()
            ]
        ];

        const color: vec3 = [
            0.3 + 0.7 * Math.random(),
            0.3 + 0.7 * Math.random(),
            0.3 + 0.7 * Math.random()
        ];

        return new Triangle(center, offsets, color);
    }

    private buildBVH() {

        this.sphereIndices = new Array(this.triangles.length)
        for (var i:number = 0; i < this.triangleCount; i += 1) {
            this.sphereIndices[i] = i;
        }

        this.nodes = new Array(2 * this.triangles.length - 1);
        for (var i:number = 0; i < 2 * this.triangles.length - 1; i += 1) {
            this.nodes[i] = new Node();
        }

        var root: Node = this.nodes[0];
        root.leftChild = 0;
        root.sphereCount = this.triangles.length;
        this.nodesUsed += 1

        this.updateBounds(0);
        this.subdivide(0);
    }

    private updateBounds(nodeIndex: number) {
        const DEFAULT = 999999;
        var node: Node = this.nodes[nodeIndex];
        node.minCorner = [DEFAULT, DEFAULT, DEFAULT];
        node.maxCorner = [-DEFAULT, -DEFAULT, -DEFAULT];

        for (var i: number = 0; i < node.sphereCount; i += 1) {
            // const sphere: Sphere = this.spheres[this.sphereIndices[node.leftChild + i]];
            // const axis: vec3 = [sphere.radius, sphere.radius, sphere.radius];

            // var temp: vec3 = [0, 0, 0]
            // vec3.subtract(temp, sphere.center, axis);
            // vec3.min(node.minCorner, node.minCorner, temp);

            // vec3.add(temp, sphere.center, axis);
            // vec3.max(node.maxCorner, node.maxCorner, temp);

            const triangle: Triangle = this.triangles[this.sphereIndices[node.leftChild + i]];
            for (const corner of triangle.corners) {
                vec3.min(node.minCorner, node.minCorner, corner);
                vec3.max(node.maxCorner, node.maxCorner, corner);
            }
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
            if (this.triangles[this.sphereIndices[i]].centroid[axis] < splitPosition) {
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