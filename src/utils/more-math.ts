export function deg2rad(theta: number): number {
    return theta * Math.PI / 180;
}

export function rag2deg(deg: number): number {
    return deg * 180 / Math.PI;
}

export function clamp(x: number, a: number, b: number) {
    return Math.max(Math.min(x, b), a);
}