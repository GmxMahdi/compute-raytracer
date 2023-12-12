struct TransformData {
    view: mat4x4<f32>,
    projection: mat4x4<f32>
};

struct ObjectData {
    models: array<mat4x4<f32>>
};

@binding(0) @group(0) var<uniform> transformUBO: TransformData;
@binding(1) @group(0) var tex: texture_2d<f32>;
@binding(2) @group(0) var texSampler: sampler;
@binding(3) @group(0) var<storage, read> objects: ObjectData;



struct Fragment {
    @builtin(position) pos : vec4<f32>,
    @location(0) texCoord : vec2<f32>
};

@vertex
fn vs_main(
    @builtin(instance_index) id: u32,   
    @location(0) pos: vec3<f32>, 
    @location(1) texCoord: vec2<f32>) -> Fragment {

    var output : Fragment;
    output.pos = transformUBO.projection * transformUBO.view * objects.models[id] * vec4<f32>(pos, 1.0);
    output.texCoord = texCoord;

    return output;
}

@fragment
fn fs_main(@location(0) texCoord: vec2<f32>) -> @location(0) vec4<f32> {
    return textureSample(tex, texSampler, texCoord);
}