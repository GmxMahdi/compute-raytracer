import { SceneRaytracing } from './scene-raytracing';
import { CubemapMaterial } from '../material/cubemap-material';
import shaderRaytracerKernel from './shaders/raytracer-kernel.wgsl?raw';
import shaderHeatmapKernel from './shaders/heatmap-kernel.wgsl?raw';
import shaderScreen from './shaders/screen-shader.wgsl?raw';
import urlSkybox from '../assets/images/daylight-skybox.png';
import urlMouseyTexture from '../assets/models/mousey/mousey_Diffuse.png';
import { Material } from '../material/material';




export class RendererRaytracing {

    private width: number = 900;
    private height: number = 600;
    private canvas: HTMLCanvasElement;

    // Device/Context objects
    private adapter: GPUAdapter;
    private device: GPUDevice;
    private context: GPUCanvasContext;
    private format : GPUTextureFormat;


    // Assets
    private colorBuffer: GPUTexture;
    private colorBufferView: GPUTextureView;
    private sampler: GPUSampler;
    private sceneParameters: GPUBuffer;
    private triangleBuffer: GPUBuffer;
    private mouseyMaterial: Material;
    private skyboxMaterial : CubemapMaterial;
    
    private nodeBuffer: GPUBuffer;
    private blasBuffer: GPUBuffer;
    private blasIndexBuffer: GPUBuffer
    private triangleIndexBuffer: GPUBuffer;

    // Pipeline Objects
    private selectedComputePipeline: GPUComputePipeline; // Reference to one of the pipelines
    private heatmapPipeline: GPUComputePipeline;
    private raytracingPipeline: GPUComputePipeline;
    private computeBindGroup: GPUBindGroup;

    private renderPipeline: GPURenderPipeline;
    private renderBindGroup: GPUBindGroup;

    // Scene
    private scene: SceneRaytracing;
    private loaded: boolean = false;

    constructor(canvas: HTMLCanvasElement, width: number, height: number, scene: SceneRaytracing){
        this.scene = scene;
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

   async initialize() {
        await this.setupDevice();

        await this.createAssets();
    
        await this.makePipeline();
    }

    showRaytracer() {
        this.selectedComputePipeline = this.raytracingPipeline;
    }

    showHeatmap() {
        this.selectedComputePipeline = this.heatmapPipeline;
    }

    private async setupDevice() {

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

    private async createAssets() {
        this.skyboxMaterial = new CubemapMaterial();
        await this.skyboxMaterial.intiialize(this.device, urlSkybox);
        this.colorBuffer = this.device.createTexture({
            size: {
                width: this.canvas.width,
                height: this.canvas.height
            },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        this.colorBufferView = this.colorBuffer.createView();

        this.mouseyMaterial = new Material();
        await this.mouseyMaterial.initialize(this.device, urlMouseyTexture);

        this.sampler = this.device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            magFilter: 'linear',
            minFilter: 'nearest',
            mipmapFilter: 'nearest'
        });

        this.sceneParameters = this.device.createBuffer({
            size: 96,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM
        });

        this.triangleBuffer = this.device.createBuffer({
            size: 160 * this.scene.triangles.length,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })

        this.triangleIndexBuffer = this.device.createBuffer({
            size: 4 * this.scene.triangles.length,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });
    
        this.blasBuffer = this.device.createBuffer({
            size: 80 * this.scene.blasList.length,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });

        this.blasIndexBuffer = this.device.createBuffer({
            size: 4 * this.scene.blasIndices.length,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });

        this.nodeBuffer = this.device.createBuffer({
            size: 32 * this.scene.nodes.length,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        });
    }

    private recalculateScene() {
        // Scene parameters
        const maxBounces: number = 4;
        const sceneParametersData = new Float32Array(24);
        sceneParametersData.set(this.scene.camera.position, 0);
        sceneParametersData.set(this.scene.camera.forwards, 4);
        sceneParametersData.set(this.scene.camera.right, 8);
        sceneParametersData.set(this.scene.camera.up, 12);
        sceneParametersData.set(this.scene.light.position, 16);
        sceneParametersData.set([this.scene.light.lightIntensity, this.scene.light.minIntensity, maxBounces], 19);
        this.device.queue.writeBuffer(this.sceneParameters, 0, sceneParametersData);


        // BLAS Data
        const blasData: Float32Array = new Float32Array(20 * this.scene.blasList.length);
        for (let i = 0; i < this.scene.blasList.length; ++i) {
            blasData.set(this.scene.blasList[i].inverseModel, 20 * i);
            blasData.set([this.scene.blasList[i].rootNodeIndex], 20 * i + 16);
        }
        this.device.queue.writeBuffer(this.blasBuffer, 0, blasData, 0, 20 * this.scene.blasList.length);

        // BLAS Indexes
        const blasIndexData: Float32Array = new Float32Array(this.scene.blasIndices.length);
        for (let i = 0; i < this.scene.blasIndices.length; ++i) {
            blasIndexData[i] = this.scene.blasIndices[i];
        }
        this.device.queue.writeBuffer(this.blasIndexBuffer, 0, blasIndexData, 0, this.scene.blasIndices.length);

        // TLAS
        const nodeDataA = new Float32Array(8 * this.scene.tlasNodesUsed);
        for (let i = 0; i < this.scene.tlasNodesUsed; ++i) {
            let loc = 8 * i;
            nodeDataA.set(this.scene.nodes[i].minCorner, loc);
            nodeDataA.set(this.scene.nodes[i].maxCorner, loc + 4);
            nodeDataA[loc + 3] = this.scene.nodes[i].leftChildIndex;
            nodeDataA[loc + 7] = this.scene.nodes[i].primitiveCount;
        }
        this.device.queue.writeBuffer(this.nodeBuffer, 0, nodeDataA, 0, 8 * this.scene.tlasNodesUsed);

        if (this.loaded) return;
        this.loaded = true;

        // Triangles
        const triangleData: Float32Array = new Float32Array(40 * this.scene.triangles.length);
        for (let i = 0; i < this.scene.triangles.length; i++) {
            const loc = 40 * i;
            const triangles = this.scene.triangles[i];
            for (var corner = 0; corner < 3; corner++) {
                triangleData.set(triangles.corners[corner], loc + 12 * corner);
                triangleData.set(triangles.normals[corner], loc + 12 * corner + 4);
                triangleData.set(triangles.textures[corner], loc + 12 * corner + 8);
            }
            triangleData.set(triangles.color, loc + 36);
        }
        this.device.queue.writeBuffer(this.triangleBuffer, 0, triangleData, 0, 40 * this.scene.triangles.length);

        // BLAS Nodes
        const nodeDataB = new Float32Array(8 * this.scene.blasNodesUsed);
        for (let i = 0; i < this.scene.blasNodesUsed; ++i) {
            const baseIndex: number = this.scene.tlasNodesMax + i;
            const node = this.scene.nodes[baseIndex];
            const loc = 8 * i;
            nodeDataB.set(node.minCorner, loc + 0);
            nodeDataB.set([node.leftChildIndex], loc + 3);
            nodeDataB.set(node.maxCorner, loc + 4);
            nodeDataB.set([node.primitiveCount], loc + 7);
        }
        let bufferOffset: number = 32 * this.scene.tlasNodesMax;
        this.device.queue.writeBuffer(this.nodeBuffer, bufferOffset, nodeDataB, 0, 8 * this.scene.blasNodesUsed);

        const triangleIndexData = new Float32Array(this.scene.triangleIndices.length);
        for (let i = 0; i < this.scene.triangleIndices.length; ++i) {
            triangleIndexData[i] = this.scene.triangleIndices[i];
        }
        this.device.queue.writeBuffer(this.triangleIndexBuffer, 0, triangleIndexData, 0, this.scene.triangleIndices.length);
    }

    private async makePipeline() {

        // Raytracing Kernel
        let computeBindGroupLayout = this.device.createBindGroupLayout({
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
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage', hasDynamicOffset: false}
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage', hasDynamicOffset: false}
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage', hasDynamicOffset: false}
                },
                {
                    binding: 6,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'read-only-storage', hasDynamicOffset: false}
                },
                {
                    binding: 7,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: { viewDimension: 'cube' }
                },
                {
                    binding: 8,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: {}
                },
                {
                    binding: 9,
                    visibility: GPUShaderStage.COMPUTE,
                    sampler: {}
                },
            ]
        });

        this.computeBindGroup = this.device.createBindGroup({
            layout: computeBindGroupLayout,
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
                        buffer: this.triangleBuffer
                    }
                },
                {
                    binding: 3,
                    resource: {
                        buffer: this.nodeBuffer
                    }
                },
                {
                    binding: 4,
                    resource: {
                        buffer: this.blasBuffer
                    }
                },
                {
                    binding: 5,
                    resource: {
                        buffer: this.triangleIndexBuffer
                    }
                },
                {
                    binding: 6,
                    resource: {
                        buffer: this.blasIndexBuffer
                    }
                },
                {
                    binding: 7,
                    resource: this.skyboxMaterial.view
                },
                {
                    binding: 8,
                    resource: this.mouseyMaterial.view
                },
                {
                    binding: 9,
                    resource: this.skyboxMaterial.sampler
                }
            ]
        });

        let computePipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [computeBindGroupLayout],
        });

        this.raytracingPipeline = this.device.createComputePipeline({
            layout: computePipelineLayout,
            compute: {
                module: this.device.createShaderModule({
                    code: shaderRaytracerKernel
                }),
                entryPoint: 'main'
            }
        });

        this.heatmapPipeline = this.device.createComputePipeline({
            layout: computePipelineLayout,
            compute: {
                module: this.device.createShaderModule({
                    code: shaderHeatmapKernel
                }),
                entryPoint: 'main'
            }
        });

        this.selectedComputePipeline = this.raytracingPipeline;

        

        // Screen Render
        let renderBindGroupLayout = this.device.createBindGroupLayout({
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
            layout: renderBindGroupLayout,
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

        let renderPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [renderBindGroupLayout],
        });

        this.renderPipeline = this.device.createRenderPipeline({
            layout: renderPipelineLayout,
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
        const performanceStartTime = performance.now();

        this.recalculateScene();

        //command encoder: records draw commands for submission
        const commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();

        const raytracerPass : GPUComputePassEncoder = commandEncoder.beginComputePass();
        raytracerPass.setPipeline(this.selectedComputePipeline);
        raytracerPass.setBindGroup(0, this.computeBindGroup);
        raytracerPass.dispatchWorkgroups(Math.ceil(this.canvas.width / 8), Math.ceil(this.canvas.height / 8), 1);
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

        await this.device.queue.onSubmittedWorkDone();
        let performanceTimeEnd = performance.now();
        document.getElementById('render-time').innerText = (performanceTimeEnd - performanceStartTime).toString() + 'ms';
    }
}