// Roboflow API types
export interface Point {
    x: number;
    y: number;
}

export interface Prediction {
    class: string;
    confidence: number;
    x: number;
    y: number;
    width: number;
    height: number;
    points?: Point[];
}

export interface DetectionResult {
    predictions: Prediction[];
    image?: {
        width: number;
        height: number;
    };
}

// Label colors (RGB format for Canvas)
export const LABEL_COLORS: Record<string, string> = {
    green: 'rgb(0, 255, 0)',
    yellow: 'rgb(255, 255, 0)',
    orange: 'rgb(255, 165, 0)',
    red: 'rgb(255, 0, 0)',
};

// Water level mapping
export const WATER_LEVEL_MAP = {
    green: 25,
    yellow: 50,
    orange: 75,
    red: 100,
};

export function getLabelColor(label: string): string {
    const labelLower = label.toLowerCase();
    for (const [key, color] of Object.entries(LABEL_COLORS)) {
        if (labelLower.includes(key)) {
            return color;
        }
    }
    return 'rgb(0, 100, 255)'; // Default blue-ish
}

export function getLabelColorRGBA(label: string, alpha: number = 1): string {
    const labelLower = label.toLowerCase();
    const colors: Record<string, [number, number, number]> = {
        green: [0, 255, 0],
        yellow: [255, 255, 0],
        orange: [255, 165, 0],
        red: [255, 0, 0],
    };

    for (const [key, [r, g, b]] of Object.entries(colors)) {
        if (labelLower.includes(key)) {
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
    }
    return `rgba(0, 100, 255, ${alpha})`; // Default
}
