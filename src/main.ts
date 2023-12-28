import { App } from "./app";

if (!navigator.gpu) {
    document.body.innerHTML = '<h1 style="color: white">This browser cannot support WebGPU yet :(.</h1>'
    throw("This browser cannot support WebGPU");
}

const canvas : HTMLCanvasElement =  <HTMLCanvasElement> document.getElementById('gfx');
const app = new App(canvas);
await app.initialize();
app.run();