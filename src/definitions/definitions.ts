import { mat4 } from "gl-matrix";

export enum ObjectTypes {
    TRIANGLE,
    QUAD
}

export enum PipelineType {
    SKY,
    STANDARD
}

export interface RenderData {
    viewTransform: mat4;
    modelTranforms: Float32Array;
    objectCounts: {[obj in ObjectTypes]: number}
}