/**
 * Разворачивает history-spec Graphic Walker без статического импорта пакета.
 * Пакет попадает в граф только после вызова loadResolveChart из хоста или фильтров.
 */

type ResolveChart = (data: string) => Record<string, unknown>;

let resolveChart: ResolveChart | null = null;
let loading: Promise<void> | null = null;

export function loadResolveChart(): Promise<void> {
    if (resolveChart) {
        return Promise.resolve();
    }
    loading ??= import('@kanaries/graphic-walker').then((mod) => {
        resolveChart = mod.resolveChart as ResolveChart;
    });
    return loading;
}

/** Синхронно, после loadResolveChart. До загрузки библиотеки возвращает null. */
export function resolveHistoryChart(raw: string): Record<string, unknown> | null {
    if (!resolveChart) {
        return null;
    }
    try {
        const chart = resolveChart(raw);
        return chart && typeof chart === 'object' ? chart : null;
    } catch {
        return null;
    }
}
