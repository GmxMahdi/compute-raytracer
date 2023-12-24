struct Sphere {
    center: vec3<f32>,
    color: vec3<f32>,
    radius: f32
}

struct Triangle {
    cornerA: vec3<f32>,
    cornerB: vec3<f32>,
    cornerC: vec3<f32>,
    color: vec3<f32>
}

struct ObjectData {
    spheres: array<Triangle>
}

//// Spacial Acceleration Structure ////
struct Node {
    minCorner: vec3<f32>,
    leftChild: f32,
    maxCorner: vec3<f32>,
    sphereCount: f32,
}

struct BVH {
    nodes: array<Node>,
}

struct ObjectIndices {
    sphereIndices: array<f32>,
}
///////////////////////////////////////

struct SceneData {
    cameraPos: vec3<f32>,
    cameraForwards: vec3<f32>,
    cameraRight: vec3<f32>,
    maxBounces: f32,
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
    hit: bool,
    position: vec3<f32>,
    normal: vec3<f32>
}

@group(0) @binding(0) var colorBuffer: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> scene: SceneData;
@group(0) @binding(2) var<storage, read> objects: ObjectData; 
@group(0) @binding(3) var<storage, read> tree: BVH;
@group(0) @binding(4) var<storage, read> sphereLookup: ObjectIndices;
@group(0) @binding(5) var skyTex: texture_cube<f32>;
@group(0) @binding(6) var skyTexSamp: sampler;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalInvocationID: vec3<u32>) {
    let screenSize: vec2<u32> = textureDimensions(colorBuffer);
    let screenPos: vec2<i32> = vec2<i32>(i32(globalInvocationID.x), i32(globalInvocationID.y));

    let horizontalCoefficient: f32 =  (f32(screenPos.x) - f32(screenSize.x) / 2) / f32(screenSize.x);
    let verticalCoefficient: f32 =  (f32(screenPos.y) - f32(screenSize.y) / 2) / f32(screenSize.x);

    let forwards: vec3<f32> = scene.cameraForwards;
    let right: vec3<f32> = scene.cameraRight;
    let up: vec3<f32> = scene.cameraUp;

    var ray: Ray;
    ray.direction = normalize(forwards + horizontalCoefficient * right + verticalCoefficient * up);
    ray.origin = scene.cameraPos;

    var pixelColor: vec3<f32> = rayColor(ray);

    textureStore(colorBuffer, screenPos, vec4<f32>(pixelColor, 1.0));
}

fn rayColor(ray: Ray) -> vec3<f32> {
    var color: vec3<f32> = vec3(1.0);
    var result: RenderState;

    var tempRay: Ray;
    tempRay.origin = ray.origin;
    tempRay.direction = ray.direction;

    let bounces: u32 = u32(scene.maxBounces);
    for (var bounce: u32 = 0; bounce < bounces; bounce++) {
        result = trace(tempRay);
        color = color * result.color;

        if (!result.hit) {
            break;
        }

        tempRay.origin = result.position;
        tempRay.direction = normalize(reflect(tempRay.direction, result.normal));
    }


    if (result.hit) {
        color = vec3(0.0);
    }
    return color;
}

fn trace(ray: Ray) -> RenderState {
    // Setup render state
    var renderState: RenderState;
    renderState.hit = false;
    var nearestHit: f32 = 9999;

    // Setup BVH
    var node: Node = tree.nodes[0];
    var stack: array<Node, 15>;
    var stackLocation: u32 = 0;

    while (true) {
        var sphereCount: u32 = u32(node.sphereCount);
        var contents: u32 = u32(node.leftChild);

        if (sphereCount == 0) {
            var child1: Node = tree.nodes[contents];
            var child2: Node = tree.nodes[contents + 1];

            var distance1: f32 = hitAABB(ray, child1);
            var distance2: f32 = hitAABB(ray, child2);

            // If child2 closer, test collision child2 first.
            if (distance1 > distance2) {
                var tempDist: f32 = distance1;
                distance1 = distance2;
                distance2 = tempDist;

                var tempChild: Node = child1;
                child1 = child2;
                child2 = tempChild;
            }

            if (distance1 > nearestHit) {
                if (stackLocation == 0) {
                    break;
                }
                else {
                    stackLocation -= 1;
                    node = stack[stackLocation];
                }
            } 
            else {
                node = child1;
                if (distance2 < nearestHit) {
                    stack[stackLocation] = child2;
                    stackLocation += 1;
                }
            }
        }
        else {
            // Perform collison tests inside node
            for (var i: u32 = 0; i < sphereCount; i++) {
                var newRenderState: RenderState = hitTriangle(
                    ray, 
                    objects.spheres[u32(sphereLookup.sphereIndices[i + contents])], 
                    0.001, nearestHit, renderState
                );

                if (newRenderState.hit) {
                    nearestHit = newRenderState.t;
                    renderState = newRenderState;
                }
            }

            if (stackLocation == 0) {
                break;
            }
            else {
                stackLocation -= 1;
                node = stack[stackLocation];
            }
        }
    }

    if (!renderState.hit) {
        renderState.color = textureSampleLevel(skyTex, skyTexSamp, ray.direction, 0.0).rgb;
    }

    return renderState;
}

fn hitSphere(ray: Ray, sphere: Sphere, tMin: f32, tMax: f32, oldRenderState: RenderState) -> RenderState {
    let a: f32 = dot(ray.direction, ray.direction);
    let b: f32 = 2.0 * dot(ray.direction, ray.origin - sphere.center);
    let c: f32 = dot(ray.origin - sphere.center, ray.origin - sphere.center) - sphere.radius * sphere.radius;
    let discriminant: f32 =  b * b - 4 * a * c;

    var renderState: RenderState;
    renderState.color = oldRenderState.color;

    if (discriminant > 0.0) {
        let t: f32 = (-b -sqrt(discriminant)) / (2 * a);
        if (t > tMin && t < tMax) {
            renderState.position = ray.origin + t * ray.direction;
            renderState.normal = normalize(renderState.position - sphere.center);
            renderState.t = t;
            renderState.color = sphere.color;
            renderState.hit = true;
            return renderState;
        }
    }

    renderState.hit = false;
    return renderState;
}

fn hitTriangle(ray: Ray, triangle: Triangle, tMin: f32, tMax: f32, oldRenderState: RenderState) -> RenderState {

    var renderState: RenderState;
    renderState.hit = false;
    renderState.color = oldRenderState.color;

    var ab: vec3<f32> = triangle.cornerB - triangle.cornerA;
    var ac: vec3<f32> = triangle.cornerC - triangle.cornerA;
    var normal: vec3<f32> = normalize(cross(ab, ac));

    var rayDotTri : f32 = dot(normal, ray.direction);
    if (rayDotTri > 0.0) {
        rayDotTri *= -1;
        normal *= -1;
    }

    let epsilon = 0.00001;

    // Almost too parallel
    if (rayDotTri > -epsilon) {
        return renderState;
    }

    ///// Cramer's rule /////

    // Determinant
    var sysMatrix: mat3x3<f32> = mat3x3<f32>(
        ray.direction,
        -ab,
        -ac
    );
    let denominator: f32 = determinant(sysMatrix);
    // If unstable
    if (abs(denominator) < epsilon) {
        return renderState;
    }

    // U
    sysMatrix = mat3x3<f32>(
        ray.direction,
        triangle.cornerA - ray.origin,
        -ac
    );
    let u: f32 = determinant(sysMatrix) / denominator;
    if (u < 0.0 || u > 1.0) {
        return renderState;
    }

    // V
    sysMatrix = mat3x3<f32>(
        ray.direction,
        -ab,
        triangle.cornerA - ray.origin
    );
    let v: f32 = determinant(sysMatrix) / denominator;
    if (v < 0.0 || u + v > 1.0 ) {
        return renderState;
    }

    // T
    sysMatrix = mat3x3<f32>(
        triangle.cornerA - ray.origin,
        -ab,
        -ac
    );
    let t: f32 = determinant(sysMatrix) / denominator;
    if (t > tMin && t < tMax) {
        renderState.position = ray.origin + t * ray.direction;
        renderState.normal = normal;
        renderState.t = t;
        renderState.color = triangle.color;
        renderState.hit = true;
        return renderState;
    }

    return renderState;
}

fn hitAABB(ray: Ray, node: Node) -> f32 {
    var inverseDir: vec3<f32> = vec3(1.0) / ray.direction;
    var t1: vec3<f32> = (node.minCorner - ray.origin) * inverseDir;
    var t2: vec3<f32> = (node.maxCorner - ray.origin) * inverseDir;
    var tMin: vec3<f32> = min(t1, t2);
    var tMax: vec3<f32> = max(t1, t2);

    var t_min: f32 = max(max(tMin.x, tMin.y), tMin.z);
    var t_max: f32 = min(min(tMax.x, tMax.y), tMax.z);

    if (t_min > t_max || t_max < 0) {
        return 99999;
    } else {
        return t_min;
    }
}