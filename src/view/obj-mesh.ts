import { vec2, vec3 } from "gl-matrix";
import { Triangle } from "../model/raycast/triangle";

export class ObjectMesh {

    vertexCount: number

    private v: vec3[]
    private vt: vec2[]
    private vn: vec3[]
    
    
    triangles: Triangle[];
    color: vec3;

    private minX = 0;
    private minY = 0;
    private minZ = 0;

    private maxX = 0;
    private maxY = 0;
    private maxZ = 0;

    private offsetX = 0;
    private offsetY = 0;
    private offsetZ = 0;

    private invertYZ = false;
    private alignBottom = false;
    private scale : number = 1;

    private xIndex = 0;
    private yIndex = 1;
    private zIndex = 2;

    constructor() {
        this.v = [];
        this.vt = [];
        this.vn = [];
        this.triangles = [];
    }

    async initialize(
        url: string, 
        color: vec3, 
        invertYZ: boolean = false, 
        alignBottom: boolean = false, 
        scale: number = 1) {

        this.color = color;

        // Alignment settings
        this.invertYZ = invertYZ
        this.alignBottom = alignBottom;
        this.scale = scale;
        if (invertYZ) {
            this.yIndex = 2;
            this.zIndex = 1;
        }

        await this.createMeshFromFile(url);
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
            (parseFloat(components[1]) - this.offsetX) * this.scale,
            (parseFloat(components[2]) - this.offsetY) * this.scale,
            (parseFloat(components[3]) - this.offsetZ) * this.scale,
        ]
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
            parseFloat(components[1]),
            parseFloat(components[2]),
            parseFloat(components[3]),
        ]
        this.vn.push(newNormal);
    }

    private readFaceLine(line: string, result: number[]) {
        line = line.replace('\n', '');
        const vertexDescriptions = line.split(' ');
        const triangleCount = vertexDescriptions.length -3;

        for (let i = 0; i < triangleCount; ++i) {
            const cA = this.readCorner(vertexDescriptions[1], result);
            const cB = this.readCorner(vertexDescriptions[2 + i], result);
            const cC = this.readCorner(vertexDescriptions[3 + i], result);

            let triangle: Triangle = new Triangle([cA, cB, cC], this.color);
            this.triangles.push(triangle);
        }
    }

    private readCorner(vertexDescription: string, result: number[]): vec3 {
        const v_vt_vn = vertexDescription.split('/');

        const v = this.v[parseInt(v_vt_vn[0]) -1];
        const vt = this.vt[parseInt(v_vt_vn[1]) -1];
        const vn = this.v[parseInt(v_vt_vn[2]) -1];
        
        return v;
    }

    // Center vertexes on geometric center
    private initMinMax(lines: string[]) {
        for (const line of lines) {
            if (line[0] === 'v' && line[1] === ' ') {
                const components = line.split(' ');
                this.minX = parseFloat(components[1]);
                this.minY = parseFloat(components[2]);
                this.minZ = parseFloat(components[3]);
                this.maxX = this.minX;
                this.maxY = this.minZ;
                this.maxZ = this.maxZ;
                break;
            }
        }

        for (const line of lines) {
            if (line[0] === 'v' && line[1] === ' ') {
                const components = line.split(' ');
                let x = parseFloat(components[1]);
                let y = parseFloat(components[2]);
                let z = parseFloat(components[3]);
                if (x < this.minX) this.minX = x;
                if (y < this.minY) this.minY = y;
                if (z < this.minZ) this.minZ = z;
                if (x > this.maxX) this.maxX = x;
                if (y > this.maxY) this.maxY = y;
                if (z > this.maxZ) this.maxZ = z;
            }
        }

        this.offsetX = this.minX + (this.maxX - this.minX) / 2;
        this.offsetY = this.minY + (this.maxY - this.minY) / 2;
        this.offsetZ = this.minZ + (this.maxZ - this.minZ) / 2;

        if (this.alignBottom &&  !this.invertYZ) this.offsetY = this.minY;
        if (this.alignBottom &&  this.invertYZ) this.offsetZ = this.minZ; 
    }
}