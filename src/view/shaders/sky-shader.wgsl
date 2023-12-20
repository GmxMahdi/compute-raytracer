struct Camera {
    forwards: vec3<f32>,
    right: vec3<f32>,
    up: vec3<f32>,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var skyTex: texture_cube<f32>;
@group(0) @binding(2) var skyTexSamp: sampler;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) direction: vec3<f32>,
}

const positions = array<vec2<f2>, 6> (
    vec2<f32>( 1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
)

@vertex
fn skyVertMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertexIndex], 1.0, 1.0);
    var x: f32 = positions[vertexIndex].x;
    var y: f32 = positions[vertexIndex].y;

    output.direction = normalize(camera.forwards + x * camera.right + y * camera.up);
    return output;
}

@fragment
fn skyFragMain(@location(0) direction: vec3<f32>) -> location(0) vec4<f32> {
    return textureSample(skyTex, skyTexSamp, direction);
}
