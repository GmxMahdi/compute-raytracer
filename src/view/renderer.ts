import skyboxShader from './shaders/sky-shader.wgsl?raw';
import shader from "./shaders/shader.wgsl?raw";
import { Material } from "./material";
import { ObjectMesh } from "./obj-mesh";
import { TriangleMesh } from "./triangle-mesh";
import { QuadMesh } from "./quad-mesh";
import {mat4} from 'gl-matrix';
import { ObjectTypes, RenderData, PipelineType } from "../definitions/definitions";   

import imgURLmoxxie from '../images/moxxie.jpg';
import imgURLchecker from '../images/checker.jpg';
import objURLchair from '../models/cat.obj?url';
import imgURLskybox from '../images/space-skybox.png';
import { CubemapMaterial } from "./cubemap-material";
import { Camera } from '../model/camera';



export class Renderer {

    width: number = 1100;
    height: number = 600;
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
    
    pipelines: Record<PipelineType, GPURenderPipeline | null>;
    frameGroupLayouts: Record<PipelineType, GPUBindGroupLayout | null>;
    frameBindGroups: Record<PipelineType, GPUBindGroup | null>;
    materialGroupLayout: GPUBindGroupLayout;

    // Depth stencil
    depthStencilState: GPUDepthStencilState;
    depthStencilBuffer: GPUTexture;
    depthStencilView: GPUTextureView;
    depthStencilAttatchment: GPURenderPassDepthStencilAttachment;


    // Assets
    skyboxMaterial : CubemapMaterial;
    triangleMaterial: Material;
    triangleMesh: TriangleMesh;
    quadMaterial: Material;
    quadMesh: QuadMesh;
    chairMesh: ObjectMesh;
    objectBuffer: GPUBuffer;
    parameterBuffer: GPUBuffer;


    constructor(canvas: HTMLCanvasElement){
        this.canvas = canvas;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

   async initialize() {
        await this.setupDevice();

        await this.makeBindGroupLayouts();

        await this.createAssets();

        await this.makeDepthBufferResources();
    
        await this.makePipeline();

        await this.makeBindGroups();

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

        this.chairMesh = new ObjectMesh();
        await this.chairMesh.initialize(this.device, objURLchair, /*invertYZ*/ false, /*alignBottom*/ true, /*scale*/0.02);
        
        this.skyboxMaterial = new CubemapMaterial();
        await this.skyboxMaterial.intiialize(this.device, imgURLskybox);

        this.uniformBuffer = this.device.createBuffer({
            size: 64 * 2,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.objectBuffer = this.device.createBuffer({
            size: 64 * 1024, // Each mat4x4 is 64 byte, gold 1024 of them
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        this.parameterBuffer = this.device.createBuffer({
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        await this.triangleMaterial.initialize(this.device, imgURLmoxxie, this.materialGroupLayout);
        await this.quadMaterial.initialize(this.device, imgURLchecker, this.materialGroupLayout);

    }

    async makeBindGroupLayouts() {
        this.frameGroupLayouts = {
            [PipelineType.SKY]: null,
            [PipelineType.STANDARD]: null,
        };

        this.frameGroupLayouts[PipelineType.SKY] = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "uniform",
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {
                        viewDimension: "cube",
                    }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
            ]

        });
        
        this.frameGroupLayouts[PipelineType.STANDARD] = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: 'read-only-storage',
                        hasDynamicOffset: false
                    }
                }
            ],
        });

        this.materialGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
            ],
        });
    }

    async makeBindGroups() {
        this.frameBindGroups = {
            [PipelineType.SKY]: null,
            [PipelineType.STANDARD]: null,
        };

        this.frameBindGroups[PipelineType.SKY] = this.device.createBindGroup({
            layout: this.frameGroupLayouts[PipelineType.SKY],
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.parameterBuffer,
                    }
                },
                {
                    binding: 1,
                    resource: this.skyboxMaterial.view
                },
                {
                    binding: 2,
                    resource: this.skyboxMaterial.sampler
                }
            ]
        });

        this.frameBindGroups[PipelineType.STANDARD] = this.device.createBindGroup({
            layout: this.frameGroupLayouts[PipelineType.STANDARD],
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer
                    }
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.objectBuffer
                    }
                }
            ],
        });
    }

    async makePipeline() {
        this.pipelines = {
            [PipelineType.SKY]: null,
            [PipelineType.STANDARD]: null,
        };

        let pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.frameGroupLayouts[PipelineType.STANDARD], 
                this.materialGroupLayout]
        });
    
        this.pipelines[PipelineType.STANDARD] = this.device.createRenderPipeline({
            vertex : {
                module : this.device.createShaderModule({
                    code : shader
                }),
                entryPoint : "vs_main",
                buffers: [this.triangleMesh.bufferLayout]
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

        pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.frameGroupLayouts[PipelineType.SKY],
            ]
        });
        this.pipelines[PipelineType.SKY] = this.device.createRenderPipeline({
            vertex : {
                module : this.device.createShaderModule({
                    code : skyboxShader
                }),
                entryPoint : "skyVertMain"
            },
    
            fragment : {
                module : this.device.createShaderModule({
                    code : skyboxShader
                }),
                entryPoint : "skyFragMain",
                targets : [{
                    format : this.format
                }]
            },
    
            primitive : {
                topology : "triangle-list"
            },
    
            layout: pipelineLayout,
            depthStencil: this.depthStencilState,
        });
    }

    async prepareScene(renderables: RenderData, camera: Camera) {
        //make transforms
        const projection = mat4.create();
        mat4.perspective(projection, Math.PI/4, this.width/this.height, 0.1, 10);

        const view = renderables.viewTransform;

        this.device.queue.writeBuffer(
            this.objectBuffer, 0, 
            renderables.modelTranforms, 0, 
            renderables.modelTranforms.length
        );
        this.device.queue.writeBuffer(this.uniformBuffer, 0, <ArrayBuffer>view); 
        this.device.queue.writeBuffer(this.uniformBuffer, 64, <ArrayBuffer>projection); 

        const dy = Math.tan(Math.PI/8);
        const dx = dy * this.width / this.height;

        this.device.queue.writeBuffer(
            this.parameterBuffer, 0,
            new Float32Array(
                [
                    camera.forwards[0],
                    camera.forwards[1],
                    camera.forwards[2],
                    0.0,
                    dx * camera.right[0],
                    dx * camera.right[1],
                    dx * camera.right[2],
                    0.0,
                    dy * camera.up[0],
                    dy * camera.up[1],
                    dy * camera.up[2],
                    0.0
                ]
            ), 0, 12
        )
    }



    async render(renderables: RenderData, camera: Camera) {

        this.prepareScene(renderables, camera);

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

        ////// SKYBOX PIPELINE /////
        renderpass.setPipeline(this.pipelines[PipelineType.SKY]);
        renderpass.setBindGroup(0, this.frameBindGroups[PipelineType.SKY]);
        renderpass.setBindGroup(1, this.quadMaterial.bindGroup); 
        renderpass.draw(6, 1, 0, 0);

        ////// STANDARD PIPELINE //////
        renderpass.setPipeline(this.pipelines[PipelineType.STANDARD]);
        renderpass.setBindGroup(0, this.frameBindGroups[PipelineType.STANDARD]);

        let objectsDrawn: number = 0;

        // Triangles
        renderpass.setBindGroup(1, this.triangleMaterial.bindGroup);
        renderpass.setVertexBuffer(0, this.triangleMesh.buffer);
        renderpass.draw(
            3, renderables.objectCounts[ObjectTypes.TRIANGLE], 
            0, objectsDrawn
        );
        objectsDrawn += renderables.objectCounts[ObjectTypes.TRIANGLE];

        // Quads
        renderpass.setBindGroup(1, this.quadMaterial.bindGroup);
        renderpass.setVertexBuffer(0, this.quadMesh.buffer);
        renderpass.draw(
            6, renderables.objectCounts[ObjectTypes.QUAD], 
            0, objectsDrawn
        );
        objectsDrawn += renderables.objectCounts[ObjectTypes.QUAD];

        // Statue
        renderpass.setBindGroup(1, this.triangleMaterial.bindGroup);
        renderpass.setVertexBuffer(0, this.chairMesh.buffer);
        renderpass.draw(
            this.chairMesh.vertexCount, 1, 
            0, objectsDrawn
        );
        objectsDrawn += 1;

        renderpass.end();
    
        this.device.queue.submit([commandEncoder.finish()]);
    }
}