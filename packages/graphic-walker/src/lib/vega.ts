import { GLOBAL_CONFIG } from '../config';
import { IChannelScales, IRow, IStackMode, IViewField, VegaGlobalConfig } from '../interfaces';
import { encodeFid } from '../vis/spec/encode';
import { NULL_FIELD } from '../vis/spec/field';
import { getSingleView, resolveScales } from '../vis/spec/view';
import { applyChartChrome, resolveChartChrome, resolveOverlayMeasure, type ChartChrome } from '../vis/spec/chartChrome';

const leastOne = (x: number) => Math.max(x, 1);

function withLayoutSize(spec: Record<string, unknown>, layoutMode: string, width: number, height: number) {
    if (layoutMode === 'auto') {
        delete spec.width;
        delete spec.height;
        spec.autosize = { type: 'pad', contains: 'padding' };
        return spec;
    }
    spec.autosize = { type: 'fit', contains: 'padding' };
    spec.width = Math.max((typeof spec.width === 'number' && spec.width > 0 ? spec.width : width) - 5, 120);
    spec.height = Math.max((typeof spec.height === 'number' && spec.height > 0 ? spec.height : height) - 5, 120);
    return spec;
}

export function toVegaSpec({
    rows: rowsRaw,
    columns: columnsRaw,
    color,
    opacity,
    size,
    details = [],
    radius,
    shape,
    text,
    theta,
    interactiveScale,
    dataSource,
    layoutMode,
    width,
    height,
    defaultAggregated,
    geomType,
    stack,
    scales,
    mediaTheme,
    vegaConfig,
    displayOffset,
    chrome,
    extraTooltipFields = [],
}: {
    rows: readonly IViewField[];
    columns: readonly IViewField[];
    color?: IViewField;
    opacity?: IViewField;
    size?: IViewField;
    shape?: IViewField;
    theta?: IViewField;
    radius?: IViewField;
    text?: IViewField;
    details?: Readonly<IViewField[]>;
    interactiveScale: boolean;
    dataSource: readonly IRow[];
    layoutMode: string;
    width: number;
    height: number;
    defaultAggregated: boolean;
    stack: IStackMode;
    geomType: string;
    scales?: IChannelScales;
    mediaTheme: 'dark' | 'light';
    vegaConfig: VegaGlobalConfig;
    displayOffset?: number;
    chrome?: Partial<ChartChrome>;
    extraTooltipFields?: readonly IViewField[];
}) {
    const guard = defaultAggregated ? (x?: IViewField) => x ?? NULL_FIELD : (x?: IViewField) => (x ? (x.aggName === 'expr' ? NULL_FIELD : x) : NULL_FIELD);
    const rows = rowsRaw.map(guard).filter((x) => x !== NULL_FIELD);
    const columns = columnsRaw.map(guard).filter((x) => x !== NULL_FIELD);
    const yField = guard(rows.length > 0 ? rows[rows.length - 1] : NULL_FIELD);
    const xField = guard(columns.length > 0 ? columns[columns.length - 1] : NULL_FIELD);
    const rowDims = rows.filter((f) => f.analyticType === 'dimension');
    const colDims = columns.filter((f) => f.analyticType === 'dimension');
    const rowMeas = rows.filter((f) => f.analyticType === 'measure');
    const colMeas = columns.filter((f) => f.analyticType === 'measure');
    const resolvedChrome = resolveChartChrome(chrome);
    const overlayField =
        resolvedChrome.overlay === 'none' ? undefined : resolveOverlayMeasure(rowMeas, colMeas, yField, xField);
    const collapseRepeat = Boolean(overlayField);
    const rowRepeatFields = collapseRepeat
        ? yField.analyticType === 'measure'
            ? [yField]
            : rowMeas.length === 0
              ? rowDims.slice(-1)
              : [rowMeas[rowMeas.length - 1]]
        : rowMeas.length === 0
          ? rowDims.slice(-1)
          : rowMeas;
    const colRepeatFields = collapseRepeat
        ? xField.analyticType === 'measure' && yField.analyticType !== 'measure'
            ? [xField]
            : colMeas.length === 0
              ? colDims.slice(-1)
              : colMeas.slice(-1)
        : colMeas.length === 0
          ? colDims.slice(-1)
          : colMeas;

    const rowLeftFacetFields = rows.slice(0, -1).filter((f) => f.analyticType === 'dimension');
    const colLeftFacetFields = columns.slice(0, -1).filter((f) => f.analyticType === 'dimension');

    const rowFacetField = rowLeftFacetFields.length > 0 ? rowLeftFacetFields[rowLeftFacetFields.length - 1] : NULL_FIELD;
    const colFacetField = colLeftFacetFields.length > 0 ? colLeftFacetFields[colLeftFacetFields.length - 1] : NULL_FIELD;
    const geomFieldIds = [...rows, ...columns, color, opacity, size, ...details]
        .filter((f) => Boolean(f))
        .filter((f) => f!.aggName !== 'expr')
        .map((f) => (f as IViewField).fid);
    const spec: any = {
        data: {
            values: dataSource,
        },
        params:
            geomType === 'boxplot'
                ? undefined
                : [
                      {
                          name: 'geom',
                          select: {
                              type: 'point',
                              fields: geomFieldIds.map(encodeFid),
                          },
                      },
                  ],
    };
    if (interactiveScale && spec.params) {
        spec.params.push({
            name: 'grid',
            select: 'interval',
            bind: 'scales',
        });
    }
    if (rowRepeatFields.length <= 1 && colRepeatFields.length <= 1) {
        if (layoutMode === 'auto') {
        } else if (rowFacetField === NULL_FIELD && colFacetField === NULL_FIELD) {
            spec.autosize = 'fit';
            spec.width = width - 5;
            spec.height = height - 5;
        } else {
            const rowNums = rowFacetField !== NULL_FIELD ? new Set(dataSource.map((x) => x[rowFacetField.fid])).size : 1;
            const colNums = colFacetField !== NULL_FIELD ? new Set(dataSource.map((x) => x[colFacetField.fid])).size : 1;
            spec.width = Math.floor(width / colNums);
            spec.height = Math.floor(height / rowNums);
        }

        const v = getSingleView({
            x: xField,
            y: yField,
            color: guard(color),
            opacity: guard(opacity),
            size: guard(size),
            shape: guard(shape),
            theta: guard(theta),
            radius: guard(radius),
            text: guard(text),
            row: rowFacetField,
            column: colFacetField,
            xOffset: NULL_FIELD,
            yOffset: NULL_FIELD,
            details: details.map(guard).filter((x) => x !== NULL_FIELD),
            defaultAggregated,
            stack,
            geomType,
            displayOffset,
            dataSource,
            vegaConfig,
        });
        const singleView = scales ? resolveScales(scales, v, dataSource, mediaTheme) : v;

        spec.mark = singleView.mark;
        if ('encoding' in singleView) {
            spec.encoding = singleView.encoding;
        }
        if ('transform' in singleView && singleView.transform.length > 0) {
            spec.transform = singleView.transform;
        }

        spec.resolve ||= {};
        const resolve = (vegaConfig as { resolve?: Record<string, boolean> }).resolve;
        if (resolve) {
            for (const key in resolve) {
                const value = resolve[key] ? 'independent' : 'shared';
                spec.resolve.scale = { ...spec.resolve.scale, [key]: value };
                if ((GLOBAL_CONFIG.POSITION_CHANNEL_CONFIG_LIST as string[]).includes(key)) {
                    spec.resolve.axis = { ...spec.resolve.axis, [key]: value };
                } else if ((GLOBAL_CONFIG.NON_POSITION_CHANNEL_CONFIG_LIST as string[]).includes(key)) {
                    spec.resolve.legend = { ...spec.resolve.legend, [key]: value };
                }
            }
        }
        return [
            applyChartChrome(spec, resolvedChrome, {
                geomType,
                overlayField,
                defaultAggregated,
                extraTooltipFields,
            }) as Record<string, unknown>,
        ].map((next) => withLayoutSize(next, layoutMode, width, height));
    } else {
        if (layoutMode === 'auto') {
        } else if (rowFacetField === NULL_FIELD && colFacetField === NULL_FIELD) {
            spec.width = Math.floor(width / colRepeatFields.length) - 5;
            spec.height = Math.floor(height / rowRepeatFields.length) - 5;
        } else {
            const rowNums = rowFacetField !== NULL_FIELD ? new Set(dataSource.map((x) => x[rowFacetField.fid])).size : 1;
            const colNums = colFacetField !== NULL_FIELD ? new Set(dataSource.map((x) => x[colFacetField.fid])).size : 1;
            spec.width = Math.floor(width / colRepeatFields.length / colNums);
            spec.height = Math.floor(height / rowRepeatFields.length / rowNums);
        }

        let index = 0;
        let result = new Array(rowRepeatFields.length * colRepeatFields.length);
        for (let i = 0; i < leastOne(rowRepeatFields.length); i++) {
            for (let j = 0; j < leastOne(colRepeatFields.length); j++, index++) {
                const hasLegend = j === colRepeatFields.length - 1;
                const showLegend = i == 0;
                const v = getSingleView({
                    x: colRepeatFields[j] || NULL_FIELD,
                    y: rowRepeatFields[i] || NULL_FIELD,
                    color: guard(color),
                    opacity: guard(opacity),
                    size: guard(size),
                    shape: guard(shape),
                    theta: guard(theta),
                    radius: guard(radius),
                    text: guard(text),
                    row: rowFacetField,
                    column: colFacetField,
                    xOffset: NULL_FIELD,
                    yOffset: NULL_FIELD,
                    details,
                    defaultAggregated,
                    stack,
                    geomType,
                    hasLegend,
                    hideLegend: !showLegend,
                    displayOffset,
                    dataSource,
                });
                const singleView = scales ? resolveScales(scales, v, dataSource, mediaTheme) : v;
                let commonSpec = { ...spec };

                const ans = { ...commonSpec, ...singleView };
                if ('params' in commonSpec) {
                    ans.params = commonSpec.params;
                }
                result[index] = withLayoutSize(
                    applyChartChrome(ans, resolvedChrome, {
                        geomType,
                        overlayField,
                        defaultAggregated,
                        extraTooltipFields,
                    }) as Record<string, unknown>,
                    layoutMode,
                    width,
                    height
                );
            }
        }
        return result;
    }
}
