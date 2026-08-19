import type { EChartsOption, SeriesOption } from 'echarts';
import type { IRow, IStackMode, IViewField, VegaGlobalConfig } from '../../interfaces';
import { getMeaAggKey, getMeaAggName } from '../../utils';
import { getColor } from '../../utils/useTheme';
import { resolveChartChrome, resolveOverlayMeasure, type ChartChrome } from '../spec/chartChrome';
import { NULL_FIELD } from '../spec/field';
import { formatTemporalLabel, parseTemporal, resolveTimeGrain, timeAxisMinInterval } from './formatTemporal';

const OVERLAY_COLOR = '#ea580c';

export interface ToEchartsOptionArgs {
    geomType: string;
    rows: readonly IViewField[];
    columns: readonly IViewField[];
    dataSource: readonly IRow[];
    defaultAggregated: boolean;
    stack: IStackMode;
    color?: IViewField;
    theta?: IViewField;
    details?: readonly IViewField[];
    extraTooltipFields?: readonly IViewField[];
    chrome?: Partial<ChartChrome>;
    vegaConfig: VegaGlobalConfig;
    mediaTheme: 'light' | 'dark';
    zeroScale: boolean;
    locale?: string;
    width?: number;
    height?: number;
}

function fieldKey(field: IViewField, aggregated: boolean): string {
    if (!aggregated || field.analyticType !== 'measure' || !field.aggName || field.aggName === 'expr') {
        return field.fid;
    }
    return getMeaAggKey(field.fid, field.aggName);
}

function fieldTitle(field: IViewField, aggregated: boolean): string {
    if (!aggregated || field.analyticType !== 'measure') {
        return field.name;
    }
    return getMeaAggName(field.name, field.aggName);
}

function isMeasure(field: IViewField | undefined): field is IViewField {
    return Boolean(field && field.fid && field.analyticType === 'measure');
}

function seriesType(geomType: string): 'bar' | 'line' | 'scatter' | 'pie' {
    if (geomType === 'bar') return 'bar';
    if (geomType === 'arc') return 'pie';
    if (geomType === 'point' || geomType === 'circle') return 'scatter';
    return 'line';
}

function lineShapeProps(shape: ChartChrome['lineShape']): { smooth?: boolean; step?: 'end' } {
    if (shape === 'smooth') return { smooth: true };
    if (shape === 'step') return { step: 'end' };
    return {};
}

function withAxisTitle<T extends Record<string, unknown>>(axis: T, title: string, along: 'x' | 'y', color: string): T {
    return {
        ...axis,
        name: title,
        nameLocation: 'middle',
        nameGap: along === 'y' ? 52 : 36,
        nameRotate: along === 'y' ? 90 : 0,
        nameTextStyle: {
            color,
            fontSize: 12,
            fontWeight: 600,
            overflow: 'truncate',
            width: along === 'y' ? 200 : 280,
        },
    };
}

function uniqueValues(rows: readonly IRow[], key: string): string[] {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const row of rows) {
        const value = String(row[key] ?? '');
        if (!seen.has(value)) {
            seen.add(value);
            values.push(value);
        }
    }
    return values;
}

function valueAt(rows: readonly IRow[], catKey: string, cat: string, meaKey: string, colorKey?: string, group?: string): number {
    let sum = 0;
    for (const row of rows) {
        if (String(row[catKey] ?? '') !== cat) continue;
        if (colorKey && String(row[colorKey] ?? '') !== group) continue;
        const n = Number(row[meaKey]);
        if (Number.isFinite(n)) sum += n;
    }
    return sum;
}

function seriesPairs(
    rows: readonly IRow[],
    catKey: string,
    meaKey: string,
    catType: 'category' | 'time' | 'value',
    horizontal: boolean
): Array<[string | number, string | number]> {
    const points: Array<[string | number, string | number]> = [];
    for (const row of rows) {
        const y = Number(row[meaKey]);
        if (!Number.isFinite(y)) continue;
        if (catType === 'time') {
            const ts = parseTemporal(row[catKey])?.getTime();
            if (ts === undefined) continue;
            points.push(horizontal ? [y, ts] : [ts, y]);
            continue;
        }
        const raw = row[catKey];
        const x = typeof raw === 'number' || typeof raw === 'string' ? raw : String(raw ?? '');
        points.push(horizontal ? [y, x] : [x, y]);
    }
    if (catType === 'time') {
        const xi = horizontal ? 1 : 0;
        points.sort((left, right) => Number(left[xi]) - Number(right[xi]));
    }
    return points;
}

function linearFit(points: Array<{ x: number; y: number }>): { minX: number; maxX: number; yAt: (x: number) => number } | undefined {
    if (points.length < 2) {
        return undefined;
    }
    const n = points.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (const point of points) {
        sumX += point.x;
        sumY += point.y;
        sumXY += point.x * point.y;
        sumXX += point.x * point.x;
    }
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) {
        return undefined;
    }
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return {
        minX: Math.min(...points.map((point) => point.x)),
        maxX: Math.max(...points.map((point) => point.x)),
        yAt: (x: number) => slope * x + intercept,
    };
}

function median(values: number[]): number | undefined {
    if (values.length === 0) {
        return undefined;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function axisType(field: IViewField): 'category' | 'time' | 'value' {
    if (field.semanticType === 'temporal') {
        return 'time';
    }
    if (field.analyticType === 'measure' || field.semanticType === 'quantitative') {
        return 'value';
    }
    return 'category';
}

function verticalLegend(textColor: string, show: boolean): EChartsOption['legend'] {
    if (!show) {
        return { show: false };
    }
    return {
        type: 'scroll',
        orient: 'vertical',
        right: 4,
        top: 'middle',
        align: 'left',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 6,
        pageIconSize: 10,
        textStyle: { color: textColor, fontSize: 11, overflow: 'truncate', width: 112 },
    };
}

export function toEchartsOption(args: ToEchartsOptionArgs): EChartsOption {
    const chrome = resolveChartChrome(args.chrome);
    const colors = getColor(args.vegaConfig);
    const palette = colors.nominalPalette;
    const primary = colors.primaryColor;
    const dark = args.mediaTheme === 'dark';
    const textColor = dark ? '#e5e7eb' : '#374151';
    const muted = dark ? '#9ca3af' : '#6b7280';
    const gridColor = dark ? '#2b3340' : '#e5e7eb';
    const axisLine = dark ? '#6b7280' : '#9ca3af';

    const yMeasures = args.rows.filter(isMeasure);
    const xMeasures = args.columns.filter(isMeasure);
    const yDims = args.rows.filter((field) => field.analyticType === 'dimension');
    const xDims = args.columns.filter((field) => field.analyticType === 'dimension');
    const yField = args.rows[args.rows.length - 1];
    const xField = args.columns[args.columns.length - 1];
    const overlayField = chrome.overlay === 'none' ? undefined : resolveOverlayMeasure(yMeasures, xMeasures, yField ?? NULL_FIELD, xField ?? NULL_FIELD);

    const geom = args.geomType === 'auto' ? (yField?.analyticType === 'measure' && xField?.semanticType === 'temporal' ? 'line' : 'bar') : args.geomType;
    const kind = seriesType(geom);

    if (kind === 'pie') {
        const category = args.color ?? xDims[0] ?? yDims[0];
        const measure = args.theta ?? yMeasures[0] ?? xMeasures[0];
        if (!category || !measure) {
            return { title: { text: '', left: 0 } };
        }
        const catKey = fieldKey(category, false);
        const meaKey = fieldKey(measure, args.defaultAggregated);
        return {
            color: palette,
            backgroundColor: 'transparent',
            title: {
                text: fieldTitle(measure, args.defaultAggregated),
                left: 8,
                top: 0,
                textStyle: { color: textColor, fontSize: 12, fontWeight: 600 },
            },
            tooltip: { trigger: 'item' },
            legend: verticalLegend(textColor, true),
            series: [
                {
                    type: 'pie',
                    name: fieldTitle(measure, args.defaultAggregated),
                    roseType: chrome.rose ? 'radius' : undefined,
                    radius: chrome.donut && !chrome.rose ? ['42%', '68%'] : ['0%', '68%'],
                    itemStyle: { borderRadius: 4, borderColor: dark ? '#1a1f29' : '#fff', borderWidth: 1 },
                    label: {
                        show: chrome.showLabels,
                        color: textColor,
                        formatter: chrome.labelFormat === 'percent' ? '{d}%' : '{c}',
                    },
                    encode: { itemName: catKey, value: meaKey },
                    datasetIndex: 0,
                },
            ],
            dataset: { source: args.dataSource as object[] },
        };
    }

    const categoryField = (yField?.analyticType === 'measure' ? xField : yField) as IViewField | undefined;
    const valueFields = overlayField
        ? [yMeasures[yMeasures.length - 1] ?? xMeasures[xMeasures.length - 1]].filter(Boolean)
        : [...yMeasures, ...xMeasures];
    const primaryMeasure = valueFields[valueFields.length - 1];
    if (!categoryField?.fid || !primaryMeasure) {
        return { backgroundColor: 'transparent' };
    }

    const catKey = fieldKey(categoryField, false);
    const tooltipFields = chrome.tooltip === 'all' && args.extraTooltipFields?.length ? args.extraTooltipFields : [categoryField, ...valueFields, overlayField, args.color].filter(Boolean) as IViewField[];

    const stacked = args.stack === 'stack' || args.stack === 'normalize' || args.stack === 'center' || args.stack === 'zero';
    const series: SeriesOption[] = [];
    const measuresForSeries = overlayField ? [primaryMeasure] : valueFields;
    const colorKey = args.color?.fid ? fieldKey(args.color, false) : undefined;
    const colorGroups = colorKey ? uniqueValues(args.dataSource, colorKey) : [''];
    const categories = uniqueValues(args.dataSource, catKey);
    const type = kind === 'scatter' ? 'scatter' : kind;
    const isArea = geom === 'area';
    const showTrail = geom === 'trail';
    const groupedBar = type === 'bar' && Boolean(colorKey) && !stacked;
    const bandAxis = type === 'bar' && Boolean(colorKey);
    const timeGrain = resolveTimeGrain(categoryField);
    const temporalCategory = categoryField.semanticType === 'temporal';
    const useCategoryTime = temporalCategory && type === 'bar';
    const catType = bandAxis || useCategoryTime ? 'category' : axisType(categoryField);
    const needsExplicitPoints = type === 'line' || isArea || showTrail || type === 'scatter';
    if (temporalCategory) {
        categories.sort((a, b) => {
            const left = parseTemporal(a)?.getTime() ?? Number.NaN;
            const right = parseTemporal(b)?.getTime() ?? Number.NaN;
            if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
                return left - right;
            }
            return a.localeCompare(b);
        });
    }
    const locale = args.locale ?? 'en-US';
    const horizontal = chrome.horizontal && type === 'bar';
    const shape = lineShapeProps(chrome.lineShape);

    measuresForSeries.forEach((measure, measureIndex) => {
        const meaKey = fieldKey(measure, args.defaultAggregated);
        const numericValues = args.dataSource.map((row) => Number(row[meaKey])).filter((value) => Number.isFinite(value));
        const medianValue = median(numericValues);
        const categoryTotals = categories.map((cat) => colorGroups.reduce((sum, group) => sum + valueAt(args.dataSource, catKey, cat, meaKey, colorKey, group), 0));
        colorGroups.forEach((group, groupIndex) => {
            const color = palette[(measureIndex * colorGroups.length + groupIndex) % palette.length] ?? primary;
            const name = colorKey ? group || '—' : fieldTitle(measure, args.defaultAggregated);
            const aligned =
                bandAxis || (needsExplicitPoints && catType === 'category')
                    ? categories.map((cat, index) => {
                          const raw = valueAt(args.dataSource, catKey, cat, meaKey, colorKey, group);
                          if (args.stack !== 'normalize') {
                              return raw;
                          }
                          const total = categoryTotals[index] ?? 0;
                          return total === 0 ? 0 : raw / total;
                      })
                    : undefined;
            const filtered = colorKey ? args.dataSource.filter((row) => String(row[colorKey] ?? '') === group) : args.dataSource;
            const pairData = aligned === undefined && needsExplicitPoints ? seriesPairs(filtered, catKey, meaKey, catType, horizontal) : undefined;
            series.push({
                type,
                name,
                data: aligned ?? pairData ?? (colorKey ? filtered.map((row) => (horizontal ? [row[meaKey], row[catKey]] : [row[catKey], row[meaKey]])) : undefined),
                encode: aligned || pairData || colorKey ? undefined : horizontal ? { x: meaKey, y: catKey } : { x: catKey, y: meaKey },
                datasetIndex: aligned || pairData || colorKey ? undefined : 0,
                showSymbol: showTrail || type === 'scatter',
                symbolSize: type === 'scatter' ? 8 : 5,
                itemStyle: { color },
                lineStyle: type === 'line' ? { width: 2, color } : undefined,
                areaStyle: isArea ? { opacity: 0.18, color } : undefined,
                ...(type === 'line' || isArea ? shape : {}),
                stack: stacked && (type === 'bar' || isArea) && !overlayField ? 'total' : undefined,
                barGap: groupedBar ? '30%' : undefined,
                barCategoryGap: type === 'bar' ? '32%' : undefined,
                label: chrome.showLabels
                    ? {
                          show: true,
                          position: stacked && type === 'bar' ? 'inside' : horizontal ? 'right' : 'top',
                          color: stacked && type === 'bar' ? '#fff' : textColor,
                          fontSize: 11,
                      }
                    : undefined,
                emphasis: { focus: 'series' },
                markLine:
                    chrome.reference !== 'none' && measure === primaryMeasure && groupIndex === 0
                        ? {
                              silent: true,
                              symbol: 'none',
                              lineStyle: { type: 'dashed', color: muted },
                              label: { color: muted },
                              data:
                                  chrome.reference === 'mean'
                                      ? [{ type: 'average', name: 'Mean' }]
                                      : medianValue === undefined
                                        ? []
                                        : [horizontal ? { xAxis: medianValue, name: 'Median' } : { yAxis: medianValue, name: 'Median' }],
                          }
                        : undefined,
            } as SeriesOption);
        });
    });

    if (overlayField) {
        const overlayKey = fieldKey(overlayField, args.defaultAggregated);
        series.push({
            type: 'line',
            name: fieldTitle(overlayField, args.defaultAggregated),
            data: catType === 'category' ? categories.map((cat) => valueAt(args.dataSource, catKey, cat, overlayKey)) : seriesPairs(args.dataSource, catKey, overlayKey, catType, horizontal),
            yAxisIndex: !horizontal && chrome.overlay === 'dual' ? 1 : 0,
            xAxisIndex: horizontal && chrome.overlay === 'dual' ? 1 : 0,
            itemStyle: { color: OVERLAY_COLOR },
            lineStyle: {
                width: 2,
                color: OVERLAY_COLOR,
                type: geom === 'line' || geom === 'area' ? 'dashed' : 'solid',
            },
            ...shape,
            symbol: 'circle',
            symbolSize: 6,
            z: 3,
        } as SeriesOption);
    }

    if (chrome.trendline && kind === 'scatter') {
        const xKey = fieldKey(categoryField, args.defaultAggregated && categoryField.analyticType === 'measure');
        const yKey = fieldKey(primaryMeasure, args.defaultAggregated);
        const points = args.dataSource
            .map((row) => ({ x: Number(row[xKey]), y: Number(row[yKey]) }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
        const fit = linearFit(points);
        if (fit) {
            series.push({
                type: 'line',
                name: 'OLS',
                data: [
                    [fit.minX, fit.yAt(fit.minX)],
                    [fit.maxX, fit.yAt(fit.maxX)],
                ],
                showSymbol: false,
                lineStyle: { width: 2, color: dark ? '#e5e7eb' : '#0f172a' },
                tooltip: { show: false },
                z: 2,
            });
        }
    }

    if (chrome.trendline && (kind === 'line' || geom === 'area') && catType !== 'category') {
        const yKey = fieldKey(primaryMeasure, args.defaultAggregated);
        const points = args.dataSource
            .map((row, index) => {
                const raw = row[catKey];
                const parsed = catType === 'time' ? parseTemporal(raw)?.getTime() : Number(raw);
                const x = typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : index;
                return { x, y: Number(row[yKey]) };
            })
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
        const fit = linearFit(points);
        if (fit) {
            series.push({
                type: 'line',
                name: 'OLS',
                data: [
                    [fit.minX, fit.yAt(fit.minX)],
                    [fit.maxX, fit.yAt(fit.maxX)],
                ],
                showSymbol: false,
                lineStyle: { width: 2, color: dark ? '#e5e7eb' : '#0f172a' },
                tooltip: { show: false },
                xAxisIndex: 0,
                z: 2,
            });
        }
    }

    const extraKeys = tooltipFields.map((field) => ({
        key: fieldKey(field, args.defaultAggregated && field.analyticType === 'measure'),
        title: fieldTitle(field, args.defaultAggregated && field.analyticType === 'measure'),
    }));

    const showLegend = Boolean(colorKey) || Boolean(overlayField) || measuresForSeries.length > 1;
    const dual = Boolean(overlayField && chrome.overlay === 'dual');
    const valueAxis = {
        type: 'value' as const,
        min: args.stack === 'normalize' ? 0 : args.zeroScale ? 0 : undefined,
        max: args.stack === 'normalize' ? 1 : undefined,
        axisLabel: {
            color: muted,
            formatter: args.stack === 'normalize' ? ((value: number) => `${Math.round(value * 100)}%`) : undefined,
        },
        axisLine: { lineStyle: { color: axisLine } },
        splitLine: { lineStyle: { color: gridColor } },
    };
    const dualValueAxis = dual
        ? {
              type: 'value' as const,
              min: args.zeroScale ? 0 : undefined,
              axisLabel: { color: muted },
              axisLine: { lineStyle: { color: axisLine } },
              splitLine: { show: false },
          }
        : undefined;
    const categoryAxis = {
        type: catType,
        data: bandAxis || useCategoryTime ? categories : undefined,
        minInterval: catType === 'time' ? timeAxisMinInterval(timeGrain) : undefined,
        axisLabel: {
            color: muted,
            hideOverlap: true,
            formatter: temporalCategory ? ((value: string | number) => formatTemporalLabel(value, categoryField, locale)) : undefined,
        },
        axisLine: { lineStyle: { color: axisLine } },
        splitLine: catType === 'value' ? { lineStyle: { color: gridColor } } : undefined,
    };
    const meaTitle = fieldTitle(primaryMeasure, args.defaultAggregated);
    const catTitle = fieldTitle(categoryField, false);
    const overlayTitle = overlayField ? fieldTitle(overlayField, args.defaultAggregated) : '';
    const namedValue = withAxisTitle(valueAxis, meaTitle, horizontal ? 'x' : 'y', muted);
    const namedCategory = withAxisTitle(categoryAxis, catTitle, horizontal ? 'y' : 'x', muted);
    const namedDual = dualValueAxis ? withAxisTitle(dualValueAxis, overlayTitle, horizontal ? 'x' : 'y', OVERLAY_COLOR) : undefined;

    return {
        color: palette,
        backgroundColor: 'transparent',
        animationDuration: 280,
        grid: {
            left: 28,
            right: showLegend ? 136 : dual && !horizontal ? 56 : 16,
            top: dual && horizontal ? 40 : 16,
            bottom: 36,
            containLabel: true,
        },
        legend: verticalLegend(textColor, showLegend),
        tooltip: {
            trigger: kind === 'scatter' ? 'item' : 'axis',
            backgroundColor: dark ? '#1a1f29' : '#ffffff',
            borderColor: dark ? '#3a3f4b' : '#e5e7eb',
            textStyle: { color: textColor },
            formatter: (params: unknown) => {
                const items = Array.isArray(params) ? params : [params];
                const first = items[0] as { data?: IRow; name?: string; axisValue?: unknown; axisValueLabel?: string; marker?: string; seriesName?: string; value?: IRow };
                const row = (first?.data && typeof first.data === 'object' && !Array.isArray(first.data) ? first.data : first?.value) as IRow | undefined;
                const rawHead = first?.axisValue ?? first?.name ?? first?.axisValueLabel ?? '';
                const head = temporalCategory ? formatTemporalLabel(rawHead, categoryField, locale) : String(first?.axisValueLabel ?? first?.name ?? '');
                const lines = [`<div style="font-weight:600;margin-bottom:4px">${head}</div>`];
                if (chrome.tooltip === 'all' && row) {
                    for (const field of extraKeys) {
                        const value = row[field.key];
                        if (value === undefined) continue;
                        lines.push(`<div>${field.title}: <b>${String(value)}</b></div>`);
                    }
                    return lines.join('');
                }
                for (const item of items as Array<{ marker?: string; seriesName?: string; value?: unknown; data?: IRow | unknown[] }>) {
                    const dataRow = item.data && typeof item.data === 'object' && !Array.isArray(item.data) ? item.data : undefined;
                    const measure = valueFields.find((field) => item.seriesName?.startsWith(fieldTitle(field, args.defaultAggregated))) ?? overlayField;
                    const encoded = measure && dataRow ? dataRow[fieldKey(measure, args.defaultAggregated)] : undefined;
                    const tupleValue = Array.isArray(item.value)
                        ? item.value[horizontal ? 0 : 1]
                        : typeof item.value === 'number'
                          ? item.value
                          : undefined;
                    lines.push(`<div>${item.marker ?? ''} ${item.seriesName}: <b>${encoded ?? tupleValue ?? ''}</b></div>`);
                }
                return lines.join('');
            },
        },
        dataset: { source: args.dataSource as object[] },
        xAxis: (horizontal ? (namedDual ? [namedValue, namedDual] : namedValue) : namedCategory) as EChartsOption['xAxis'],
        yAxis: (horizontal ? namedCategory : namedDual ? [namedValue, namedDual] : [namedValue]) as EChartsOption['yAxis'],
        series,
    };
}

export interface EchartsViewGrid {
    options: EChartsOption[];
    rows: number;
    cols: number;
}

export function toEchartsViews(args: ToEchartsOptionArgs): EchartsViewGrid {
    const chrome = resolveChartChrome(args.chrome);
    const yMeasures = args.rows.filter(isMeasure);
    const xMeasures = args.columns.filter(isMeasure);
    const yDims = args.rows.filter((field) => field.analyticType === 'dimension');
    const xDims = args.columns.filter((field) => field.analyticType === 'dimension');
    const yField = args.rows[args.rows.length - 1];
    const xField = args.columns[args.columns.length - 1];
    const overlayField = chrome.overlay === 'none' ? undefined : resolveOverlayMeasure(yMeasures, xMeasures, yField ?? NULL_FIELD, xField ?? NULL_FIELD);
    const geom = args.geomType === 'auto' ? (yField?.analyticType === 'measure' && xField?.semanticType === 'temporal' ? 'line' : 'bar') : args.geomType;

    if (seriesType(geom) === 'pie' || overlayField || (yMeasures.length <= 1 && xMeasures.length <= 1)) {
        return { options: [toEchartsOption(args)], rows: 1, cols: 1 };
    }

    const rowRepeat = yMeasures.length > 1 ? yMeasures : [undefined];
    const colRepeat = xMeasures.length > 1 ? xMeasures : [undefined];
    const options: EChartsOption[] = [];
    for (const rowMeasure of rowRepeat) {
        for (const colMeasure of colRepeat) {
            options.push(
                toEchartsOption({
                    ...args,
                    rows: rowMeasure ? [...yDims, rowMeasure] : args.rows,
                    columns: colMeasure ? [...xDims, colMeasure] : args.columns,
                })
            );
        }
    }
    return { options, rows: rowRepeat.length, cols: colRepeat.length };
}
