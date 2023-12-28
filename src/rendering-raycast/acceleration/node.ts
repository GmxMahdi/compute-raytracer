import { vec3 } from "gl-matrix";

export class Node {
    minCorner: vec3;
    leftChildIndex: number;
    maxCorner: vec3;
    primitiveCount: number;
}