import {
    applyChartChrome,
    nextTimeDrillLevel,
    resolveChartChrome,
    resolveOverlayMeasure,
    type ChartChrome,
} from './chartChrome';
import type { IViewField } from '../../interfaces';

const sales: IViewField = { fid: 'sales', name: 'Sales', analyticType: 'measure', semanticType: 'quantitative', aggName: 'sum' };
const profit: IViewField = { fid: 'profit', name: 'Profit', analyticType: 'measure', semanticType: 'quantitative', aggName: 'sum' };
const region: IViewField = { fid: 'region', name: 'Region', analyticType: 'dimension', semanticType: 'nominal' };

const labelsOn: ChartChrome = { ...resolveChartChrome(), showLabels: true };

describe('chart chrome helpers', () => {
    test('defaults keep existing charts unchanged', () => {
        const chrome = resolveChartChrome(undefined);
        expect(chrome).toEqual({
            showLabels: false,
            overlay: 'none',
            reference: 'none',
            donut: false,
            rose: false,
            trendline: false,
            tooltip: 'encoded',
            timeDrill: false,
            lineShape: 'linear',
            labelFormat: 'value',
            horizontal: false,
        });
    });

    test('picks the non-primary measure for a combo overlay', () => {
        expect(resolveOverlayMeasure([sales, profit], [], profit, region)?.fid).toBe('sales');
        expect(resolveOverlayMeasure([sales], [], sales, region)).toBeUndefined();
    });

    test('cycles time units year → … → second and starts at year', () => {
        expect(nextTimeDrillLevel(undefined)).toBe('year');
        expect(nextTimeDrillLevel('year')).toBe('quarter');
        expect(nextTimeDrillLevel('month')).toBe('week');
        expect(nextTimeDrillLevel('second')).toBeUndefined();
        expect(nextTimeDrillLevel('iso_year')).toBe('iso_week');
        expect(nextTimeDrillLevel('iso_week')).toBe('day');
    });

    test('adds a text layer for bar labels', () => {
        const spec = applyChartChrome(
            {
                mark: { type: 'bar' },
                encoding: {
                    x: { field: 'region', type: 'nominal' },
                    y: { field: 'sales_sum', type: 'quantitative' },
                },
            },
            labelsOn,
            { geomType: 'bar', defaultAggregated: true }
        );
        expect(spec.layer).toHaveLength(2);
        expect((spec.layer as { mark: { type: string } }[])[1].mark.type).toBe('text');
        expect(spec.mark).toBeUndefined();
    });

    test('adds a mean rule on the quantitative axis', () => {
        const spec = applyChartChrome(
            {
                mark: 'bar',
                encoding: {
                    x: { field: 'region', type: 'nominal' },
                    y: { field: 'sales_sum', type: 'quantitative' },
                },
            },
            { ...resolveChartChrome(), reference: 'mean' },
            { geomType: 'bar', defaultAggregated: true }
        );
        const rule = (spec.layer as { mark: { type: string }; transform?: { joinaggregate?: { op?: string; field?: string }[] }[] }[])[1];
        expect(rule.mark.type).toBe('rule');
        expect(rule.transform?.[0].joinaggregate?.[0].op).toBe('mean');
        expect(rule.transform?.[0].joinaggregate?.[0].field).toBe('sales_sum');
    });

    test('joinaggregate keeps escaped Cube field names', () => {
        const spec = applyChartChrome(
            {
                mark: { type: 'bar' },
                encoding: {
                    x: { field: 'cube\\.sell_date\\.month', type: 'temporal' },
                    y: { field: 'cube\\.cash_sum', type: 'quantitative' },
                },
            },
            { ...resolveChartChrome(), reference: 'median' },
            { geomType: 'bar', defaultAggregated: true }
        );
        const rule = (spec.layer as { transform?: { joinaggregate?: { field?: string }[] }[] }[])[1];
        expect(rule.transform?.[0].joinaggregate?.[0].field).toBe('cube\\.cash_sum');
    });

    test('overlays a second measure as a line and can split the y scale', () => {
        const spec = applyChartChrome(
            {
                mark: { type: 'bar' },
                encoding: {
                    x: { field: 'region', type: 'nominal' },
                    y: { field: 'sales_sum', type: 'quantitative' },
                },
                params: [{ name: 'geom', select: { type: 'point' } }],
            },
            { ...resolveChartChrome(), overlay: 'dual' },
            { geomType: 'bar', overlayField: profit, defaultAggregated: true }
        );
        const line = (
            spec.layer as { name?: string; mark: { type: string; color?: string }; encoding: { y?: { field?: string } } }[]
        ).find((layer) => layer.name === 'chart-chrome-overlay');
        expect(line?.mark.type).toBe('line');
        expect(line?.mark.color).toBe('#ea580c');
        expect(line?.encoding.y?.field).toBe('profit_sum');
        expect((spec.resolve as { scale: { y: string } }).scale.y).toBe('independent');
        expect(spec.params).toBeUndefined();
        expect((spec.layer as { params?: unknown }[])[0].params).toBeDefined();
    });

    test('turns an arc into a donut without a layer', () => {
        const spec = applyChartChrome(
            { mark: { type: 'arc', opacity: 0.96 }, encoding: { theta: { field: 'sales_sum', type: 'quantitative' } } },
            { ...resolveChartChrome(), donut: true },
            { geomType: 'arc', defaultAggregated: true }
        );
        expect(spec.layer).toBeUndefined();
        expect((spec.mark as { innerRadius: number }).innerRadius).toBe(56);
    });

    test('rose copies theta onto radius', () => {
        const spec = applyChartChrome(
            { mark: { type: 'arc' }, encoding: { theta: { field: 'sales_sum', type: 'quantitative' } } },
            { ...resolveChartChrome(), rose: true },
            { geomType: 'arc', defaultAggregated: true }
        );
        expect((spec.encoding as { radius?: { field?: string; scale?: { type?: string } } }).radius?.field).toBe('sales_sum');
        expect((spec.encoding as { radius?: { scale?: { type?: string } } }).radius?.scale?.type).toBe('sqrt');
        expect((spec.mark as { innerRadius?: number }).innerRadius).toBeUndefined();
    });

    test('smooth and step set Vega interpolate on line marks', () => {
        const base = {
            mark: { type: 'line' },
            encoding: {
                x: { field: 'region', type: 'nominal' },
                y: { field: 'sales_sum', type: 'quantitative' },
            },
        };
        const smooth = applyChartChrome(base, { ...resolveChartChrome(), lineShape: 'smooth' }, { geomType: 'line', defaultAggregated: true });
        expect((smooth.mark as { interpolate?: string }).interpolate).toBe('monotone');
        const step = applyChartChrome({ ...base }, { ...resolveChartChrome(), lineShape: 'step' }, { geomType: 'line', defaultAggregated: true });
        expect((step.mark as { interpolate?: string }).interpolate).toBe('step-after');
    });

    test('horizontal bar swaps x and y encodings', () => {
        const spec = applyChartChrome(
            {
                mark: { type: 'bar' },
                encoding: {
                    x: { field: 'region', type: 'nominal' },
                    y: { field: 'sales_sum', type: 'quantitative' },
                },
            },
            { ...resolveChartChrome(), horizontal: true },
            { geomType: 'bar', defaultAggregated: true }
        );
        expect((spec.encoding as { x?: { field?: string }; y?: { field?: string } }).x?.field).toBe('sales_sum');
        expect((spec.encoding as { x?: { field?: string }; y?: { field?: string } }).y?.field).toBe('region');
    });

    test('percent pie labels joinaggregate the theta field', () => {
        const spec = applyChartChrome(
            { mark: { type: 'arc' }, encoding: { theta: { field: 'sales_sum', type: 'quantitative' } } },
            { ...resolveChartChrome(), showLabels: true, labelFormat: 'percent' },
            { geomType: 'arc', defaultAggregated: true }
        );
        const text = (spec.layer as { encoding?: { text?: { field?: string; format?: string } }; transform?: { joinaggregate?: { field?: string }[] }[] }[])[1];
        expect(text.encoding?.text?.field).toBe('__pie_pct');
        expect(text.encoding?.text?.format).toBe('.0%');
        expect(text.transform?.[0].joinaggregate?.[0].field).toBe('sales_sum');
    });

    test('adds an OLS trend layer for quantitative scatter', () => {
        const spec = applyChartChrome(
            {
                mark: { type: 'point' },
                encoding: {
                    x: { field: 'profit_sum', type: 'quantitative' },
                    y: { field: 'sales_sum', type: 'quantitative' },
                },
            },
            { ...resolveChartChrome(), trendline: true },
            { geomType: 'point', defaultAggregated: true }
        );
        const trend = (spec.layer as { transform?: { method?: string; regression?: string }[] }[])[1];
        expect(trend.transform?.some((step) => step.method === 'linear' && step.regression === '__trend_y')).toBe(true);
    });

    test('binds the color legend for highlight', () => {
        const spec = applyChartChrome(
            {
                mark: { type: 'bar' },
                encoding: {
                    x: { field: 'region', type: 'nominal' },
                    y: { field: 'sales_sum', type: 'quantitative' },
                    color: { field: 'segment', type: 'nominal' },
                },
                params: [{ name: 'geom', select: { type: 'point' } }],
            },
            resolveChartChrome(),
            { geomType: 'bar', defaultAggregated: true }
        );
        expect((spec.params as { name: string }[]).some((param) => param.name === 'legend_sel')).toBe(true);
        expect((spec.encoding as { opacity: { condition: { param: string } } }).opacity.condition.param).toBe('legend_sel');
    });

    test('appends extra tooltip fields in all mode', () => {
        const spec = applyChartChrome(
            {
                mark: { type: 'bar' },
                encoding: {
                    x: { field: 'region', type: 'nominal' },
                    y: { field: 'sales_sum', type: 'quantitative' },
                    tooltip: [{ field: 'sales_sum', title: 'SUM(Sales)' }],
                },
            },
            { ...resolveChartChrome(), tooltip: 'all' },
            { geomType: 'bar', defaultAggregated: true, extraTooltipFields: [sales, region] }
        );
        const tooltip = (spec.encoding as { tooltip: { field: string }[] }).tooltip;
        expect(tooltip.map((item) => item.field)).toEqual(['sales_sum', 'region']);
    });
});
