import React, { forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts';
import {
    DatasetComponent,
    GridComponent,
    LegendComponent,
    MarkLineComponent,
    TitleComponent,
    TooltipComponent,
    VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { useResizeDetector } from 'react-resize-detector';
import type { IField, IRow, IStackMode, IViewField, VegaGlobalConfig } from '../interfaces';
import type { IReactVegaHandler } from './react-vega';
import type { ChartChrome } from './spec/chartChrome';
import { themeContext } from '@/store/theme';
import { toEchartsViews } from './echarts/toEchartsOption';
import { scheduleRafResize } from '../utils/rafResize';

echarts.use([
    BarChart,
    HeatmapChart,
    LineChart,
    PieChart,
    ScatterChart,
    GridComponent,
    DatasetComponent,
    TooltipComponent,
    LegendComponent,
    TitleComponent,
    MarkLineComponent,
    VisualMapComponent,
    CanvasRenderer,
    SVGRenderer,
]);

interface ReactEchartsProps {
    layoutMode: string;
    geomType: string;
    rows: readonly IViewField[];
    columns: readonly IViewField[];
    dataSource: readonly IRow[];
    defaultAggregate?: boolean;
    stack: IStackMode;
    color?: IViewField;
    theta?: IViewField;
    size?: IViewField;
    opacity?: IViewField;
    shape?: IViewField;
    text?: IViewField;
    details?: readonly IViewField[];
    extraTooltipFields?: readonly IViewField[];
    chrome?: ChartChrome;
    vegaConfig: VegaGlobalConfig;
    width: number;
    height: number;
    locale?: string;
    datasetFields?: readonly Pick<IField, 'fid' | 'categoryOrder'>[];
    useSvg?: boolean;
    zeroScale?: boolean;
}

const ReactEcharts = forwardRef<IReactVegaHandler, ReactEchartsProps>(function ReactEcharts(props, ref) {
    const hostsRef = useRef<Array<HTMLDivElement | null>>([]);
    const chartsRef = useRef<Array<echarts.ECharts | null>>([]);
    const { width: areaWidth, height: areaHeight, ref: areaRef } = useResizeDetector();
    const mediaTheme = useContext(themeContext);

    const views = useMemo(
        () =>
            toEchartsViews({
                geomType: props.geomType,
                rows: props.rows,
                columns: props.columns,
                dataSource: props.dataSource,
                defaultAggregated: props.defaultAggregate ?? true,
                stack: props.stack,
                color: props.color,
                theta: props.theta,
                size: props.size,
                opacity: props.opacity,
                shape: props.shape,
                text: props.text,
                details: props.details,
                extraTooltipFields: props.extraTooltipFields,
                chrome: props.chrome,
                vegaConfig: props.vegaConfig,
                mediaTheme,
                zeroScale: props.zeroScale ?? true,
                locale: props.locale,
                datasetFields: props.datasetFields,
            }),
        [
            props.geomType,
            props.rows,
            props.columns,
            props.dataSource,
            props.defaultAggregate,
            props.stack,
            props.color,
            props.theta,
            props.size,
            props.opacity,
            props.shape,
            props.text,
            props.details,
            props.extraTooltipFields,
            props.chrome,
            props.vegaConfig,
            props.zeroScale,
            props.locale,
            props.datasetFields,
            mediaTheme,
        ]
    );

    useEffect(() => {
        const charts = hostsRef.current.slice(0, views.options.length).map((el) => {
            if (!el) {
                return null;
            }
            // Ячейка сетки ещё может быть 0×0: без width/height echarts.init пишет предупреждение.
            const size = chartPixelSize(el, props.layoutMode, props.width, props.height);
            return echarts.init(el, undefined, {
                renderer: props.useSvg ? 'svg' : 'canvas',
                locale: props.locale?.startsWith('zh') ? 'ZH' : undefined,
                width: size.width,
                height: size.height,
            });
        });
        chartsRef.current = charts;
        return () => {
            charts.forEach((chart) => chart?.dispose());
            chartsRef.current = [];
        };
        // Размер только для первого кадра: дальше chart.resize, без пересоздания инстанса.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [views.options.length, props.useSvg, props.locale]);

    useEffect(() => {
        views.options.forEach((option, index) => {
            const chart = chartsRef.current[index];
            const el = hostsRef.current[index];
            if (!chart || !el) {
                return;
            }
            chart.setOption(option, { notMerge: true });
            chart.resize(chartPixelSize(el, props.layoutMode, props.width, props.height, areaWidth, areaHeight));
        });
        // areaWidth/areaHeight — отдельный rAF-эффект ниже, без лишнего setOption при ресайзе плитки.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [views, props.layoutMode, props.width, props.height]);

    useEffect(() => {
        const resizeCharts = () => {
            views.options.forEach((_, index) => {
                const chart = chartsRef.current[index];
                const el = hostsRef.current[index];
                if (!chart || !el) {
                    return;
                }
                chart.resize(chartPixelSize(el, props.layoutMode, props.width, props.height, areaWidth, areaHeight));
            });
        };
        return scheduleRafResize(resizeCharts);
    }, [areaWidth, areaHeight, props.layoutMode, props.width, props.height, views.options.length]);

    useImperativeHandle(ref, () => ({
        getSVGData: async () => collectUrls(chartsRef.current, { type: 'svg' }),
        getCanvasData: async () => collectUrls(chartsRef.current, { type: 'png', pixelRatio: 2 }),
        downloadSVG: async (filename?: string) => {
            const urls = collectUrls(chartsRef.current, { type: 'svg' });
            urls.forEach((url, index) => download(url, `${filename ?? 'chart'}${urls.length > 1 ? `-${index + 1}` : ''}.svg`));
            return urls;
        },
        downloadPNG: async (filename?: string) => {
            const urls = collectUrls(chartsRef.current, { type: 'png', pixelRatio: 2 });
            urls.forEach((url, index) => download(url, `${filename ?? 'chart'}${urls.length > 1 ? `-${index + 1}` : ''}.png`));
            return urls;
        },
    }));

    const fill =
        props.layoutMode === 'auto'
            ? 'relative grid w-full min-h-[280px]'
            : 'relative grid h-full min-h-0 w-full overflow-hidden';

    return (
        <div
            ref={areaRef}
            className={fill}
            data-testid="echarts-view"
            style={{
                gridTemplateColumns: `repeat(${views.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${views.rows}, minmax(${props.layoutMode === 'auto' ? '220px' : '0px'}, 1fr))`,
            }}
        >
            {views.options.map((_, index) => (
                <div key={index} className="relative min-h-0 overflow-hidden" data-testid="echarts-cell">
                    <div
                        ref={(node) => {
                            hostsRef.current[index] = node;
                        }}
                        className="absolute inset-0"
                    />
                </div>
            ))}
        </div>
    );
});

function chartPixelSize(
    el: HTMLElement,
    layoutMode: string,
    width: number,
    height: number,
    areaWidth?: number,
    areaHeight?: number,
): { width: number; height: number } {
    return {
        width: Math.max(el.clientWidth || areaWidth || width || 0, 80),
        height: Math.max(el.clientHeight || areaHeight || height || 0, layoutMode === 'auto' ? 200 : 80),
    };
}

function collectUrls(charts: Array<echarts.ECharts | null>, opts: { type: 'svg' | 'png'; pixelRatio?: number }): string[] {
    return charts
        .map((chart) => chart?.getDataURL(opts))
        .filter((url): url is string => Boolean(url));
}

function download(url: string, name: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
}

export default ReactEcharts;
