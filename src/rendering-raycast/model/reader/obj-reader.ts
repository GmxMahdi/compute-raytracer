import { vec2, vec3 } from "gl-matrix";
import { Triangle } from "../triangle";
import { ObjectReaderDescriptor } from "./obj-reader-descriptior";

export class ObjectReader {
    private static color: vec3;
    private static v: vec3[]
    private static vt: vec2[]
    private static vn: vec3[]

    private static mins: vec3 = [0, 0, 0];
    private static maxs: vec3 = [0, 0, 0];
    private static offsets: vec3 = [0, 0, 0];

    private static alignBottom = false;
    private static scale : number = 1;

    private static xIndex = 0;
    private static yIndex = 1;
    private static zIndex = 2;


    static async loadMeshFromObjFile(
        url: string, 
        descriptor: ObjectReaderDescriptor) {

        this.color = descriptor.color;

        // Alignment settings
        let invertYZ = descriptor.invertYZ ? descriptor.invertYZ.valueOf() : false;
        this.alignBottom = descriptor.alignBottom ? descriptor.alignBottom.valueOf() : false;
        this.scale = descriptor.scale ? descriptor.scale.valueOf() : 1;

        if (invertYZ) {
            this.yIndex = 2;
            this.zIndex = 1;
        }
        else {
            this.yIndex = 1;
            this.zIndex = 2;
        }

        return await this.createMeshFromFile(url);
    }

    private static async createMeshFromFile(url: string): Promise<Triangle[]> {
        // Clear buffers
        this.v = [];
        this.vt = [];
        this.vn = [];
        let triangles: Triangle[] = [];

        const response: Response = await fetch(url);
        const blob: Blob = await response.blob();
        const fileContent = await blob.text();
        const lines = fileContent.split('\n');

        this.initMinMax(lines);

        for (const line of lines) {
            if      (line[0] === 'v' && line[1] === ' ') this.readVertexLine(line);
            else if (line[0] === 'v' && line[1] === 't') this.readTexcoordLine(line);
            else if (line[0] === 'v' && line[1] === 'n') this.readNormalLine(line);
            else if (line[0] === 'f') this.addTriangleFromFaceData(line, triangles);
        }

        // Clear buffers
        this.v = [];
        this.vt = [];
        this.vn = [];

        return triangles;
    }

    private static readVertexLine(line: string) {
        const components = line.split(' ');
        const newVertex: vec3 = [
            parseFloat(components[1 + this.xIndex]),
            parseFloat(components[1 + this.yIndex]),
            parseFloat(components[1 + this.zIndex]),
        ]
        vec3.subtract(newVertex, newVertex, this.offsets);
        vec3.mul(newVertex, newVertex, [this.scale, this.scale, this.scale]);

        this.v.push(newVertex);
    }

    private static readTexcoordLine(line: string) {
        const components = line.split(' ');
        const newTexcoord: vec2 = [
            parseFloat(components[1]),
            parseFloat(components[2]),
        ]
        this.vt.push(newTexcoord);
    }

    private static readNormalLine(line: string) {
        const components = line.split(' ');
        const newNormal: vec3 = [
            parseFloat(components[1 + this.xIndex]),
            parseFloat(components[1 + this.yIndex]),
            parseFloat(components[1 + this.zIndex]),
        ]
        this.vn.push(newNormal);
    }

    private static addTriangleFromFaceData(line: string, triangles: Triangle[]) {
        line = line.replace('\n', '');
        const vertexDescriptions = line.split(' ');
        const triangleCount = vertexDescriptions.length -3;

        for (let i = 0; i < triangleCount; ++i) {
            let triangle: Triangle = new Triangle();
            triangle.color = this.color;
            this.readCorner(vertexDescriptions[1], triangle);
            this.readCorner(vertexDescriptions[this.yIndex + 1 + i], triangle);
            this.readCorner(vertexDescriptions[this.zIndex + 1 + i], triangle);
            triangle.calculateCentroid();
            triangles.push(triangle);
        }
    }

    private static readCorner(vertexDescription: string, triangle: Triangle) {
        const v_vt_vn = vertexDescription.split('/');

        const v = this.v[parseInt(v_vt_vn[0]) -1];
        const vt = this.vt[parseInt(v_vt_vn[1]) -1];
        const vn = this.vn[parseInt(v_vt_vn[2]) -1];

        triangle.corners.push(v);
        triangle.normals.push(vn);
    }

    // Center vertexes on geometric center
    private static initMinMax(lines: string[]) {
        for (const line of lines) {
            if (line[0] === 'v' && line[1] === ' ') {
                const components = line.split(' ');
                this.mins = [
                    parseFloat(components[1]),
                    parseFloat(components[2]),
                    parseFloat(components[3])
                ]
                this.maxs = vec3.clone(this.mins);
                break;
            }
        }

        for (const line of lines) {
            if (line[0] === 'v' && line[1] === ' ') {
                const components = line.split(' ');
                let x = parseFloat(components[1 + this.xIndex]);
                let y = parseFloat(components[1 + this.yIndex]);
                let z = parseFloat(components[1 + this.zIndex]);

                if (x < this.mins[this.xIndex]) this.mins[this.xIndex] = x;
                if (y < this.mins[this.yIndex]) this.mins[this.yIndex] = y;
                if (z < this.mins[this.zIndex]) this.mins[this.zIndex] = z;
                if (x > this.maxs[this.xIndex]) this.maxs[this.xIndex] = x;
                if (y > this.maxs[this.yIndex]) this.maxs[this.yIndex] = y;
                if (z > this.maxs[this.zIndex]) this.maxs[this.zIndex] = z;
            }
        }
        
        // offset = min + (max - min) / 2 = min/2 + max/2
        this.offsets = vec3.add(vec3.create(), this.mins, this.maxs);
        vec3.div(this.offsets, this.offsets, [2, 2, 2]);
        if (this.alignBottom) this.offsets[this.yIndex] = this.mins[this.yIndex]; 
    }
}