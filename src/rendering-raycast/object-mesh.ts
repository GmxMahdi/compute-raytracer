import { Triangle } from "./model/triangle";
import { ObjectReaderDescriptor } from "./model/reader/obj-reader-descriptior";
import { ObjectReader } from "./model/reader/obj-reader";
import { BVH } from "./acceleration/bvh";
import { vec3 } from "gl-matrix";

export class ObjectMesh {    
    color: vec3;
    triangles: Triangle[];
    bvh: BVH;

    constructor() {}

    async initialize(
        url: string, 
        descriptor: ObjectReaderDescriptor) {
        this.triangles = await ObjectReader.loadMeshFromObjFile(url, descriptor);
        this.bvh = new BVH(this.triangles);
    }
}