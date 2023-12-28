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
        const maxBounces: number = 4;
        this.device.queue.writeBuffer(
            this.sceneParameters, 0,
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
                maxBounces,
                this.scene.camera.up[0],
                this.scene.camera.up[1],
                this.scene.camera.up[2],
                0.0
            ]), 0, 16
        );

        const blasData: Float32Array = new Float32Array(20 * this.scene.blasList.length);
        for (let i = 0; i < this.scene.blasList.length; ++i) {
            for (let j = 0; j < 16; ++j) {
                blasData[20 * i + j] = <number> this.scene.blasList[i].inverseModel.at(j);
            }
            blasData[20 * i + 16] = <number> this.scene.blasList[i].rootNodeIndex;
            blasData[20 * i + 17] = <number> this.scene.blasList[i].rootNodeIndex;
            blasData[20 * i + 18] = <number> this.scene.blasList[i].rootNodeIndex;
            blasData[20 * i + 19] = <number> this.scene.blasList[i].rootNodeIndex;
        }
        this.device.queue.writeBuffer(this.blasBuffer, 0, blasData, 0, 20 * this.scene.blasList.length);

        const blasIndexData: Float32Array = new Float32Array(this.scene.blasIndices.length);
        for (let i = 0; i < this.scene.blasIndices.length; ++i) {
            blasIndexData[i] = this.scene.blasIndices[i];
        }
        this.device.queue.writeBuffer(this.blasIndexBuffer, 0, blasIndexData, 0, this.scene.blasIndices.length);

        // Write top-level nodes
        const nodeDataA = new Float32Array(8 * this.scene.nodesUsed);
        for (let i = 0; i < this.scene.nodesUsed; ++i) {
            nodeDataA[8 * i + 0] = this.scene.nodes[i].minCorner[0];
            nodeDataA[8 * i + 1] = this.scene.nodes[i].minCorner[1];
            nodeDataA[8 * i + 2] = this.scene.nodes[i].minCorner[2];
            nodeDataA[8 * i + 3] = this.scene.nodes[i].leftChild;
            nodeDataA[8 * i + 4] = this.scene.nodes[i].maxCorner[0];
            nodeDataA[8 * i + 5] = this.scene.nodes[i].maxCorner[1];
            nodeDataA[8 * i + 6] = this.scene.nodes[i].maxCorner[2];
            nodeDataA[8 * i + 7] = this.scene.nodes[i].primitiveCount;
        }
        this.device.queue.writeBuffer(this.nodeBuffer, 0, nodeDataA, 0, 8 * this.scene.nodesUsed);

        if (this.loaded) return;
        this.loaded = true;

        const triangleData: Float32Array = new Float32Array(28 * this.scene.triangles.length);
        for (let i = 0; i < this.scene.triangles.length; i++) {
            for (var corner = 0; corner < 3; corner++) {
                triangleData[28 * i + 8 * corner]     = this.scene.triangles[i].corners[corner][0];
                triangleData[28 * i + 8 * corner + 1] = this.scene.triangles[i].corners[corner][1];
                triangleData[28 * i + 8 * corner + 2] = this.scene.triangles[i].corners[corner][2];
                triangleData[28 * i + 8 * corner + 3] = 0.0;

                triangleData[28 * i + 8 * corner + 4] = this.scene.triangles[i].normals[corner][0];
                triangleData[28 * i + 8 * corner + 5] = this.scene.triangles[i].normals[corner][1];
                triangleData[28 * i + 8 * corner + 6] = this.scene.triangles[i].normals[corner][2];
                triangleData[28 * i + 8 * corner + 7] = 0.0;
            }
            for (var channel = 0; channel < 3; channel++) {
                triangleData[28 * i + 24 + channel] = this.scene.triangles[i].color[channel];
            }
            triangleData[28 * i + 27] = 0.0;
        }
        this.device.queue.writeBuffer(this.triangleBuffer, 0, triangleData, 0, 28 * this.scene.triangles.length);

        // Write bottom-level nodes
        const nodeDataB = new Float32Array(8 * this.scene.mesh.bvh.nodesUsed);
        for (let i = 0; i < this.scene.mesh.bvh.nodesUsed; ++i) {
            let baseIndex: number = this.scene.tlasNodesMax + i;
            nodeDataB[8 * i + 0] = this.scene.nodes[baseIndex].minCorner[0];
            nodeDataB[8 * i + 1] = this.scene.nodes[baseIndex].minCorner[1];
            nodeDataB[8 * i + 2] = this.scene.nodes[baseIndex].minCorner[2];
            nodeDataB[8 * i + 3] = this.scene.nodes[baseIndex].leftChild;
            nodeDataB[8 * i + 4] = this.scene.nodes[baseIndex].maxCorner[0];
            nodeDataB[8 * i + 5] = this.scene.nodes[baseIndex].maxCorner[1];
            nodeDataB[8 * i + 6] = this.scene.nodes[baseIndex].maxCorner[2];
            nodeDataB[8 * i + 7] = this.scene.nodes[baseIndex].primitiveCount;
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