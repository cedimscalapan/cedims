type PieItem = { id: string; value: number };

export type PieSlice = {
    id: string;
    percent: number;
    path: string;
    labelX: number;
    labelY: number;
};

const CENTER = 120;
const RADIUS = 108;
const LABEL_RADIUS = 77;

function point(angle: number, radius: number) {
    const radians = angle * Math.PI / 180;
    return { x: CENTER + Math.cos(radians) * radius, y: CENTER + Math.sin(radians) * radius };
}

/** Returns SVG sectors and whole-number labels whose displayed percentages total 100. */
export function makePieSlices(items: PieItem[]): PieSlice[] {
    const positive = items.filter(item => item.value > 0);
    const total = positive.reduce((sum, item) => sum + item.value, 0);
    if (!total) return [];

    const exact = positive.map(item => item.value / total * 100);
    const percentages = exact.map(Math.floor);
    const remainder = 100 - percentages.reduce((sum, value) => sum + value, 0);
    const largestFractions = exact.map((value, index) => index)
        .sort((a, b) => (exact[b] - percentages[b]) - (exact[a] - percentages[a]) || a - b);
    for (let index = 0; index < remainder; index++) percentages[largestFractions[index]]++;

    let angle = -90;
    return positive.map((item, index) => {
        const sweep = item.value / total * 360;
        const start = point(angle, RADIUS);
        const end = point(angle + sweep, RADIUS);
        const label = point(angle + sweep / 2, sweep >= 359.999 ? 0 : LABEL_RADIUS);
        const path = sweep >= 359.999
            ? `M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER} ${CENTER + RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER} ${CENTER - RADIUS} Z`
            : `M ${CENTER} ${CENTER} L ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 ${sweep > 180 ? 1 : 0} 1 ${end.x} ${end.y} Z`;
        angle += sweep;
        return { id: item.id, percent: percentages[index], path, labelX: label.x, labelY: label.y };
    });
}
