import { vec3 } from "gl-matrix";

export interface ObjectReaderDescriptor {
    color: vec3, 
    invertYZ?: boolean, 
    alignBottom?: boolean, 
    scale?: number
}