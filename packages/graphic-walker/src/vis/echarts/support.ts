const ECHARTS_GEOMS = new Set(['bar', 'line', 'area', 'trail', 'point', 'circle', 'arc']);

export function canRenderEcharts(geomType: string, coordSystem?: string): boolean {
    if (coordSystem === 'geographic') {
        return false;
    }
    if (geomType === 'table' || geomType === 'boxplot' || geomType === 'text' || geomType === 'rect' || geomType === 'tick') {
        return false;
    }
    if (geomType === 'auto') {
        return true;
    }
    return ECHARTS_GEOMS.has(geomType);
}
