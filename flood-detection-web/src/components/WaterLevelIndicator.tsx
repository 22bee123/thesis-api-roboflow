'use client';

interface WaterLevelIndicatorProps {
    waterLevel: number;
}

export default function WaterLevelIndicator({ waterLevel }: WaterLevelIndicatorProps) {
    // Section colors and labels (from bottom to top)
    const sections = [
        { color: 'bg-green-500', borderColor: 'border-green-500', letter: 'G', level: 25 },
        { color: 'bg-yellow-400', borderColor: 'border-yellow-400', letter: 'Y', level: 50 },
        { color: 'bg-orange-500', borderColor: 'border-orange-500', letter: 'O', level: 75 },
        { color: 'bg-red-500', borderColor: 'border-red-500', letter: 'R', level: 100 },
    ];

    // Determine fill color based on water level
    const getFillColor = () => {
        if (waterLevel >= 100) return 'bg-red-500';
        if (waterLevel >= 75) return 'bg-orange-500';
        if (waterLevel >= 50) return 'bg-yellow-400';
        if (waterLevel >= 25) return 'bg-green-500';
        return 'bg-transparent';
    };

    return (
        <div className="flex flex-col items-center gap-2">
            {/* Percentage display */}
            <span className="text-white text-xl font-bold drop-shadow-lg">
                {waterLevel}%
            </span>

            {/* Water level bar container */}
            <div className="relative w-12 h-52 bg-gray-800/80 border-2 border-white/80 rounded-lg overflow-hidden backdrop-blur-sm">
                {/* Section markers */}
                <div className="absolute inset-0 flex flex-col-reverse">
                    {sections.map((section, index) => (
                        <div
                            key={section.letter}
                            className={`relative flex-1 border-t ${section.borderColor} flex items-center justify-center`}
                        >
                            <span className={`text-sm font-bold ${section.borderColor.replace('border-', 'text-')} drop-shadow`}>
                                {section.letter}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Water fill (animated) */}
                <div
                    className={`absolute bottom-0 left-1 right-1 ${getFillColor()} transition-all duration-500 ease-out rounded-b`}
                    style={{ height: `${waterLevel}%` }}
                />
            </div>

            {/* Label */}
            <div className="text-center">
                <p className="text-white text-sm font-semibold drop-shadow">WATER</p>
                <p className="text-white text-sm font-semibold drop-shadow">LEVEL</p>
            </div>
        </div>
    );
}
