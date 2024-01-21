import { vec3 } from "gl-matrix";

export interface Light {
    position: vec3;
    lightIntensity: number;
    minIntensity: number;
}