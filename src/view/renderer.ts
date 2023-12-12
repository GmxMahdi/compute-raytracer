import shader from "./shaders/shader.wgsl?raw";
import { Material } from "./material";
import { TriangleMesh } from "./triangle-mesh";
import { QuadMesh } from "./quad-mesh";
import {mat4} from 'gl-matrix';
import { ObjectTypes, RenderData } from "../definitions/definitions";   

import imgURLmoxxie from '../images/moxxie.jpg';
import imgURLchecker from '../images/checker.jpg';


export class Renderer {

    width: number = 1200;
    height: number = 800;
    canvas: HTMLCanvasElement;

    dt: number = 0;
    lastTimeElasped: number = 0;

    // Device/Context objects
    adapter: GPUAdapter;
    device: GPUDevice;
    context: GPUCanvasContext;
    format : GPUTextureFormat;

    // Pipeline objects
    uniformBuffer: GPUBuffer;
    triangleBindGroup: GPUBindGroup;
    quadBindGroup: GPUBindGroup;
    pipeline: GPURenderPipeline;

    // Depth stencil
    depthStencilState: GPUDepthStencilState;
    depthStencilBuffer: GPUTexture;
    depthStencilView: GPUTextureView;
    depthStencilAttatchment: GPURenderPassDepthStencilAttachment;


    // Assets
    triangleMaterial: Material;
    triangleMesh: TriangleMesh;
    quadMaterial: Material;
    quadMesh: QuadMesh;
    objectBuffer: GPUBuffer;


    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

   async initialize() {
        await this.setupDevice();

        await this.createAssets();

        await this.makeDepthBufferResources();
    
        await this.makePipeline();
    }

    async setupDevice() {

        //adapter: wrapper around (physical) GPU.
        //Describes features and limits
        this.adapter = <GPUAdapter> await navigator.gpu?.requestAdapter();
        //device: wrapper around GPU functionality
        //Function calls are made through the device
        this.device = <GPUDevice> await this.adapter?.requestDevice();
        //context: similar to vulkan instance (or OpenGL context)
        this.context = <GPUCanvasContext> this.canvas.getContext("webgpu");
        this.format = "bgra8unorm";
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "opaque"
        });

    }

    async makeDepthBufferResources() {
        this.depthStencilState = {
            format: 'depth24plus-stencil8',
            depthWriteEnabled: true,
            depthCompare: 'less-equal',
        };

        const size: GPUExtent3D = {
            width: this.canvas.width,
            height: this.canvas.height,
            depthOrArrayLayers: 1,
        };

        const depthBufferDescriptor: GPUTextureDescriptor = {
            size,
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        }
        this.depthStencilBuffer = this.device.createTexture(depthBufferDescriptor);

        const viewDescriptor: GPUTextureViewDescriptor = {
            format: 'depth24plus-stencil8',
            dimension: '2d',
            aspect: 'all'
        };
        this.depthStencilView = this.depthStencilBuffer.createView(viewDescriptor);

        this.depthStencilAttatchment = {
            view: this.depthStencilView,
            depthClearValue: 1.0,

            depthLoadOp: 'clear',
            depthStoreOp: 'store',

            stencilLoadOp: 'clear',
            stencilStoreOp: 'discard'
        };
    }

    async createAssets() {
        this.triangleMaterial = new Material();
        this.triangleMesh = new TriangleMesh(this.device);

        this.quadMaterial = new Material();
        this.quadMesh = new QuadMesh(this.device);

        const modelBufferDescriptor: GPUBufferDescriptor = {
            size: 64 * 1024, // Each mat4x4 is 64 byte, gold 1024 of them
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        };
        this.objectBuffer = this.device.createBuffer(modelBufferDescriptor);

        await this.triangleMaterial.initialize(this.device, imgURLmoxxie);
        await this.quadMaterial.initialize(this.device, imgURLchecker);

    }

    async makePipeline() {

        this.uniformBuffer = this.device.createBuffer({
            size: 64 * 2,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        const bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: 'read-only-storage'
                    }
                }
            ],
        });
    
        this.triangleBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer
                    }
                },
                {
                    binding: 1,
                    resource: this.triangleMaterial.view
                },
                {
                    binding: 2,
                    resource: this.triangleMaterial.sampler
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.objectBuffer
                    }
                }
            ]
        });

        this.quadBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer
                    }
                },
                {
                    binding: 1,
                    resource: this.quadMaterial.view
                },
                {
                    binding: 2,
                    resource: this.quadMaterial.sampler
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.objectBuffer
                    }
                }
            ]
        });
        
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });
    
        this.pipeline = this.device.createRenderPipeline({
            vertex : {
                module : this.device.createShaderModule({
                    code : shader
                }),
                entryPoint : "vs_main",
                buffers: [this.triangleMesh.bufferLayout,]
            },
    
            fragment : {
                module : this.device.createShaderModule({
                    code : shader
                }),
                entryPoint : "fs_main",
                targets : [{
                    format : this.format
                }]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: pipelineLayout,
            depthStencil: this.depthStencilState
        });

    }



    async render(renderables: RenderData) {

        const projection= mat4.create();
        mat4.perspective(projection, Math.PI / 4, this.width / this.height, 0.1, 10);

        const view = renderables.viewTransform;

        this.device.queue.writeBuffer(
            this.objectBuffer, 0, 
            renderables.modelTranforms, 0, 
            renderables.modelTranforms.length);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, <ArrayBuffer>view);
        this.device.queue.writeBuffer(this.uniformBuffer, 64, <ArrayBuffer>projection);


        //command encoder: records draw commands for submission
        const commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();
        //texture view: image view to the color buffer in this case
        const textureView : GPUTextureView = this.context.getCurrentTexture().createView();
        //renderpass: holds draw commands, allocated from command encoder
        const renderpass : GPURenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: {r: 0.5, g: 0.0, b: 0.25, a: 1.0},
                loadOp: "clear",
                storeOp: "store"
            }],
            depthStencilAttachment: this.depthStencilAttatchment
        });

        renderpass.setPipeline(this.pipeline);

        let objectsDrawn: number = 0;

        // Triangles
        renderpass.setVertexBuffer(0, this.triangleMesh.buffer);
        renderpass.setBindGroup(0, this.triangleBindGroup);
        renderpass.draw(
            3, renderables.objectCounts[ObjectTypes.TRIANGLE], 
            0, objectsDrawn
        );
        objectsDrawn += renderables.objectCounts[ObjectTypes.TRIANGLE];

        // Quads
        renderpass.setVertexBuffer(0, this.quadMesh.buffer);
        renderpass.setBindGroup(0, this.quadBindGroup);
        renderpass.draw(
            6, renderables.objectCounts[ObjectTypes.QUAD], 
            0, objectsDrawn
        );
        objectsDrawn += renderables.objectCounts[ObjectTypes.QUAD];
        
        renderpass.end();
    
        this.device.queue.submit([commandEncoder.finish()]);
    }
}