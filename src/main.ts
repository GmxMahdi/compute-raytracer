import { Renderer } from "./renderer";
import shader from "./shaders/shader.wgsl?raw";
import { TriangleMesh } from "./triangle-mesh";

const outputLabel : HTMLElement = <HTMLElement> document.getElementById('compatibility-check');

if (!navigator.gpu) {
    outputLabel.innerText = 'This browser cannot support WebGPU';
    throw("This browser cannot support WebGPU");
}

const canvas : HTMLCanvasElement =  <HTMLCanvasElement> document.getElementById('gfx');
const renderer = new Renderer(canvas);
renderer.Initialize();