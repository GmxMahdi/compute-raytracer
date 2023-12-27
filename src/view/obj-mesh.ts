import { mat4, vec2, vec3 } from "gl-matrix";
import { Triangle } from "../model/raycast/triangle";
import { deg2rad } from "../utils/more-math";

export class ObjectMesh {    
    triangles: Triangle[];
    color: vec3;
    position: vec3;
    eulers: vec3
    inverseModel: mat4;

    private v: vec3[]
    private vt: vec2[]
    private vn: vec3[]

    private mins: vec3 = [0, 0, 0];
    private maxs: vec3 = [0, 0, 0];
    private offsets: vec3 = [0, 0, 0];

    private alignBottom = false;
    private scale : number = 1;

    private xIndex = 0;
    private yIndex = 1;
    private zIndex = 2;

    constructor(position: vec3, eulers: vec3) {
        this.position = position;
        this.eulers = eulers;
        this.v = [];
        this.vt = [];
        this.vn = [];
        this.triangles = [];
        this.inverseModel = mat4.create();
        this.calculateTransform();
    }

    async initialize(
        url: string, 
        color: vec3, 
        invertYZ: boolean = false, 
        alignBottom: boolean = false, 
        scale: number = 1) {

        this.color = color;

        // Alignment settings
        this.alignBottom = alignBottom;
        this.scale = scale;
        if (invertYZ) {
            this.yIndex = 2;
            this.zIndex = 1;
        }

        await this.createMeshFromFile(url);
        this.calculateTransform();
        console.log(
            this.inverseModel[3], 
            this.inverseModel[7],
            this.inverseModel[11]);
    }

    update(dt: number) {
        this.eulers[1] += dt;
        if (this.eulers[1] > 360) this.eulers[1] -= 360;
        this.calculateTransform();
    }

    private calculateTransform() {
        let model: mat4 = mat4.create();
        //mat4.rotateZ(model, model, deg2rad(this.eulers[2]));
        mat4.translate(model, model, this.position);    
        mat4.rotateY(model, model, deg2rad(this.eulers[1]));
        //mat4.rotateX(model, model, deg2rad(this.eulers[0]));
        mat4.invert(this.inverseModel, model);
    }

    private async createMeshFromFile(url: string) {
        let result: number[] = [];

        const response: Response = await fetch(url);
        const blob: Blob = await response.blob();
        const fileContent = await blob.text();
        const lines = fileContent.split('\n');

        this.initMinMax(lines);

        for (const line of lines) {
            if      (line[0] === 'v' && line[1] === ' ') this.readVertexLine(line);
            else if (line[0] === 'v' && line[1] === 't') this.readTexcoordLine(line);
            else if (line[0] === 'v' && line[1] === 'n') this.readNormalLine(line);
            else if (line[0] === 'f') this.readFaceLine(line, result);
        }
    }

    private readVertexLine(line: string) {
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

    private readTexcoordLine(line: string) {
        const components = line.split(' ');
        const newTexcoord: vec2 = [
            parseFloat(components[1]),
            parseFloat(components[2]),
        ]
        this.vt.push(newTexcoord);
    }

    private readNormalLine(line: string) {
        const components = line.split(' ');
        const newNormal: vec3 = [
            parseFloat(components[1 + this.xIndex]),
            parseFloat(components[1 + this.yIndex]),
            parseFloat(components[1 + this.zIndex]),
        ]
        this.vn.push(newNormal);
    }

    private readFaceLine(line: string, result: number[]) {
        line = line.replace('\n', '');
        const vertexDescriptions = line.split(' ');
        const triangleCount = vertexDescriptions.length -3;

        for (let i = 0; i < triangleCount; ++i) {
            let triangle: Triangle = new Triangle();
            triangle.color = this.color;
            this.readCorner(vertexDescriptions[1], triangle);
            this.readCorner(vertexDescriptions[2 + i], triangle);
            this.readCorner(vertexDescriptions[3 + i], triangle);
            triangle.calculateCentroid();
            this.triangles.push(triangle);
        }
    }

    private readCorner(vertexDescription: string, triangle: Triangle) {
        const v_vt_vn = vertexDescription.split('/');

        const v = this.v[parseInt(v_vt_vn[0]) -1];
        const vt = this.vt[parseInt(v_vt_vn[1]) -1];
        const vn = this.vn[parseInt(v_vt_vn[2]) -1];

        triangle.corners.push(v);
        triangle.normals.push(vn);
    }

    // Center vertexes on geometric center
    private initMinMax(lines: string[]) {
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