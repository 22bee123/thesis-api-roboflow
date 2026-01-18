import { DetectionResult, Prediction, getLabelColor, getLabelColorRGBA } from './types';

/**
 * Draw segmentation predictions on canvas
 * Equivalent to Python's draw_predictions function using OpenCV
 */
export function drawPredictions(
    ctx: CanvasRenderingContext2D,
    results: DetectionResult | null,
    canvasWidth: number,
    canvasHeight: number
): string[] {
    const detectedLabels: string[] = [];

    if (!results || !results.predictions || results.predictions.length === 0) {
        return detectedLabels;
    }

    // Save context state
    ctx.save();

    for (const pred of results.predictions) {
        const label = pred.class;
        const conf = pred.confidence;
        detectedLabels.push(label);

        const maskColor = getLabelColorRGBA(label, 0.4); // 40% transparency like cv2.addWeighted
        const outlineColor = getLabelColor(label);

        // Check if segmentation points are available
        if (pred.points && pred.points.length > 0) {
            // Instance Segmentation: Draw polygon mask
            const points = pred.points;

            // Draw filled polygon with transparency
            ctx.fillStyle = maskColor;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
            ctx.fill();

            // Draw polygon outline
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
            ctx.stroke();

            // Calculate centroid for label placement
            let cx = 0, cy = 0;
            for (const p of points) {
                cx += p.x;
                cy += p.y;
            }
            cx /= points.length;
            cy /= points.length;

            // Draw label with background
            drawLabel(ctx, label, conf, cx, cy, outlineColor);
        } else {
            // Fallback to bounding box
            const x1 = pred.x - pred.width / 2;
            const y1 = pred.y - pred.height / 2;
            const x2 = pred.x + pred.width / 2;
            const y2 = pred.y + pred.height / 2;

            // Draw filled rectangle with transparency
            ctx.fillStyle = maskColor;
            ctx.fillRect(x1, y1, pred.width, pred.height);

            // Draw rectangle outline
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(x1, y1, pred.width, pred.height);

            // Draw label
            drawLabel(ctx, label, conf, x1, y1 - 5, outlineColor);
        }
    }

    ctx.restore();
    return detectedLabels;
}

function drawLabel(
    ctx: CanvasRenderingContext2D,
    label: string,
    confidence: number,
    x: number,
    y: number,
    bgColor: string
) {
    const labelText = `${label} ${Math.round(confidence * 100)}%`;
    ctx.font = 'bold 14px Inter, sans-serif';
    const metrics = ctx.measureText(labelText);
    const textHeight = 16;
    const padding = 5;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(
        x - metrics.width / 2 - padding,
        y - textHeight - padding,
        metrics.width + padding * 2,
        textHeight + padding * 2
    );

    // Text (black for contrast)
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, x, y - textHeight / 2);
}

/**
 * Calculate water level based on detected labels
 * Matches Python logic: missing colors = covered by water
 */
export function calculateWaterLevel(detectedLabels: string[]): number {
    const detected = detectedLabels.map(l => l.toLowerCase());

    const greenVisible = detected.some(l => l.includes('green'));
    const yellowVisible = detected.some(l => l.includes('yellow'));
    const orangeVisible = detected.some(l => l.includes('orange'));
    const redVisible = detected.some(l => l.includes('red'));

    let waterLevel = 0;
    if (!greenVisible) waterLevel = 25;
    if (!yellowVisible && !greenVisible) waterLevel = 50;
    if (!orangeVisible && !yellowVisible && !greenVisible) waterLevel = 75;
    if (!redVisible && !orangeVisible && !yellowVisible && !greenVisible) waterLevel = 100;

    return waterLevel;
}
