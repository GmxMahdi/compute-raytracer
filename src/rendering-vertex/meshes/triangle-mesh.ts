export class TriangleMesh {

    buffer: GPUBuffer
    bufferLayout: GPUVertexBufferLayout

    constructor(device: GPUDevice) {
        // x y r g b
        const vertices: Float32Array = new Float32Array([
            0.0,  0.5,  0.0, 0.5, 0.0,
            0.0, -0.5, -0.5, 0.0, 1.0,
            0.0, -0.5,  0.5, 1.0, 1.0,
        ]);

        const usage: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
        const descriptor: GPUBufferDescriptor = {
            size: vertices.byteLength,
            usage,
        };

        this.buffer = device.createBuffer(descriptor);
        device.queue.writeBuffer(this.buffer, 0, vertices);

        this.bufferLayout = {
            arrayStride: 20,
            attributes: [
                {
                    shaderLocation: 0,
                    format: "float32x3",
                    offset: 0
                },
                {
                    shaderLocation: 1,
                    format: "float32x2",
                    offset: 12
                }
            ]
        };
    }
}