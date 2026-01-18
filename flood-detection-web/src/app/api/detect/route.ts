import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { image, confidence = 40, overlap = 30 } = await request.json();

        if (!image) {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }

        const apiKey = process.env.ROBOFLOW_API_KEY;
        const modelId = process.env.ROBOFLOW_MODEL_ID;

        if (!apiKey || !modelId) {
            return NextResponse.json({ error: 'API configuration missing' }, { status: 500 });
        }

        const url = `https://detect.roboflow.com/${modelId}`;
        const params = new URLSearchParams({
            api_key: apiKey,
            confidence: confidence.toString(),
            overlap: overlap.toString(),
        });

        const response = await fetch(`${url}?${params}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: image, // base64 encoded image
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Roboflow API error:', response.status, errorText);
            return NextResponse.json(
                { error: 'Detection API error', details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Detection error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: String(error) },
            { status: 500 }
        );
    }
}
