struct Sphere {
    center: vec3<f32>,
    color: vec3<f32>,
    radius: f32
}

struct ObjectData {
    spheres: array<Sphere>
}

struct SceneData {
    cameraPos: vec3<f32>,
    cameraForwards: vec3<f32>,
    cameraRight: vec3<f32>,
    cameraUp: vec3<f32>,
    sphereCount: f32
}

struct Ray {
    direction: vec3<f32>,
    origin: vec3<f32>
}

struct RenderState {
    t: f32,
    color: vec3<f32>,
    hit: bool
}

@group(0) @binding(0) var colorBuffer: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> scene: SceneData;
@group(0) @binding(2) var<storage, read> objects: ObjectData;

@compute @workgroup_size(1, 1, 1)
fn main(@builtin(global_invocation_id) globalInvocationID: vec3<u32>) {
    let screenSize: vec2<u32> = textureDimensions(colorBuffer);
    let screenPos: vec2<i32> = vec2<i32>(i32(globalInvocationID.x), i32(globalInvocationID.y));

    let horizontalCoefficient: f32 =  (f32(screenPos.x) - f32(screenSize.x) / 2) / f32(screenSize.x);
    let verticalCoefficient: f32 =  (f32(screenPos.y) - f32(screenSize.y) / 2) / f32(screenSize.x);

    let forwards: vec3<f32> = scene.cameraForwards;
    let right: vec3<f32> = scene.cameraRight;
    let up: vec3<f32> = scene.cameraUp;

    var ray: Ray;
    ray.direction = vec3<f32>(forwards + horizontalCoefficient * right + verticalCoefficient * up);
    ray.origin = vec3<f32>(0.0, 0.0, 0.0);

    var pixelColor: vec3<f32> = rayColor(ray);

    textureStore(colorBuffer, screenPos, vec4<f32>(pixelColor, 1.0));
}

fn rayColor(ray: Ray) -> vec3<f32> {
    var color: vec3<f32> = vec3(0.0);

    var nearestHit: f32 = 9999.0;
    var hasHit: bool = false;

    var renderState: RenderState;
    for (var i: u32 = 0; i < u32(scene.sphereCount); i++) {
        var newRenderState: RenderState = hit(ray, objects.spheres[i], 0.001, nearestHit, renderState);

        if (newRenderState.hit) {
            nearestHit = newRenderState.t;
            renderState = newRenderState;
            hasHit = true;
        }
    }

    if (hasHit) {
        color = renderState.color;
    }

    return color;
}

fn hit(ray: Ray, sphere: Sphere, tMin: f32, tMax: f32, oldRenderState: RenderState) -> RenderState {
    let a: f32 = dot(ray.direction, ray.direction);
    let b: f32 = 2.0 * dot(ray.direction, ray.origin - sphere.center);
    let c: f32 = dot(ray.origin - sphere.center, ray.origin - sphere.center) - sphere.radius * sphere.radius;
    let discriminant: f32 =  b * b - 4 * a * c;

    var renderState: RenderState;
    renderState.color = oldRenderState.color;

    if (discriminant > 0) {
        let t: f32 = (-b -sqrt(discriminant)) / (2 * a);
        if (t > tMin && t < tMax) {
            renderState.t = t;
            renderState.color = sphere.color;
            renderState.hit = true;
            return renderState;
        }
    }

    renderState.hit = false;
    return renderState;
}