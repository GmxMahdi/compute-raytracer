import { vec3 } from "gl-matrix";
import { Node } from "./node";
import { Triangle } from "../model/triangle";
import { surfaceArea } from "../../utils/more-math";

export class BVH {

    nodes: Node[];
    nodesUsed: number = 0;
    minCorner: vec3;
    maxCorner: vec3;

    triangles: Triangle[];
    triangleCount: number;
    triangleIndices: number[];

    constructor(triangles: Triangle[]) {
        this.triangles = triangles;
        this.triangleCount = triangles.length;

        // Initialize impossible min/max bounds
        const MAX_NUMBER = 999999;
        this.minCorner = [MAX_NUMBER, MAX_NUMBER, MAX_NUMBER];
        this.maxCorner = [-MAX_NUMBER, -MAX_NUMBER, -MAX_NUMBER];
        
        this.buildBVH();
    }

    private buildBVH() {

        // Initialize indices
        this.triangleIndices = new Array(this.triangleCount)
        for (var i:number = 0; i < this.triangleCount; i += 1) {
            this.triangleIndices[i] = i;
        }

        // Initialize node tree
        this.nodes = new Array(2 * this.triangles.length - 1);
        for (var i:number = 0; i < 2 * this.triangles.length - 1; i += 1) {
            this.nodes[i] = new Node();
        }

        var root: Node = this.nodes[0];
        root.leftChildIndex = 0;
        root.primitiveCount = this.triangles.length;
        this.nodesUsed += 1

        this.updateBounds(0);
        this.subdivideSAH(0);
    }

    private updateBounds(nodeIndex: number) {
        var node: Node = this.nodes[nodeIndex];
        node.minCorner = [1e30, 1e30, 1e30];
        node.maxCorner = [-1e30, -1e30, -1e30];

        for (var i: number = 0; i < node.primitiveCount; i += 1) {
            const triangle: Triangle = this.triangles[this.triangleIndices[node.leftChildIndex + i]];
            for (const corner of triangle.corners) {
                vec3.min(node.minCorner, node.minCorner, corner);
                vec3.max(node.maxCorner, node.maxCorner, corner);
            }
        }
    }

    private findBestSplit(node: Node): [number, number] {
        const SPLIT_PER_AXIS = 10;
        let bestCost = 1e30;
        let bestAxis = 0;
        let bestSplitPosition = 0;

        for (let axis = 0; axis <= 2; ++axis) {
            for (let noSplit = 1; noSplit < SPLIT_PER_AXIS; ++noSplit) {
                const splitPercent = noSplit / SPLIT_PER_AXIS;
                const splitPosition: number = node.minCorner[axis] * (1 - splitPercent) + node.maxCorner[axis] * splitPercent;
                const cost = this.SAH(node, axis, splitPosition);
                if (cost < bestCost) {
                    bestCost = cost;
                    bestAxis = axis;
                    bestSplitPosition = splitPosition;
                }
            }
        }
        return [bestAxis, bestSplitPosition];
    }

    private SAH(node: Node, axis: number, splitPosition: number) {
        const TRAVERSAL_COST = 1;
        const TRIANGLE_INTERSECTION_COST = 2;

        let minIndex: number = node.leftChildIndex;
        let maxIndex: number = minIndex + node.primitiveCount;

        let nbTrianglesLeft = 0;
        let nbTrianglesRight = 0;
        for (let i = minIndex; i < maxIndex; ++i) {
            if (this.triangles[this.triangleIndices[i]].centroid[axis] < splitPosition) ++nbTrianglesLeft;
            else ++nbTrianglesRight;
        }
        const nodeExtents = vec3.subtract(vec3.create(), node.maxCorner, node.minCorner);

        const leftExtents = vec3.create();
        {
            let splitExtents = vec3.clone(node.maxCorner);
            splitExtents[axis] = splitPosition;
            vec3.subtract(leftExtents, splitExtents, node.minCorner); 
        }

        const rightExtents = vec3.create();
        {
            let splitExtents = vec3.clone(node.minCorner);
            splitExtents[axis] = splitPosition;
            vec3.subtract(rightExtents, node.maxCorner, splitExtents); 
        }

        const nodeSA = surfaceArea(nodeExtents);
        const leftSA = surfaceArea(leftExtents);
        const rightSA = surfaceArea(rightExtents);

        const pA = leftSA / nodeSA;
        const pB = rightSA / nodeSA;

        return TRAVERSAL_COST + (pA * nbTrianglesLeft + pB * nbTrianglesRight) * TRIANGLE_INTERSECTION_COST;
    }

    private subdivideSAH(nodeIndex: number) {

        var node: Node = this.nodes[nodeIndex];

        if (node.primitiveCount < 2) {
            return;
        }

        const [axis, splitPosition] = this.findBestSplit(node);

        var i: number = node.leftChildIndex;
        var j: number = i + node.primitiveCount - 1;

        while (i <= j) {
            if (this.triangles[this.triangleIndices[i]].centroid[axis] < splitPosition) {
                i += 1;
            }
            else {
                var temp: number = this.triangleIndices[i];
                this.triangleIndices[i] = this.triangleIndices[j];
                this.triangleIndices[j] = temp;
                j -= 1;
            }
        }

        var leftCount: number = i - node.leftChildIndex;
        if (leftCount == 0 || leftCount == node.primitiveCount) {
            return;
        }

        const leftChildIndex: number = this.nodesUsed;
        this.nodesUsed += 1;
        const rightChildIndex: number = this.nodesUsed;
        this.nodesUsed += 1;

        this.nodes[leftChildIndex].leftChildIndex = node.leftChildIndex;
        this.nodes[leftChildIndex].primitiveCount = leftCount;

        this.nodes[rightChildIndex].leftChildIndex = i;
        this.nodes[rightChildIndex].primitiveCount = node.primitiveCount - leftCount;

        node.leftChildIndex = leftChildIndex;
        node.primitiveCount = 0;

        this.updateBounds(leftChildIndex);
        this.updateBounds(rightChildIndex);
        this.subdivideSAH(leftChildIndex);
        this.subdivideSAH(rightChildIndex);
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

        var i: number = node.leftChildIndex;
        var j: number = i + node.primitiveCount - 1;

        while (i <= j) {
            if (this.triangles[this.triangleIndices[i]].centroid[axis] < splitPosition) {
                i += 1;
            }
            else {
                var temp: number = this.triangleIndices[i];
                this.triangleIndices[i] = this.triangleIndices[j];
                this.triangleIndices[j] = temp;
                j -= 1;
            }
        }

        var leftCount: number = i - node.leftChildIndex;
        if (leftCount == 0 || leftCount == node.primitiveCount) {
            return;
        }

        const leftChildIndex: number = this.nodesUsed;
        this.nodesUsed += 1;
        const rightChildIndex: number = this.nodesUsed;
        this.nodesUsed += 1;

        this.nodes[leftChildIndex].leftChildIndex = node.leftChildIndex;
        this.nodes[leftChildIndex].primitiveCount = leftCount;

        this.nodes[rightChildIndex].leftChildIndex = i;
        this.nodes[rightChildIndex].primitiveCount = node.primitiveCount - leftCount;

        node.leftChildIndex = leftChildIndex;
        node.primitiveCount = 0;

        this.updateBounds(leftChildIndex);
        this.updateBounds(rightChildIndex);
        this.subdivide(leftChildIndex);
        this.subdivide(rightChildIndex);
    }
}