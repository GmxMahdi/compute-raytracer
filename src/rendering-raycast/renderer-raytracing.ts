import { SceneRaytracing } from './scene-raytracing';
import { CubemapMaterial } from '../material/cubemap-material';
import shaderRaytracerKernel from './shaders/raytracer-kernel.wgsl?raw';
import shaderScreen from './shaders/screen-shader.wgsl?raw';
import urlSkybox from '../assets/images/daylight-skybox.png';




export class RendererRaytracing {

    width: number = 900;
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
    triangleBuffer: GPUBuffer;
    skyboxMaterial : CubemapMaterial;
    
    nodeBuffer: GPUBuffer;
    blasBuffer: GPUBuffer;
    blasIndexBuffer: GPUBuffer
    triangleIndexBuffer: GPUBuffer;

    // Pipeline Objects
    raytracingPipeline: GPUComputePipeline;
    raytracingBindGroup: GPUBindGroup;

    renderPipeline: GPURenderPipeline;
    renderBindGroup: GPUBindGroup;

    // Scene
    scene: SceneRaytracing;
    loaded: boolean = false;

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

    async createAssets() {
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

        this.triangleBuffer = this.device.createBuffer({
            size: 112 * this.scene.triangles.length,
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

    updateScene() {
        // Scene parameters
        const maxBounces: number = 4;
        const sceneParameterData = new Float32Array(16);
        sceneParameterData.set(this.scene.camera.position, 0);
        sceneParameterData.set(this.scene.camera.forwards, 4);
        sceneParameterData.set(this.scene.camera.right, 8);
        sceneParameterData.set(this.scene.camera.up, 12);
        sceneParameterData.set([maxBounces], 15);
        this.device.queue.writeBuffer(this.sceneParameters, 0, sceneParameterData);


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
        const nodeDataA = new Float32Array(8 * this.scene.nodesUsed);
        for (let i = 0; i < this.scene.nodesUsed; ++i) {
            let loc = 8 * i;
            nodeDataA.set(this.scene.nodes[i].minCorner, loc);
            nodeDataA.set(this.scene.nodes[i].maxCorner, loc + 4);
            nodeDataA[loc + 3] = this.scene.nodes[i].leftChild;
            nodeDataA[loc + 7] = this.scene.nodes[i].primitiveCount;
        }
        this.device.queue.writeBuffer(this.nodeBuffer, 0, nodeDataA, 0, 8 * this.scene.nodesUsed);

        if (this.loaded) return;
        this.loaded = true;

        // Triangles
        const triangleData: Float32Array = new Float32Array(28 * this.scene.triangles.length);
        for (let i = 0; i < this.scene.triangles.length; i++) {
            const loc = 28 * i;
            const triangles = this.scene.triangles[i];
            for (var corner = 0; corner < 3; corner++) {
                triangleData.set(triangles.corners[corner], loc + 8 * corner);
                triangleData.set(triangles.normals[corner], loc + 8 * corner + 4);
            }
            triangleData.set(triangles.color, loc + 24);
        }
        this.device.queue.writeBuffer(this.triangleBuffer, 0, triangleData, 0, 28 * this.scene.triangles.length);

        // BLAS Nodes
        const nodeDataB = new Float32Array(8 * this.scene.mesh.bvh.nodesUsed);
        for (let i = 0; i < this.scene.mesh.bvh.nodesUsed; ++i) {
            const baseIndex: number = this.scene.tlasNodesMax + i;
            const node = this.scene.nodes[baseIndex];
            const loc = 8 * i;
            nodeDataB.set(node.minCorner, loc + 0);
            nodeDataB.set([node.leftChild], loc + 3);
            nodeDataB.set(node.maxCorner, loc + 4);
            nodeDataB.set([node.primitiveCount], loc + 7);
        }
        let bufferOffset: number = 32 * this.scene.tlasNodesMax;
        this.device.queue.writeBuffer(this.nodeBuffer, bufferOffset, nodeDataB, 0, 8 * this.scene.mesh.bvh.nodesUsed);

        const triangleIndexData = new Float32Array(this.scene.triangles.length);
        for (let i = 0; i < this.scene.triangles.length; ++i) {
            triangleIndexData[i] = this.scene.triangleIndices[i];
        }
        this.device.queue.writeBuffer(this.triangleIndexBuffer, 0, triangleIndexData, 0, this.scene.triangles.length);
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
                    sampler: {}
                },
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
                    resource: this.skyboxMaterial.sampler
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
        const performanceStartTime = performance.now();

        this.updateScene();

        //command encoder: records draw commands for submission
        const commandEncoder : GPUCommandEncoder = this.device.createCommandEncoder();

        const raytracerPass : GPUComputePassEncoder = commandEncoder.beginComputePass();
        raytracerPass.setPipeline(this.raytracingPipeline);
        raytracerPass.setBindGroup(0, this.raytracingBindGroup);
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