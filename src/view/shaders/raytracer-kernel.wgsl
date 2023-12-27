struct Sphere {
    center: vec3<f32>,
    color: vec3<f32>,
    radius: f32
}

struct Triangle {
    cornerA: vec3<f32>, //f32
    normalA: vec3<f32>, //f32
    cornerB: vec3<f32>, //f32
    normalB: vec3<f32>, //f32
    cornerC: vec3<f32>, //f32
    normalC: vec3<f32>,
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
    primitiveCount: f32,
}

struct BVH {
    nodes: array<Node>,
}

struct ObjectIndices {
    objectIndices: array<f32>,
}
///////////////////////////////////////

struct SceneData {
    cameraPos: vec3<f32>,
    cameraForwards: vec3<f32>,
    cameraRight: vec3<f32>,
    maxBounces: f32,
    cameraUp: vec3<f32>,
    primitiveCount: f32,
    inverseModel: mat4x4<f32>
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

const STACK_SIZE: u32 = 20;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalInvocationID: vec3<u32>) {
    let screenSize: vec2<u32> = textureDimensions(colorBuffer);
    let screenPos: vec2<i32> = vec2<i32>(i32(globalInvocationID.x), i32(globalInvocationID.y));

    let horizontalCoefficient: f32 =  (f32(screenPos.x) - f32(screenSize.x) / 2) / f32(screenSize.x) * 2;
    let verticalCoefficient: f32 =  (f32(screenSize.y) / 2 - f32(screenPos.y)) / f32(screenSize.x) * 2;

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

    var worldRay: Ray;
    worldRay.origin = ray.origin;
    worldRay.direction = ray.direction;

    var objectRay: Ray;
    objectRay.origin = (scene.inverseModel * vec4<f32>(ray.origin, 1.0)).xyz;
    objectRay.direction = (scene.inverseModel * vec4<f32>(ray.direction, 0.0)).xyz;

    let bounces: u32 = u32(scene.maxBounces);
    for (var bounce: u32 = 0; bounce < bounces; bounce++) {
        result = trace(objectRay);  

        if (!result.hit) {
            color *= textureSampleLevel(skyTex, skyTexSamp, worldRay.direction, 0.0).rgb;
            break;
        }
        color *= result.color;

        worldRay.origin = worldRay.origin + result.t * worldRay.direction;
        worldRay.direction = normalize(reflect(worldRay.direction, result.normal));

        objectRay.origin = (scene.inverseModel * vec4<f32>(worldRay.origin, 1.0)).xyz;
        objectRay.direction = (scene.inverseModel * vec4<f32>(worldRay.direction, 0.0)).xyz;
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
    var stack: array<u32, STACK_SIZE>;
    var stackLocation: u32 = 0;

    while (true) {
        var primitiveCount: u32 = u32(node.primitiveCount);
        var nodeIndex: u32 = u32(node.leftChild);

        if (primitiveCount == 0) {
            var iChild1: u32 = nodeIndex;
            var iChild2: u32 = nodeIndex + 1;
            var child1: Node = tree.nodes[nodeIndex];
            var child2: Node = tree.nodes[nodeIndex + 1];

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

                iChild1 = nodeIndex + 1;
                iChild2 = nodeIndex;
            }

            if (distance1 > nearestHit) {
                if (stackLocation == 0) {
                    break;
                }
                else {
                    stackLocation -= 1;
                    node = tree.nodes[stack[stackLocation]];
                }
            } 
            else {
                node = child1;
                if (distance2 < nearestHit) {
                    stack[stackLocation] = iChild2;
                    stackLocation += 1;
                    if (stackLocation >= STACK_SIZE) {
                        stackLocation = STACK_SIZE -1;
                    }
                }
            }
        }
        else {
            // Perform collison tests inside node
            for (var i: u32 = 0; i < primitiveCount; i++) {
                var newRenderState: RenderState = hitTriangle(
                    ray, 
                    objects.spheres[u32(sphereLookup.objectIndices[i + nodeIndex])], 
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
                node = tree.nodes[stack[stackLocation]];
            }
        }
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

// https://www.graphics.cornell.edu/pubs/1997/MT97.pdf
fn hitTriangle(ray: Ray, triangle: Triangle, tMin: f32, tMax: f32, oldRenderState: RenderState) -> RenderState {

    var renderState: RenderState;
    renderState.hit = false;
    renderState.color = oldRenderState.color;

    let edge1: vec3<f32> = triangle.cornerB - triangle.cornerA;
    let edge2: vec3<f32> = triangle.cornerC - triangle.cornerA;
    let rayCrossEdge2: vec3<f32> = cross(ray.direction, edge2);
    let det: f32 = dot(edge1, rayCrossEdge2);

    let epsilon: f32 = 0.00001;
    if (det < epsilon) {
        return renderState;
    }

    let s: vec3<f32> = ray.origin - triangle.cornerA;
    var u: f32 = dot(s, rayCrossEdge2);
    if (u < 0 || u > det) {
        return renderState;
    }

    let sCrossEdge1: vec3<f32> = cross(s, edge1);
    var v: f32 = dot(ray.direction, sCrossEdge1);
    if (v < 0 || u + v > det) {
        return renderState;
    }

    let invDet: f32 = 1.0 / det;
    let t: f32 = invDet * dot(edge2, sCrossEdge1);
    u *= invDet;
    v *= invDet;
    if (t > tMin && t < tMax) {
        
        renderState.position = ray.origin + t * ray.direction;
        let normal: vec3<f32> = (1.0 - u - v) * triangle.normalA + u * triangle.normalB + v * triangle.normalC;
        // let normal: vec3<f32> = normalize(cross(edge1, edge2));
        renderState.normal = normalize((transpose(scene.inverseModel) * vec4(normal, 0.0)).xyz);
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