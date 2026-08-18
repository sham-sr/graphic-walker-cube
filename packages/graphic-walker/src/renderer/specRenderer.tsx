import { Resizable } from 're-resizable';
import React, { forwardRef, useMemo, useContext, useState, useCallback, useEffect } from 'react';

import { PivotTableCore } from '../components/pivotTable';
import type { IPivotTablePath } from '../components/pivotTable/interface';
import { resolvePivotColorMode, resolvePivotDateFormat, resolvePivotHeaderMode, resolvePivotPercentMode, resolvePivotTotals, type PivotColorMode, type PivotDateFormat, type PivotPercentMode, type PivotTotalsMode } from '../components/pivotTable/display';
import LeafletRenderer, { LEAFLET_DEFAULT_HEIGHT, LEAFLET_DEFAULT_WIDTH } from '../components/leafletRenderer';
import ReactVega, { IReactVegaHandler } from '../vis/react-vega';
import ReactEcharts from '../vis/react-echarts';
import { canRenderEcharts } from '../vis/echarts/support';
import { DraggableFieldState, IRow, IThemeKey, IVisualConfigNew, IVisualLayout, VegaGlobalConfig, IChannelScales, IStackMode } from '../interfaces';
import { getTheme } from '../utils/useTheme';
import { GWGlobalConfig } from '../vis/theme';
import { uiThemeContext, themeContext } from '@/store/theme';
import { parseColorToHex } from '@/utils/colors';
import ObservablePlotRenderer from '@/vis/observable-plot-renderer';
import { useCompututaion } from '@/store';
import { useAppRootContext } from '@/components/appRoot';
import { ChartToolbar } from '../components/chartToolbar';
import { chromeFromLayout, resolveOverlayMeasure, type ChartChrome } from '../vis/spec/chartChrome';
import { NULL_FIELD } from '../vis/spec/field';

interface SpecRendererProps {
    name?: string;
    vizThemeConfig?: IThemeKey | GWGlobalConfig;
    data: IRow[];
    draggableFieldState: DraggableFieldState;
    visualConfig: IVisualConfigNew;
    layout: IVisualLayout;
    onGeomClick?: ((values: any, e: any) => void) | undefined;
    onChartResize?: ((width: number, height: number) => void) | undefined;
    locale?: string;
    scales?: IChannelScales;
    onReportSpec?: (spec: string) => void;
    disableCollapse?: boolean;
    exportHandlerRef?: React.RefObject<{
        download: () => void;
        downloadXLSX?: () => void;
        downloadODS?: () => void;
    }>;
    onPivotColorModeChange?: (mode: PivotColorMode) => void;
    onPivotPercentModeChange?: (mode: PivotPercentMode) => void;
    onPivotRowTotalsChange?: (mode: PivotTotalsMode) => void;
    onPivotColumnTotalsChange?: (mode: PivotTotalsMode) => void;
    onPivotRepeatLabelsChange?: (repeat: boolean) => void;
    onPivotDateFormatChange?: (mode: PivotDateFormat) => void;
    onPivotHeaderSort?: (fid: string) => void;
    onPivotKeepPath?: (path: IPivotTablePath) => void;
    onChartChromeChange?: (patch: Partial<ChartChrome>) => void;
    onStackChange?: (mode: IStackMode) => void;
}
/**
 * Sans-store renderer of GraphicWalker.
 * This is a pure component, which means it will not depend on any global state.
 */
const SpecRenderer = forwardRef<IReactVegaHandler, SpecRendererProps>(function (
    { name, layout, data, draggableFieldState, visualConfig, onGeomClick, onChartResize, locale, onReportSpec, vizThemeConfig, scales, disableCollapse, exportHandlerRef, onPivotColorModeChange, onPivotPercentModeChange, onPivotRowTotalsChange, onPivotColumnTotalsChange, onPivotRepeatLabelsChange, onPivotDateFormatChange, onPivotHeaderSort, onPivotKeepPath, onChartChromeChange, onStackChange },
    ref
) {
    // const { draggableFieldState, visualConfig } = vizStore;
    const { geoms, defaultAggregated, coordSystem, timezoneDisplayOffset } = visualConfig;
    const {
        interactiveScale,

        stack,
        showActions,
        size,
        format: _format,
        background,
        zeroScale,
        resolve,
        useSvg,
        primaryColor,
        colorPalette,
        scale,
    } = layout;

    const rows = draggableFieldState.rows;
    const columns = draggableFieldState.columns;
    const pivotFields = useMemo(
        () => [...draggableFieldState.dimensions, ...draggableFieldState.measures],
        [draggableFieldState.dimensions, draggableFieldState.measures]
    );
    const color = draggableFieldState.color;
    const opacity = draggableFieldState.opacity;
    const shape = draggableFieldState.shape;
    const theta = draggableFieldState.theta;
    const radius = draggableFieldState.radius;
    const sizeChannel = draggableFieldState.size;
    const details = draggableFieldState.details;
    const text = draggableFieldState.text;
    const format = _format;

    const isPivotTable = geoms[0] === 'table';
    const layoutChrome = chromeFromLayout(layout);
    const [localChrome, setLocalChrome] = useState<ChartChrome>(layoutChrome);
    const chrome = onChartChromeChange ? layoutChrome : localChrome;
    const [localStack, setLocalStack] = useState<IStackMode>(stack);
    const appliedStack = onStackChange ? stack : localStack;
    useEffect(() => {
        setLocalStack(stack);
    }, [stack]);
    const handleChromeChange = useCallback(
        (patch: Partial<ChartChrome>) => {
            if (onChartChromeChange) {
                onChartChromeChange(patch);
                return;
            }
            setLocalChrome((current) => ({ ...current, ...patch }));
        },
        [onChartChromeChange]
    );
    const handleStackChange = useCallback(
        (mode: IStackMode) => {
            if (onStackChange) {
                onStackChange(mode);
                return;
            }
            setLocalStack(mode);
        },
        [onStackChange]
    );
    const canOverlay = Boolean(
        resolveOverlayMeasure(
            rows.filter((field) => field.analyticType === 'measure'),
            columns.filter((field) => field.analyticType === 'measure'),
            rows[rows.length - 1] ?? NULL_FIELD,
            columns[columns.length - 1] ?? NULL_FIELD
        )
    );
    const extraTooltipFields = useMemo(() => {
        const seen = new Set<string>();
        return [...rows, ...columns, ...color, ...opacity, ...shape, ...sizeChannel, ...theta, ...radius, ...details, ...text].filter((field) => {
            if (!field?.fid || seen.has(`${field.fid}:${field.aggName ?? ''}`)) {
                return false;
            }
            seen.add(`${field.fid}:${field.aggName ?? ''}`);
            return true;
        });
    }, [rows, columns, color, opacity, shape, sizeChannel, theta, radius, details, text]);
    const computation = useCompututaion();
    const appRootRef = useAppRootContext();

    const enableResize = size.mode === 'fixed' && Boolean(onChartResize);
    const mediaTheme = useContext(themeContext);
    const uiTheme = useContext(uiThemeContext);
    const themeConfig = getTheme({
        vizThemeConfig,
        mediaTheme,
        primaryColor,
        colorPalette,
    });

    const vegaConfig = useMemo<VegaGlobalConfig>(() => {
        const config: VegaGlobalConfig = {
            ...themeConfig,
            background: parseColorToHex(uiTheme[mediaTheme].background),
            customFormatTypes: true,
        };
        if (format.normalizedNumberFormat && format.normalizedNumberFormat.length > 0) {
            // @ts-ignore
            config.normalizedNumberFormat = format.normalizedNumberFormat;
        }
        if (format.numberFormat && format.numberFormat.length > 0) {
            // @ts-ignore
            config.numberFormat = format.numberFormat;
        }
        if (format.timeFormat && format.timeFormat.length > 0) {
            // @ts-ignore
            config.timeFormat = format.timeFormat;
        }
        // @ts-ignore
        if (!config.scale) {
            // @ts-ignore
            config.scale = {};
        }
        // @ts-ignore
        config.scale.zero = Boolean(zeroScale);
        // @ts-ignore
        config.resolve = resolve;
        if (background) {
            config.background = background;
        }

        return config;
    }, [themeConfig, mediaTheme, zeroScale, resolve, background, format.normalizedNumberFormat, format.numberFormat, format.timeFormat]);

    if (isPivotTable) {
        return (
            <PivotTableCore
                name={name}
                computation={computation}
                viewData={data}
                fields={pivotFields}
                rows={rows}
                columns={columns}
                filters={draggableFieldState.filters}
                defaultAggregated={defaultAggregated}
                folds={visualConfig.folds}
                limit={visualConfig.limit}
                timezoneDisplayOffset={timezoneDisplayOffset}
                showTableSummary={layout.showTableSummary}
                rowTotals={resolvePivotTotals(layout, defaultAggregated).rows}
                columnTotals={resolvePivotTotals(layout, defaultAggregated).columns}
                numberFormat={layout.format.numberFormat}
                disableCollapse={disableCollapse}
                exportHandlerRef={exportHandlerRef}
                colorMode={resolvePivotColorMode(layout.pivotColorMode)}
                percentMode={resolvePivotPercentMode(layout.pivotPercentMode)}
                onColorModeChange={onPivotColorModeChange}
                onPercentModeChange={onPivotPercentModeChange}
                onRowTotalsChange={onPivotRowTotalsChange}
                onColumnTotalsChange={onPivotColumnTotalsChange}
                repeatLabels={resolvePivotHeaderMode(layout.pivotRepeatLabels) === 'repeat'}
                onRepeatLabelsChange={onPivotRepeatLabelsChange}
                dateFormat={resolvePivotDateFormat(layout.pivotDateFormat)}
                onDateFormatChange={onPivotDateFormatChange}
                dark={mediaTheme === 'dark'}
                onHeaderSort={onPivotHeaderSort}
                onKeepPath={onPivotKeepPath}
                onRenderStatusChange={(status) => appRootRef.current?.updateRenderStatus(status)}
                onError={(error) => console.error(error)}
            />
        );
    }

    const isSpatial = coordSystem === 'geographic';
    const showChartToolbar = !isPivotTable && !isSpatial;
    const chartRenderer = layout.renderer ?? 'echarts';
    const useEcharts = !isSpatial && chartRenderer === 'echarts' && canRenderEcharts(geoms[0], coordSystem);

    return (
        <div className="flex h-full min-h-0 flex-col">
            {showChartToolbar && (
                <ChartToolbar
                    chrome={chrome}
                    geomType={geoms[0]}
                    stack={appliedStack}
                    canOverlay={canOverlay}
                    canTrend={['point', 'circle', 'line', 'area', 'trail'].includes(geoms[0])}
                    canDonut={geoms[0] === 'arc'}
                    canStack={['bar', 'area'].includes(geoms[0]) && Boolean(color[0]?.fid)}
                    canDrill={[...rows, ...columns].some((field) => field.semanticType === 'temporal')}
                    onChange={handleChromeChange}
                    onStackChange={handleStackChange}
                />
            )}
        <Resizable
            className={enableResize ? 'border-primary border-2 max-h-full max-w-full min-h-0 flex-1' : 'max-h-full max-w-full min-h-0 flex-1'}
            style={{ padding: '12px' }}
            onResizeStop={(e, direction, ref, d) => {
                onChartResize?.(size.width + d.width, size.height + d.height);
            }}
            enable={
                enableResize
                    ? undefined
                    : {
                          top: false,
                          right: false,
                          bottom: false,
                          left: false,
                          topRight: false,
                          bottomRight: false,
                          bottomLeft: false,
                          topLeft: false,
                      }
            }
            size={
                // ensure PureRenderer with Auto size is correct
                size.mode === 'fixed'
                    ? {
                          width: size.width + 'px',
                          height: size.height + 'px',
                      }
                    : size.mode === 'full'
                    ? {
                          width: '100%',
                          height: '100%',
                      }
                    : isSpatial
                    ? {
                          width: LEAFLET_DEFAULT_WIDTH + 'px',
                          height: LEAFLET_DEFAULT_HEIGHT + 'px',
                      }
                    : { width: 'auto', height: 'auto' }
            }
        >
            {isSpatial && (
                <LeafletRenderer
                    name={name}
                    data={data}
                    draggableFieldState={draggableFieldState}
                    visualConfig={visualConfig}
                    visualLayout={layout}
                    vegaConfig={vegaConfig}
                    scales={scales}
                    scale={scale}
                />
            )}
            {!isSpatial && useEcharts && (
                <ReactEcharts
                    layoutMode={size.mode}
                    geomType={geoms[0]}
                    defaultAggregate={defaultAggregated}
                    stack={appliedStack}
                    dataSource={data}
                    rows={rows}
                    columns={columns}
                    color={color[0]}
                    theta={theta[0]}
                    details={details}
                    extraTooltipFields={extraTooltipFields}
                    chrome={chrome}
                    vegaConfig={vegaConfig}
                    width={size.width - 12 * 4}
                    height={size.height - 12 * 4}
                    locale={locale}
                    useSvg={useSvg}
                    zeroScale={zeroScale}
                    ref={ref}
                />
            )}
            {!isSpatial && !useEcharts && chartRenderer !== 'observable-plot' && (
                <ReactVega
                    name={name}
                    vegaConfig={vegaConfig}
                    // format={format}
                    layoutMode={size.mode}
                    interactiveScale={interactiveScale}
                    geomType={geoms[0]}
                    defaultAggregate={defaultAggregated}
                    stack={appliedStack}
                    dataSource={data}
                    rows={rows}
                    columns={columns}
                    color={color[0]}
                    theta={theta[0]}
                    radius={radius[0]}
                    shape={shape[0]}
                    opacity={opacity[0]}
                    size={sizeChannel[0]}
                    details={details}
                    text={text[0]}
                    showActions={showActions}
                    width={size.width - 12 * 4}
                    height={size.height - 12 * 4}
                    chrome={chrome}
                    extraTooltipFields={extraTooltipFields}
                    ref={ref}
                    onGeomClick={onGeomClick}
                    locale={locale}
                    useSvg={useSvg}
                    scales={scales}
                    scale={scale}
                    onReportSpec={onReportSpec}
                    displayOffset={timezoneDisplayOffset}
                />
            )}
            {!isSpatial && chartRenderer === 'observable-plot' && (
                <ObservablePlotRenderer
                    name={name}
                    vegaConfig={vegaConfig}
                    // format={format
                    layoutMode={size.mode}
                    interactiveScale={interactiveScale}
                    geomType={geoms[0]}
                    defaultAggregate={defaultAggregated}
                    stack={appliedStack}
                    dataSource={data}
                    rows={rows}
                    columns={columns}
                    color={color[0]}
                    theta={theta[0]}
                    radius={radius[0]}
                    shape={shape[0]}
                    opacity={opacity[0]}
                    size={sizeChannel[0]}
                    details={details}
                    text={text[0]}
                    showActions={showActions}
                    width={size.width - 12 * 4}
                    height={size.height - 12 * 4}
                    ref={ref}
                    onGeomClick={onGeomClick}
                    locale={locale}
                    useSvg={useSvg}
                    scales={scales}
                    scale={scale}
                    onReportSpec={onReportSpec}
                    displayOffset={timezoneDisplayOffset}
                />
            )}
        </Resizable>
        </div>
    );
});

export default SpecRenderer;
