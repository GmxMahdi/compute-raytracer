
struct SceneParameters {
    cameraPos: vec3<f32>,
    cameraForwards: vec3<f32>,
    cameraRight: vec3<f32>,
    cameraUp: vec3<f32>,
    maxBounces: f32,
}

// struct Sphere {
//     center: vec3<f32>,
//     color: vec3<f32>,
//     radius: f32
// }

struct Triangle {
    cornerA: vec3<f32>, 
    normalA: vec3<f32>, 
    textureA: vec2<f32>,
    cornerB: vec3<f32>, 
    normalB: vec3<f32>, 
    textureB: vec2<f32>,
    cornerC: vec3<f32>, 
    normalC: vec3<f32>,
    textureC: vec2<f32>,
    color: vec4<f32>
}

struct Node {
    minCorner: vec3<f32>,
    leftChildIndex: f32,
    maxCorner: vec3<f32>,
    primitiveCount: f32,
}

struct BLAS {
    inverseModel: mat4x4<f32>,
    rootNodeIndex: f32,
}

struct Ray {
    direction: vec3<f32>,
    origin: vec3<f32>
}

struct RenderState {
    distance: f32,
    t: f32,
    texCoord: vec2<f32>,
    diffuse: vec4<f32>,
    hit: bool,
    normal: vec3<f32>
}

@group(0) @binding(0) var colorBuffer: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(1) var<uniform> scene: SceneParameters;
@group(0) @binding(2) var<storage, read> triangles: array<Triangle>; 
@group(0) @binding(3) var<storage, read> tree: array<Node>;
@group(0) @binding(4) var<storage, read> blasList: array<BLAS>;
@group(0) @binding(5) var<storage, read> triangleLookup: array<f32>;
@group(0) @binding(6) var<storage, read> blasLookup: array<f32>;
@group(0) @binding(7) var skyTex: texture_cube<f32>;
@group(0) @binding(8) var meshTex: texture_2d<f32>;
@group(0) @binding(9) var texSamp: sampler;



const STACK_SIZE: u32 = 20;

const POINT_LIGHT: vec3<f32> = vec3<f32>(0, 5, 0);
const MIN_INTENSITY: f32 = 0.5;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) globalInvocationID: vec3<u32>) {
    let screenSize: vec2<u32> = textureDimensions(colorBuffer);
    let screenPos: vec2<i32> = vec2<i32>(i32(globalInvocationID.x), i32(globalInvocationID.y));

    let horizontalCoefficient: f32 =  (f32(screenPos.x) - f32(screenSize.x) / 2) / f32(screenSize.x) * 2;
    let verticalCoefficient: f32 =  (f32(screenSize.y) / 2 - f32(screenPos.y)) / f32(screenSize.x) * 2;

    var ray: Ray;
    ray.direction = normalize(
        scene.cameraForwards + 
        horizontalCoefficient * scene.cameraRight + 
        verticalCoefficient * scene.cameraUp
    );

    ray.origin = scene.cameraPos;
    var result: vec4<f32> = rayColor(ray);

    var rayColor: vec3<f32> = result.rgb;
    var skyboxColor: vec3<f32> = textureSampleLevel(skyTex, texSamp, ray.direction, 0.0).rgb * MIN_INTENSITY;

    let MAX_DISTANCE: f32 = 30;
    var intensity = clamp((MAX_DISTANCE - result.w) / MAX_DISTANCE, 0, 1);
    var pixelColor = rayColor * intensity + skyboxColor * (1 - intensity);

    textureStore(colorBuffer, screenPos, vec4<f32>(pixelColor, 1.0));
}

fn rayColor(ray: Ray) -> vec4<f32> {
    var dist: f32 = 0;
    var color: vec3<f32> = vec3(1.0);
    var result: RenderState;

    var worldRay: Ray;
    worldRay.origin = ray.origin;
    worldRay.direction = ray.direction;

    let bounces: u32 = u32(scene.maxBounces);
    var affectFactor: f32 = 1.0;
    var sumFactor: f32 = 0.0;
    for (var bounce: u32 = 0; bounce < bounces; bounce++) {
        result = traceTLAS(worldRay);  

        if (bounce == 0) {
            dist = result.t;
        }

       let nextSumFactor = affectFactor + sumFactor;

        if (!result.hit) {
            var skyboxColor: vec3<f32> = textureSampleLevel(skyTex, texSamp, worldRay.direction, 0.0).rgb * MIN_INTENSITY;
            color = (color * sumFactor +  skyboxColor * affectFactor) / nextSumFactor;
            break;
        }

        // Get next position dans direction of the ray
        worldRay.origin = worldRay.origin + result.t * worldRay.direction;
        worldRay.direction = normalize(reflect(worldRay.direction, result.normal));

        var intensity: f32 = lightIntensity(worldRay.origin, result.normal);
        var diffuseColor: vec3<f32> = result.diffuse.rgb * result.diffuse.w;
        var samplerColor: vec3<f32> = textureSampleLevel(meshTex, texSamp, result.texCoord, 0.0).rgb * (1 - result.diffuse.w);
        var blendedColor: vec3<f32> = (diffuseColor + samplerColor) * intensity;
        color = (color * sumFactor + blendedColor * affectFactor) / nextSumFactor;

        // Update how much the next ray will affect the color
        affectFactor /= 2.0;
        sumFactor = nextSumFactor;
    }

    return vec4<f32>(color, dist);
}

fn lightIntensity(destination: vec3<f32>, normal: vec3<f32>) -> f32 {
    var direction = normalize(destination - POINT_LIGHT);
    var distance = length(direction);

    var ray: Ray;
    ray.origin = POINT_LIGHT;
    ray.direction = direction;
    var result: RenderState = traceTLAS(ray);  

    if (result.hit) {
        var hitPoint: vec3<f32> = POINT_LIGHT + result.t * direction;
        var diff: f32 = length(hitPoint - destination);
        var epsilon: f32 = 0.005;
        if (diff < epsilon) {
            var power: f32 = clamp(dot(normal, -direction), MIN_INTENSITY, 1.0);

            var INTENSITY: f32 = 999.0;
            var intensityCap: f32 = INTENSITY / (INTENSITY + distance);
            return power* intensityCap;
        }
    }

    const MIN_INTENSITY: f32 = 0.1;
    return MIN_INTENSITY;
}

fn traceTLAS(ray: Ray) -> RenderState {
    // Setup render state
    var renderState: RenderState;
    renderState.hit = false;
    var nearestHit: f32 = 9999;

    // Setup BVH
    var node: Node = tree[0];
    var stack: array<u32, STACK_SIZE>;
    var stackLocation: u32 = 0;

    while (true) {
        var modelCount: u32 = u32(node.primitiveCount);
        var leftChildNodeIndex: u32 = u32(node.leftChildIndex);

        if (modelCount == 0) {
            var iChild1: u32 = leftChildNodeIndex;
            var iChild2: u32 = leftChildNodeIndex + 1;
            var distance1: f32 = hitAABB(ray, tree[leftChildNodeIndex]);
            var distance2: f32 = hitAABB(ray, tree[leftChildNodeIndex + 1]);

            // If child2 closer, test collision child2 first.
            if (distance1 > distance2) {
                var tempDist: f32 = distance1;
                distance1 = distance2;
                distance2 = tempDist;
                iChild1 = leftChildNodeIndex + 1;
                iChild2 = leftChildNodeIndex;
            }

            if (distance1 > nearestHit) {
                if (stackLocation == 0) {
                    break;
                }
                else {
                    stackLocation -= 1;
                    node = tree[stack[stackLocation]];
                }
            } 
            else {
                node = tree[iChild1];
                if (distance2 < nearestHit) {
                    stack[stackLocation] = iChild2;
                    stackLocation += 1;
                    if (stackLocation > STACK_SIZE) {
                        stackLocation = STACK_SIZE -1;
                    }
                }
            }
        }
        else {
            // Perform collison tests inside node
            for (var i: u32 = 0; i < modelCount; i++) {
                var newRenderState: RenderState = traceBLAS(
                    ray, 
                    blasList[u32(blasLookup[i + leftChildNodeIndex])], 
                    nearestHit, renderState
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
                node = tree[stack[stackLocation]];
            }
        }
    }

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
    blasRenderState.texCoord = renderState.texCoord;
    blasRenderState.hit = false;

    // Setup BVH
    var node: Node = tree[u32(blas.rootNodeIndex)];
    var stack: array<u32, STACK_SIZE>;
    var stackLocation: u32 = 0;

    var blasNearestHit: f32 = nearestHit;

    while (true) {
        var primitiveCount: u32 = u32(node.primitiveCount);
        var leftChildNodeIndex: u32 = u32(node.leftChildIndex);

        if (primitiveCount == 0) {
            var iChild1: u32 = leftChildNodeIndex;
            var iChild2: u32 = leftChildNodeIndex + 1;

            var distance1: f32 = hitAABB(objectRay, tree[leftChildNodeIndex]);
            var distance2: f32 = hitAABB(objectRay, tree[leftChildNodeIndex + 1]);

            // If child2 closer, test collision child2 first.
            if (distance1 > distance2) {
                var tempDist: f32 = distance1;
                distance1 = distance2;
                distance2 = tempDist;

                iChild1 = leftChildNodeIndex + 1;
                iChild2 = leftChildNodeIndex;
            }

            if (distance1 > blasNearestHit) {
                if (stackLocation == 0) {
                    break;
                }
                else {
                    stackLocation -= 1;
                    node = tree[stack[stackLocation]];
                }
            } 
            else {
                node = tree[iChild1];
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
                    triangles[u32(triangleLookup[i + leftChildNodeIndex])], 
                    0.001, blasNearestHit, blasRenderState
                );

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
                node = tree[stack[stackLocation]];
            }
        }
    }

    if (blasRenderState.hit) {
        blasRenderState.normal = normalize(
            (transpose(blas.inverseModel) * vec4(blasRenderState.normal, 0.0)).xyz
        );
    }

    return blasRenderState;
}

// https://www.graphics.cornell.edu/pubs/1997/MT97.pdf
fn hitTriangle(
    ray: Ray, 
    triangle: Triangle, 
    tMin: f32, tMax: f32, 
    oldRenderState: RenderState) -> RenderState {

    var renderState: RenderState;
    renderState.hit = false;
    renderState.texCoord = oldRenderState.texCoord;

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
        let w = 1 - u - v;    
        renderState.normal = mat3x3<f32>(triangle.normalA, triangle.normalB, triangle.normalC) * vec3<f32>(w, u, v);
        // renderState.normal = normalize(cross(edge1, edge2));
        renderState.diffuse = triangle.color;
        renderState.t = t;
        renderState.texCoord = mat3x2<f32>(triangle.textureA, triangle.textureB, triangle.textureC) * vec3<f32>(w, u, v);
        renderState.texCoord.y = 1 - renderState.texCoord.y;
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
    }

    return t_min;
}