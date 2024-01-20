import { vec4 } from "gl-matrix";

export interface ObjectReaderDescriptor {
    color: vec4, 
    invertYZ?: boolean, 
    alignBottom?: boolean, 
    scale?: number
}