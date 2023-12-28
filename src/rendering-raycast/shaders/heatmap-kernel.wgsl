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

struct BLAS {
    inverseModel: mat4x4<f32>,
    rootNodeIndex: vec4<f32>,
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
}

struct Ray {
    direction: vec3<f32>,
    origin: vec3<f32>
}

struct RenderState {
    t: f32,
    color: vec3<f32>,
    hit: bool,
    normal: vec3<f32>,
    traces: f32
}

@group(0) @binding(0) var colorBuffer: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> scene: SceneData;
@group(0) @binding(2) var<storage, read> objects: ObjectData; 
@group(0) @binding(3) var<storage, read> tree: BVH;
@group(0) @binding(4) var<storage, read> blasList: array<BLAS>;
@group(0) @binding(5) var<storage, read> triangleLookup: ObjectIndices;
@group(0) @binding(6) var<storage, read> blasLookup: ObjectIndices;
@group(0) @binding(7) var skyTex: texture_cube<f32>;
@group(0) @binding(8) var skyTexSamp: sampler;



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

    let traces : f32 = min(1.0, max(0.0, rayColor(ray) / 1000));
    var pixelColor: vec3<f32> = traces * vec3<f32>(1.0);

    textureStore(colorBuffer, screenPos, vec4<f32>(pixelColor, 1.0));
}

fn rayColor(ray: Ray) -> f32 {
    var color: vec3<f32> = vec3(1.0);
    var result: RenderState;

    var worldRay: Ray;
    worldRay.origin = ray.origin;
    worldRay.direction = ray.direction;

    var traces: f32 = 0;
    let bounces: u32 = u32(scene.maxBounces);
    for (var bounce: u32 = 0; bounce < bounces; bounce++) {
        result = traceTLAS(worldRay);  
        traces += result.traces;
        if (!result.hit) {
            color *= textureSampleLevel(skyTex, skyTexSamp, worldRay.direction, 0.0).rgb;
            break;
        }
        color *= result.color;

        worldRay.origin = worldRay.origin + result.t * worldRay.direction;
        worldRay.direction = normalize(reflect(worldRay.direction, result.normal));
    }

    return traces;
}

fn traceTLAS(ray: Ray) -> RenderState {
    // Setup render state
    var renderState: RenderState;
    renderState.hit = false;
    var nearestHit: f32 = 9999;

    // Setup BVH
    var node: Node = tree.nodes[0];
    var stack: array<u32, STACK_SIZE>;
    var stackLocation: u32 = 0;

    var traces: f32 = 0;

    while (true) {
        var primitiveCount: u32 = u32(node.primitiveCount);
        var nodeIndex: u32 = u32(node.leftChild);

        if (primitiveCount == 0) {
            var iChild1: u32 = nodeIndex;
            var iChild2: u32 = nodeIndex + 1;
            var child1: Node = tree.nodes[nodeIndex];
            var child2: Node = tree.nodes[nodeIndex + 1];
            traces += 2;

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
                var newRenderState: RenderState = traceBLAS(
                    ray, 
                    blasList[u32(blasLookup.objectIndices[i + nodeIndex])], 
                    nearestHit, renderState
                );
                traces += newRenderState.traces;

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

    renderState.traces = traces;
    return renderState;
}

fn traceBLAS(
    ray: Ray, 
    blas: BLAS, 
    nearestHit: f32,
    renderState: RenderState) -> RenderState {

    // Object Ray
    var objectRay: Ray;
    objectRay.origin = (blas.inverseModel * vec4<f32>(ray.origin, 1.0)).xyz;
    objectRay.direction = (blas.inverseModel * vec4<f32>(ray.direction, 0.0)).xyz;

    // BLAS render state
    var blasRenderState: RenderState;
    blasRenderState.t = renderState.t;
    blasRenderState.normal = renderState.normal;
    blasRenderState.color = renderState.color;
    blasRenderState.hit = false;

    // Setup BVH
    var node: Node = tree.nodes[u32(blas.rootNodeIndex.x)];
    var stack: array<u32, STACK_SIZE>;
    var stackLocation: u32 = 0;

    var blasNearestHit: f32 = nearestHit;

    var traces: f32 = 0;

    while (true) {
        var primitiveCount: u32 = u32(node.primitiveCount);
        var nodeIndex: u32 = u32(node.leftChild);

        if (primitiveCount == 0) {
            var iChild1: u32 = nodeIndex;
            var iChild2: u32 = nodeIndex + 1;
            var child1: Node = tree.nodes[nodeIndex];
            var child2: Node = tree.nodes[nodeIndex + 1];
            traces += 2;

            var distance1: f32 = hitAABB(objectRay, child1);
            var distance2: f32 = hitAABB(objectRay, child2);

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

            if (distance1 > blasNearestHit) {
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
                if (distance2 < blasNearestHit) {
                    stack[stackLocation] = iChild2;
                    stackLocation += 1;
                }
            }
        }
        else {
            // Perform collison tests inside node
            for (var i: u32 = 0; i < primitiveCount; i++) {
                var newRenderState: RenderState = hitTriangle(
                    objectRay, 
                    objects.spheres[u32(triangleLookup.objectIndices[i + nodeIndex])], 
                    0.001, blasNearestHit, blasRenderState
                );
                traces += 1;

                if (newRenderState.hit) {
                    blasNearestHit = newRenderState.t;
                    blasRenderState = newRenderState;
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

    if (blasRenderState.hit) {
        blasRenderState.normal = normalize(
            (transpose(blas.inverseModel) * vec4(blasRenderState.normal, 0.0)).xyz
        );
    }

    blasRenderState.traces = traces;
    return blasRenderState;
}

// fn hitSphere(ray: Ray, sphere: Sphere, tMin: f32, tMax: f32, oldRenderState: RenderState) -> RenderState {
//     let a: f32 = dot(ray.direction, ray.direction);
//     let b: f32 = 2.0 * dot(ray.direction, ray.origin - sphere.center);
//     let c: f32 = dot(ray.origin - sphere.center, ray.origin - sphere.center) - sphere.radius * sphere.radius;
//     let discriminant: f32 =  b * b - 4 * a * c;

//     var renderState: RenderState;
//     renderState.color = oldRenderState.color;

//     if (discriminant > 0.0) {
//         let t: f32 = (-b -sqrt(discriminant)) / (2 * a);
//         if (t > tMin && t < tMax) {
//             renderState.position = ray.origin + t * ray.direction;
//             renderState.normal = normalize(renderState.position - sphere.center);
//             renderState.t = t;
//             renderState.color = sphere.color;
//             renderState.hit = true;
//             return renderState;
//         }
//     }

//     renderState.hit = false;
//     return renderState;
// }

// https://www.graphics.cornell.edu/pubs/1997/MT97.pdf
fn hitTriangle(
    ray: Ray, 
    triangle: Triangle, 
    tMin: f32, tMax: f32, 
    oldRenderState: RenderState) -> RenderState {

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
        renderState.normal = (1.0 - u - v) * triangle.normalA + u * triangle.normalB + v * triangle.normalC;
        // renderState.normal = normalize(cross(edge1, edge2));
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