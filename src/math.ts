export const roundTo = (value: number, target: number) => Math.round(value * target) / target;
export const floorTo = (value: number, target: number) => Math.floor(value * target) / target;
type EaseFunc = (x: number, y: number, p: number) => number;
export const lerp: EaseFunc = (x, y, p) => x + (y - x) * p;
export function getEaseFunction(easeType: 'linear' | 'in' | 'out'): EaseFunc {
    switch (easeType) {
        case "linear": return lerp;
        case "in": return (x, y, p) => lerp(x, y, p * p);
        case "out": return (x, y, p) => lerp(x, y, 1 - (1 - p) ** 2);
    }
}
export const midpoint = (...points: number[]) => points.reduce((a, b) => a + b) / points.length;
export const distance = (pointA: number, pointB: number) => Math.abs(pointB - pointA);