@group(0) @binding(0) var screenSampler: sampler;
@group(0) @binding(1) var colorBuffer: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) texCoord: vec2<f32>
}

@vertex
fn vertMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    let screenPositions = array<vec2<f32>, 6> (
        vec2<f32>(1.0, 1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
    );

    let texCoords = array<vec2<f32>, 6>(
        vec2<f32>(1.0, 0.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0),
        vec2<f32>(0.0, 1.0),
        vec2<f32>(0.0, 0.0),
    );

    var output: VertexOutput;
    output.pos = vec4<f32>(screenPositions[vertexIndex], 0.0, 1.0);
    output.texCoord =  texCoords[vertexIndex];
    return output;
}

@fragment
fn fragMain(@location(0) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(colorBuffer, screenSampler, texCoord);
}