import { SceneRaytracing } from '../model/scene-raytracing';
import shaderRaytracerKernel from './shaders/raytracer-kernel.wgsl?raw';
import shaderScreen from './shaders/screen-shader.wgsl?raw';




export class RendererRaytracing {

    width: number = 800;
    height: number = 600;
    canvas: HTMLCanvasElement;

    dt: number = 0;
    lastTimeElasped: number = 0;

    // Device/Context objects
    adapter: GPUAdapter;
    device: GPUDevice;
    context: GPUCanvasContext;
    format : GPUTextureFormat;


    // Assets
    colorBuffer: GPUTexture;
    colorBufferView: GPUTextureView;
    sampler: GPUSampler;
    sceneParameters: GPUBuffer;
    sphereBuffer: GPUBuffer;

    // Pipeline Objects
    raytracingPipeline: GPUComputePipeline;
    raytracingBindGroup: GPUBindGroup;

    renderPipeline: GPURenderPipeline;
    renderBindGroup: GPUBindGroup;

    // Scene
    scene: SceneRaytracing;


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
        this.scene = new SceneRaytracing();

        this.colorBuffer = this.device.createTexture({
            size: {
                width: this.canvas.width,
                height: this.canvas.height
            },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        this.colorBufferView = this.colorBuffer.createView();

        this.sampler = this.device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            magFilter: 'linear',
            minFilter: 'nearest',
            mipmapFilter: 'nearest'
        });

        this.sceneParameters = this.device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM
        });

        this.sphereBuffer = this.device.createBuffer({
            size: 32 * this.scene.spheres.length,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });
    }

    updateScene() {
        this.device.queue.writeBuffer(this.sceneParameters, 0,
            new Float32Array([
                this.scene.camera.position[0],
                this.scene.camera.position[1],
                this.scene.camera.position[2],
                0.0,
                this.scene.camera.forwards[0],
                this.scene.camera.forwards[1],
                this.scene.camera.forwards[2],
                0.0,
                this.scene.camera.right[0],
                this.scene.camera.right[1],
                this.scene.camera.right[2],
                0.0,
                this.scene.camera.up[0],
                this.scene.camera.up[1],
                this.scene.camera.up[2],
                this.scene.spheres.length
            ]));
        
        const sphereData = new Float32Array(8 * this.scene.spheres.length);
        for (let i = 0; i < this.scene.spheres.length; ++i) {
            sphereData[8 * i + 0] = this.scene.spheres[i].center[0];
            sphereData[8 * i + 1] = this.scene.spheres[i].center[1];
            sphereData[8 * i + 2] = this.scene.spheres[i].center[2];
            sphereData[8 * i + 3] = 0.0;
            sphereData[8 * i + 4] = this.scene.spheres[i].color[0];
            sphereData[8 * i + 5] = this.scene.spheres[i].color[1];
            sphereData[8 * i + 6] = this.scene.spheres[i].color[2];
            sphereData[8 * i + 7] = this.scene.spheres[i].radius;
        }

        this.device.queue.writeBuffer(this.sphereBuffer, 0, sphereData, 0, 8 * this.scene.spheres.length);
    }

    async makePipeline() {

        // Raytracing Kernel
        let bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: 'write-only',
                        format: 'rgba8unorm',
                        viewDimension: '2d'
                    }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' }
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage', hasDynamicOffset: false },
                }
            ]
        });

        this.raytracingBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.colorBufferView
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.sceneParameters
                    }
                },
                {
                    binding: 2,
                    resource: {
                        buffer: this.sphereBuffer
                    }
                }
            ]
        });

        let pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });

        this.raytracingPipeline = this.device.createComputePipeline({
            layout: pipelineLayout,
            compute: {
                module: this.device.createShaderModule({
                    code: shaderRaytracerKernel
                }),
                entryPoint: 'main'
            }
        })

        // Screen Render
        bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                }
            ]
        });

        this.renderBindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: this.sampler
                },
                {
                    binding: 1,
                    resource: this.colorBufferView
                }
            ]
        });

        pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        });

        this.renderPipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: this.device.createShaderModule({
                    code: shaderScreen
                }),
                entryPoint: 'vertMain'
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: shaderScreen
                }),
                entryPoint: 'fragMain',
                targets: [{ format: 'bgra8unorm'}]
            },

            primitive: { topology: 'triangle-list'}
        })
    }

    async render() {
        this.updateScene();

        //command encoder: records draw commands for submission
        const commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();

        const raytracerPass : GPUComputePassEncoder = commandEncoder.beginComputePass();
        raytracerPass.setPipeline(this.raytracingPipeline);
        raytracerPass.setBindGroup(0, this.raytracingBindGroup);
        raytracerPass.dispatchWorkgroups(this.canvas.width, this.canvas.height, 1);
        raytracerPass.end();

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
        });

        renderpass.setPipeline(this.renderPipeline);
        renderpass.setBindGroup(0, this.renderBindGroup);
        renderpass.draw(6, 1, 0, 0);
        renderpass.end();
    
        this.device.queue.submit([commandEncoder.finish()]);
    }
}