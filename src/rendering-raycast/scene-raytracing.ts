import { Camera } from "./camera";
import { Sphere } from "./model/sphere";
import { Node } from "./acceleration/node";
import { vec3 } from "gl-matrix";
import { Triangle } from "./model/triangle";
import { ObjectMesh } from "./object-mesh";
import { Model } from "./model/model";
import { BLAS } from "./acceleration/blas";
import urlCatObj from "../assets/models/mousey/mousey.obj?url";
import { Mode } from "fs";

export class SceneRaytracing {
    camera: Camera

    spheres: Sphere[];
    triangleIndices: number[];
    triangles: Triangle[];

    tlasNodesMax: number;
    blasIndices: number[];
    blasList: BLAS[];
    blasConsumed: boolean = false;

    nodes: Node[];
    nodesUsed: number = 0;

    mesh: ObjectMesh;
    models: Model[];

    constructor() {
    }

    async createScene() {
        this.camera = new Camera([-2.0, 0.0, 0.0], 90, 0);

        this.mesh = new ObjectMesh();
        await this.mesh.initialize(urlCatObj, {
            color: [0.8, 0.6, 0.7],
            alignBottom: true,
            scale: 0.025
        });

        // Initialize models
        this.models = [];
        for (let z = -1; z < 2; ++z)
            for (let x = -1; x < 2; ++x)
                this.models.push(new Model([5 * x, 0, 5 * z], [180, 45 * x, 0]));

        // Populate triangle array from our mesh
        this.triangles = [];
        for (const triangle of this.mesh.triangles) 
            this.triangles.push(triangle);

        this.triangleIndices = new Array(this.triangles.length)
        for (var i: number = 0; i < this.triangles.length; i += 1) {
            this.triangleIndices[i] = this.mesh.bvh.triangleIndices[i];
        }

        this.tlasNodesMax = 2 * this.models.length - 1;
        const blasNodeUsed: number = this.mesh.bvh.nodesUsed;
        this.nodes = new Array(this.tlasNodesMax + blasNodeUsed);
        for (var i:number = 0; i < 2 * this.triangles.length - 1; i += 1) {
            const node = new Node();
            node.leftChild = 0;
            node.primitiveCount = 0;
            node.minCorner = [0, 0, 0];
            node.maxCorner = [0, 0, 0];
            this.nodes[i] = node;
        }

        this.buildBVH();
        this.finalizeBVH();
        this.blasConsumed = true;
    }

    update() {
        for (const model of this.models)
            model.update(0.5);

        this.buildBVH();
    }

    private buildBVH() {
        this.nodesUsed = 0;
        this.blasList = new Array(this.models.length);
        this.blasIndices = new Array(this.models.length);
        for (let i: number = 0; i < this.models.length; ++i) {
            var blas: BLAS = new BLAS(
                this.mesh.bvh.minCorner,
                this.mesh.bvh.maxCorner,
                this.models[i].model
            );
            blas.rootNodeIndex = this.tlasNodesMax;
            this.blasList[i] = blas;
            this.blasIndices[i] = i;
        }

        for (var i: number = 0; i < this.tlasNodesMax; ++i) {
            this.nodes[i].leftChild = 0;
            this.nodes[i].primitiveCount = 0;
            this.nodes[i].minCorner = [0, 0, 0];
            this.nodes[i].maxCorner = [0, 0, 0];
        }

        var root: Node = this.nodes[0];
        root.leftChild = 0;
        root.primitiveCount = this.blasList.length;
        this.nodesUsed += 1

        this.updateBounds(0);
        this.subdivide(0);
    }

    private updateBounds(nodeIndex: number) {
        const DEFAULT = 999999;
        var node: Node = this.nodes[nodeIndex];
        node.minCorner = [DEFAULT, DEFAULT, DEFAULT];
        node.maxCorner = [-DEFAULT, -DEFAULT, -DEFAULT];

        for (var i: number = 0; i < node.primitiveCount; i += 1) {
            const blas: BLAS = this.blasList[this.blasIndices[node.leftChild + i]];
            vec3.min(node.minCorner, node.minCorner, blas.minCorner);
            vec3.max(node.maxCorner, node.maxCorner, blas.maxCorner);
        }
    }

    private subdivide(nodeIndex: number) {

        var node: Node = this.nodes[nodeIndex];

        if (node.primitiveCount < 2) {
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
        var j: number = i + node.primitiveCount - 1;

        while (i <= j) {
            if (this.blasList[this.blasIndices[i]].center[axis] < splitPosition) {
                i += 1;
            }
            else {
                var temp: number = this.blasIndices[i];
                this.blasIndices[i] = this.blasIndices[j];
                this.blasIndices[j] = temp;
                j -= 1;
            }
        }

        var leftCount: number = i - node.leftChild;
        if (leftCount == 0 || leftCount == node.primitiveCount) {
            return;
        }

        const leftChildIndex: number = this.nodesUsed;
        this.nodesUsed += 1;
        const rightChildIndex: number = this.nodesUsed;
        this.nodesUsed += 1;

        this.nodes[leftChildIndex].leftChild = node.leftChild;
        this.nodes[leftChildIndex].primitiveCount = leftCount;

        this.nodes[rightChildIndex].leftChild = i;
        this.nodes[rightChildIndex].primitiveCount = node.primitiveCount - leftCount;

        node.leftChild = leftChildIndex;
        node.primitiveCount = 0;

        this.updateBounds(leftChildIndex);
        this.updateBounds(rightChildIndex);
        this.subdivide(leftChildIndex);
        this.subdivide(rightChildIndex);
    }

    private finalizeBVH() {
        for (let i = 0; i < this.mesh.bvh.nodesUsed; ++i) {
            let nodeToUpload = this.mesh.bvh.nodes[i];
            if (nodeToUpload.primitiveCount == 0) {
                nodeToUpload.leftChild += this.tlasNodesMax;
            }
            
            this.nodes[this.tlasNodesMax + i] = nodeToUpload;
        }
    }
}