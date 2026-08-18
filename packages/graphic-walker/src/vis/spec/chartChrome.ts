import type { IViewField, IVisualLayout } from '../../interfaces';
import { getMeaAggKey, getMeaAggName } from '../../utils';
import { DATE_TIME_DRILL_LEVELS } from '../../constants';
import { encodeFid, decodeFid } from './encode';

export type ChartOverlayMode = 'none' | 'line' | 'dual';
export type ChartReferenceMode = 'none' | 'mean' | 'median';
export type ChartTooltipMode = 'encoded' | 'all';
export type ChartLineShape = 'linear' | 'smooth' | 'step';
export type ChartLabelFormat = 'value' | 'percent';

export const DEFAULT_CHART_OVERLAY: ChartOverlayMode = 'none';
export const DEFAULT_CHART_REFERENCE: ChartReferenceMode = 'none';
export const DEFAULT_CHART_TOOLTIP: ChartTooltipMode = 'encoded';
export const DEFAULT_CHART_LINE_SHAPE: ChartLineShape = 'linear';
export const DEFAULT_CHART_LABEL_FORMAT: ChartLabelFormat = 'value';
export const TIME_DRILL_ORDER = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second'] as const;

export interface ChartChrome {
    showLabels: boolean;
    overlay: ChartOverlayMode;
    reference: ChartReferenceMode;
    donut: boolean;
    rose: boolean;
    trendline: boolean;
    tooltip: ChartTooltipMode;
    timeDrill: boolean;
    lineShape: ChartLineShape;
    labelFormat: ChartLabelFormat;
    horizontal: boolean;
}

export const DEFAULT_CHART_CHROME: ChartChrome = {
    showLabels: false,
    overlay: DEFAULT_CHART_OVERLAY,
    reference: DEFAULT_CHART_REFERENCE,
    donut: false,
    rose: false,
    trendline: false,
    tooltip: DEFAULT_CHART_TOOLTIP,
    timeDrill: false,
    lineShape: DEFAULT_CHART_LINE_SHAPE,
    labelFormat: DEFAULT_CHART_LABEL_FORMAT,
    horizontal: false,
};

export function chromeFromLayout(layout: {
    chartShowLabels?: boolean;
    chartOverlay?: ChartOverlayMode;
    chartReference?: ChartReferenceMode;
    chartDonut?: boolean;
    chartRose?: boolean;
    chartTrendline?: boolean;
    chartTooltip?: ChartTooltipMode;
    chartTimeDrill?: boolean;
    chartLineShape?: ChartLineShape;
    chartLabelFormat?: ChartLabelFormat;
    chartHorizontal?: boolean;
}): ChartChrome {
    return resolveChartChrome({
        showLabels: layout.chartShowLabels,
        overlay: layout.chartOverlay,
        reference: layout.chartReference,
        donut: layout.chartDonut,
        rose: layout.chartRose,
        trendline: layout.chartTrendline,
        tooltip: layout.chartTooltip,
        timeDrill: layout.chartTimeDrill,
        lineShape: layout.chartLineShape,
        labelFormat: layout.chartLabelFormat,
        horizontal: layout.chartHorizontal,
    });
}

type ChartLayoutKey =
    | 'chartShowLabels'
    | 'chartOverlay'
    | 'chartReference'
    | 'chartDonut'
    | 'chartRose'
    | 'chartTrendline'
    | 'chartTooltip'
    | 'chartTimeDrill'
    | 'chartLineShape'
    | 'chartLabelFormat'
    | 'chartHorizontal';

export function layoutEntriesFromChrome(patch: Partial<ChartChrome>): Array<[ChartLayoutKey, IVisualLayout[ChartLayoutKey]]> {
    const entries: Array<[ChartLayoutKey, IVisualLayout[ChartLayoutKey]]> = [];
    if (patch.showLabels !== undefined) entries.push(['chartShowLabels', patch.showLabels]);
    if (patch.overlay !== undefined) entries.push(['chartOverlay', patch.overlay]);
    if (patch.reference !== undefined) entries.push(['chartReference', patch.reference]);
    if (patch.donut !== undefined) entries.push(['chartDonut', patch.donut]);
    if (patch.rose !== undefined) entries.push(['chartRose', patch.rose]);
    if (patch.trendline !== undefined) entries.push(['chartTrendline', patch.trendline]);
    if (patch.tooltip !== undefined) entries.push(['chartTooltip', patch.tooltip]);
    if (patch.timeDrill !== undefined) entries.push(['chartTimeDrill', patch.timeDrill]);
    if (patch.lineShape !== undefined) entries.push(['chartLineShape', patch.lineShape]);
    if (patch.labelFormat !== undefined) entries.push(['chartLabelFormat', patch.labelFormat]);
    if (patch.horizontal !== undefined) entries.push(['chartHorizontal', patch.horizontal]);
    return entries;
}

export function resolveChartChrome(partial?: Partial<ChartChrome>): ChartChrome {
    return {
        showLabels: partial?.showLabels ?? DEFAULT_CHART_CHROME.showLabels,
        overlay: partial?.overlay ?? DEFAULT_CHART_CHROME.overlay,
        reference: partial?.reference ?? DEFAULT_CHART_CHROME.reference,
        donut: partial?.donut ?? DEFAULT_CHART_CHROME.donut,
        rose: partial?.rose ?? DEFAULT_CHART_CHROME.rose,
        trendline: partial?.trendline ?? DEFAULT_CHART_CHROME.trendline,
        tooltip: partial?.tooltip ?? DEFAULT_CHART_CHROME.tooltip,
        timeDrill: partial?.timeDrill ?? DEFAULT_CHART_CHROME.timeDrill,
        lineShape: partial?.lineShape ?? DEFAULT_CHART_CHROME.lineShape,
        labelFormat: partial?.labelFormat ?? DEFAULT_CHART_CHROME.labelFormat,
        horizontal: partial?.horizontal ?? DEFAULT_CHART_CHROME.horizontal,
    };
}

export function nextTimeDrillLevel(
    current?: (typeof DATE_TIME_DRILL_LEVELS)[number]
): (typeof DATE_TIME_DRILL_LEVELS)[number] | undefined {
    if (!current) {
        return 'year';
    }
    if (current === 'iso_year') {
        return 'iso_week';
    }
    if (current === 'iso_week') {
        return 'day';
    }
    const index = TIME_DRILL_ORDER.indexOf(current as (typeof TIME_DRILL_ORDER)[number]);
    if (index < 0 || index >= TIME_DRILL_ORDER.length - 1) {
        return undefined;
    }
    return TIME_DRILL_ORDER[index + 1];
}

function sameMeasure(left: IViewField, right: IViewField): boolean {
    return left.fid === right.fid && left.aggName === right.aggName;
}

export function resolveOverlayMeasure(
    rowMeasures: readonly IViewField[],
    columnMeasures: readonly IViewField[],
    yField: IViewField,
    xField: IViewField
): IViewField | undefined {
    const primary = yField.analyticType === 'measure' ? yField : xField.analyticType === 'measure' ? xField : undefined;
    if (!primary || !primary.fid) {
        return undefined;
    }
    return [...rowMeasures, ...columnMeasures].find((field) => field.fid && !sameMeasure(field, primary));
}

function measureKey(field: IViewField, aggregated: boolean): string {
    if (!aggregated || !field.aggName || field.aggName === 'expr') {
        return field.fid;
    }
    return getMeaAggKey(field.fid, field.aggName);
}

function compactEncoding(encoding: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(encoding).filter(([, value]) => value !== undefined));
}

function cloneEncoding(channel: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    return channel ? { ...channel } : undefined;
}

function valueEncField(
    valueChannel: 'x' | 'y',
    yEnc: Record<string, unknown> | undefined,
    xEnc: Record<string, unknown> | undefined
): string | undefined {
    const field = (valueChannel === 'y' ? yEnc : xEnc)?.field;
    return typeof field === 'string' && field.length > 0 ? field : undefined;
}

function markTypeOf(mark: unknown): string {
    if (typeof mark === 'string') {
        return mark;
    }
    if (mark && typeof mark === 'object' && 'type' in mark) {
        return String((mark as { type: string }).type);
    }
    return '';
}

function withMarkProps(mark: unknown, extra: Record<string, unknown>): Record<string, unknown> {
    if (typeof mark === 'string') {
        return { type: mark, ...extra };
    }
    if (mark && typeof mark === 'object') {
        return { ...(mark as Record<string, unknown>), ...extra };
    }
    return extra;
}

function datumExpr(rawField: string): string {
    return `datum['${rawField.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`;
}

const FACET_CHANNELS = ['row', 'column'] as const;

export function applyChartChrome(
    spec: Record<string, unknown>,
    chrome: ChartChrome,
    options: {
        geomType: string;
        overlayField?: IViewField;
        defaultAggregated: boolean;
        extraTooltipFields?: readonly IViewField[];
    }
): Record<string, unknown> {
    const geom = options.geomType === 'auto' ? markTypeOf(spec.mark) : options.geomType;
    const encoding: Record<string, unknown> = { ...((spec.encoding as Record<string, unknown>) ?? {}) };
    if (chrome.horizontal && geom === 'bar') {
        const swappedX = encoding.x;
        encoding.x = encoding.y;
        encoding.y = swappedX;
    }
    const needsLayer =
        chrome.showLabels ||
        chrome.reference !== 'none' ||
        chrome.trendline ||
        (chrome.overlay !== 'none' && Boolean(options.overlayField) && geom !== 'arc' && geom !== 'boxplot');

    if (chrome.tooltip === 'all' && options.extraTooltipFields?.length) {
        const existing = Array.isArray(encoding.tooltip) ? (encoding.tooltip as { field?: string }[]) : [];
        const seen = new Set(existing.map((item) => item.field));
        const extras = options.extraTooltipFields
            .map((field) => ({
                field: encodeFid(options.defaultAggregated && field.analyticType === 'measure' ? measureKey(field, true) : field.fid),
                title: options.defaultAggregated && field.analyticType === 'measure' ? getMeaAggName(field.name, field.aggName) : field.name,
                type: field.semanticType === 'quantitative' || field.analyticType === 'measure' ? 'quantitative' : field.semanticType,
            }))
            .filter((item) => item.field && !seen.has(item.field));
        if (extras.length > 0) {
            encoding.tooltip = [...existing, ...extras];
        }
    }

    if (encoding.color && !encoding.opacity) {
        const params = Array.isArray(spec.params) ? [...spec.params] : [];
        const colorEnc = encoding.color as { field?: string; type?: string };
        const colorField = String(colorEnc.field ?? '');
        const skipLegendBind = colorEnc.type === 'quantitative' || colorEnc.type === 'temporal';
        if (colorField && !skipLegendBind && !params.some((param: { name?: string }) => param.name === 'legend_sel')) {
            params.push({
                name: 'legend_sel',
                select: { type: 'point', fields: [colorField] },
                bind: 'legend',
            });
            spec.params = params;
            encoding.opacity = {
                condition: { param: 'legend_sel', value: 1 },
                value: 0.15,
            };
        }
    }

    let mark = spec.mark;
    if (chrome.donut && !chrome.rose && geom === 'arc') {
        mark = withMarkProps(mark, { innerRadius: 56, outerRadius: 96 });
    }
    if (['line', 'area', 'trail'].includes(geom) && chrome.lineShape !== 'linear') {
        mark = withMarkProps(mark, { interpolate: chrome.lineShape === 'smooth' ? 'monotone' : 'step-after' });
    }
    if (chrome.rose && geom === 'arc') {
        const theta = encoding.theta as Record<string, unknown> | undefined;
        if (theta) {
            encoding.radius = {
                ...theta,
                scale: { type: 'sqrt', zero: true },
            };
        }
    }

    if (!needsLayer) {
        spec.mark = mark;
        spec.encoding = encoding;
        return spec;
    }

    const shared: Record<string, unknown> = {};
    const layerEncoding: Record<string, unknown> = { ...encoding };
    for (const channel of FACET_CHANNELS) {
        if (layerEncoding[channel]) {
            shared[channel] = layerEncoding[channel];
            delete layerEncoding[channel];
        }
    }

    const baseLayer: Record<string, unknown> = {
        mark,
        encoding: layerEncoding,
    };
    const layers: Record<string, unknown>[] = [baseLayer];
    const yEnc = layerEncoding.y as Record<string, unknown> | undefined;
    const xEnc = layerEncoding.x as Record<string, unknown> | undefined;
    const thetaEnc = layerEncoding.theta as Record<string, unknown> | undefined;
    const valueChannel = yEnc?.type === 'quantitative' ? 'y' : xEnc?.type === 'quantitative' ? 'x' : undefined;

    if (chrome.showLabels && geom !== 'boxplot') {
        if (geom === 'arc' && thetaEnc) {
            const thetaField = typeof thetaEnc.field === 'string' ? thetaEnc.field : '';
            const percent = chrome.labelFormat === 'percent' && thetaField;
            layers.push({
                mark: { type: 'text', radiusOffset: 12, tooltip: null },
                ...(percent
                    ? {
                          transform: [
                              { joinaggregate: [{ op: 'sum', field: thetaField, as: '__pie_total' }] },
                              { calculate: `${datumExpr(decodeFid(thetaField))} / datum['__pie_total']`, as: '__pie_pct' },
                          ],
                      }
                    : {}),
                encoding: compactEncoding({
                    theta: cloneEncoding(thetaEnc),
                    color: encoding.color ? cloneEncoding(encoding.color as Record<string, unknown>) : undefined,
                    text: percent
                        ? { field: '__pie_pct', type: 'quantitative', format: '.0%' }
                        : cloneEncoding(thetaEnc),
                }),
            });
        } else if (valueChannel) {
            const valueEnc = valueChannel === 'y' ? yEnc : xEnc;
            layers.push({
                mark: {
                    type: 'text',
                    tooltip: null,
                    dy: valueChannel === 'y' && geom === 'bar' ? -6 : 0,
                    dx: valueChannel === 'x' && geom === 'bar' ? 6 : 0,
                    baseline: valueChannel === 'y' ? 'bottom' : 'middle',
                    align: valueChannel === 'x' ? 'left' : 'center',
                },
                encoding: compactEncoding({
                    x: cloneEncoding(xEnc),
                    y: cloneEncoding(yEnc),
                    text: cloneEncoding(valueEnc),
                }),
            });
        }
    }

    if (chrome.reference !== 'none' && valueChannel && geom !== 'arc') {
        const field = valueEncField(valueChannel, yEnc, xEnc);
        if (field) {
            layers.push({
                mark: { type: 'rule', strokeDash: [4, 2], opacity: 0.85, tooltip: null },
                transform: [
                    {
                        // Same escaped name as encoding.field: VL/Vega treat `.` as nested
                        // access, so Cube fids must stay escaped here too.
                        joinaggregate: [{ op: chrome.reference, field, as: '__chart_ref' }],
                    },
                ],
                encoding: {
                    [valueChannel]: {
                        field: '__chart_ref',
                        type: 'quantitative',
                        title: chrome.reference === 'mean' ? 'Mean' : 'Median',
                    },
                },
            });
        }
    }

    if (options.overlayField && chrome.overlay !== 'none' && geom !== 'arc' && geom !== 'boxplot' && valueChannel) {
        const overlayKey = encodeFid(measureKey(options.overlayField, options.defaultAggregated));
        const overlayTitle = options.defaultAggregated
            ? getMeaAggName(options.overlayField.name, options.overlayField.aggName)
            : options.overlayField.name;
        const categoryEnc = valueChannel === 'y' ? xEnc : yEnc;
        const overlayEnc = compactEncoding({
            field: overlayKey,
            type: 'quantitative',
            title: overlayTitle,
            axis: chrome.overlay === 'dual' ? { title: overlayTitle, orient: 'right' } : { title: null },
        });
        layers.push({
            name: 'chart-chrome-overlay',
            mark: {
                type: 'line',
                point: true,
                strokeWidth: 2,
                color: '#ea580c',
                ...(geom === 'line' || geom === 'area' ? { strokeDash: [6, 3] } : {}),
                ...(chrome.lineShape === 'smooth' ? { interpolate: 'monotone' } : {}),
                ...(chrome.lineShape === 'step' ? { interpolate: 'step-after' } : {}),
            },
            encoding: compactEncoding({
                [valueChannel === 'y' ? 'x' : 'y']: cloneEncoding(categoryEnc),
                [valueChannel]: overlayEnc,
            }),
        });
        if (chrome.overlay === 'dual') {
            spec.resolve = {
                ...((spec.resolve as Record<string, unknown>) ?? {}),
                scale: {
                    ...(((spec.resolve as { scale?: Record<string, unknown> } | undefined)?.scale) ?? {}),
                    [valueChannel]: 'independent',
                },
            };
        }
    }

    if (chrome.trendline && geom !== 'arc' && geom !== 'boxplot' && xEnc?.field && yEnc?.field) {
        const xType = String(xEnc.type ?? '');
        const yType = String(yEnc.type ?? '');
        const canRegress = yType === 'quantitative' && (xType === 'quantitative' || xType === 'temporal');
        if (canRegress) {
            const xKey = decodeFid(String(xEnc.field));
            const yKey = decodeFid(String(yEnc.field));
            layers.push({
                mark: { type: 'line', strokeWidth: 2.5, opacity: 0.95 },
                transform: [
                    {
                        calculate: xType === 'temporal' ? `toDate(${datumExpr(xKey)})` : datumExpr(xKey),
                        as: '__trend_x',
                    },
                    { calculate: datumExpr(yKey), as: '__trend_y' },
                    { regression: '__trend_y', on: '__trend_x', method: 'linear' },
                ],
                encoding: {
                    x: { field: '__trend_x', type: 'quantitative' },
                    y: { field: '__trend_y', type: 'quantitative' },
                    color: { value: '#0f172a' },
                },
            });
        }
    }

    const next: Record<string, unknown> = {
        ...spec,
        mark: undefined,
        encoding: Object.keys(shared).length > 0 ? shared : undefined,
        layer: layers,
    };
    delete next.mark;
    if (!next.encoding) {
        delete next.encoding;
    }
    // Vega 5.6 duplicates `geom_tuple` when a point selection lives on a layered
    // parent. Keep the param on the base unit only.
    if (Array.isArray(next.params) && next.params.length > 0) {
        layers[0] = { ...layers[0], params: next.params };
        delete next.params;
    }
    return next;
}
