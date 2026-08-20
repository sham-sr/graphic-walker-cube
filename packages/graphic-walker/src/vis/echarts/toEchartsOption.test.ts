import { getMeaAggKey } from '../../utils';
import { resolveChartChrome } from '../spec/chartChrome';
import { toEchartsOption, toEchartsViews } from './toEchartsOption';
import type { IViewField, VegaGlobalConfig } from '../../interfaces';

const DATE = 'micro_complex_tickets_with_trips.sell_date.month';
const CASH = 'micro_complex_tickets_with_trips.cash';
const CASH_AGO = 'micro_complex_tickets_with_trips.cash_1y_ago';

const dateField: IViewField = {
    fid: DATE,
    name: 'Дата продажи (месяц)',
    analyticType: 'dimension',
    semanticType: 'temporal',
};
const cash: IViewField = {
    fid: CASH,
    name: 'Платный доход',
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName: 'sum',
};
const cashAgo: IViewField = {
    fid: CASH_AGO,
    name: 'Платный доход (год назад)',
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName: 'sum',
};

const rows = [
    {
        [DATE]: '2025-02-15T00:00:00.000Z',
        [getMeaAggKey(CASH, 'sum')]: 48000,
        [getMeaAggKey(CASH_AGO, 'sum')]: 92000,
    },
    {
        [DATE]: '2025-03-15T00:00:00.000Z',
        [getMeaAggKey(CASH, 'sum')]: 61000,
        [getMeaAggKey(CASH_AGO, 'sum')]: 95000,
    },
];

describe('toEchartsOption', () => {
    const base = {
        dataSource: rows,
        defaultAggregated: true,
        stack: 'stack' as const,
        vegaConfig: {} as VegaGlobalConfig,
        mediaTheme: 'light' as const,
        zeroScale: true,
    };

    test('combo overlay uses a second line series and dual axis when requested', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cashAgo, cash],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), overlay: 'dual' },
        });
        const series = option.series as Array<{ type?: string; yAxisIndex?: number }>;
        expect(series.some((item) => item.type === 'bar')).toBe(true);
        expect(series.some((item) => item.type === 'line' && item.yAxisIndex === 1)).toBe(true);
        expect(Array.isArray(option.yAxis) && option.yAxis.length).toBe(2);
    });

    test('value labels and mean markLine are enabled from chrome', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), showLabels: true, reference: 'mean' },
        });
        const series = option.series as Array<{ label?: { show?: boolean }; markLine?: { data?: { type?: string }[] } }>;
        expect(series[0]?.label?.show).toBe(true);
        expect(series[0]?.markLine?.data?.[0]?.type).toBe('average');
    });

    test('cartesian axes keep field titles for dashboards', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            chrome: resolveChartChrome(),
        });
        const xAxis = option.xAxis as { name?: string; nameLocation?: string };
        const yAxis = (option.yAxis as Array<{ name?: string; nameLocation?: string }>)[0];
        expect(xAxis.name).toBe(dateField.name);
        expect(xAxis.nameLocation).toBe('middle');
        expect(yAxis.name).toContain('Платный доход');
        expect(yAxis.nameLocation).toBe('middle');
        expect(option.title).toBeUndefined();
    });

    test('line charts keep field titles on axes without an ECharts title block', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'line',
            rows: [cash],
            columns: [dateField],
            chrome: resolveChartChrome(),
        });
        const series = option.series as Array<{ type?: string; data?: Array<[number, number]> }>;
        expect(series[0]?.type).toBe('line');
        expect(series[0]?.data?.[0]).toEqual([Date.parse('2025-02-15T00:00:00.000Z'), 48000]);
        expect(series[0]?.data?.[1]).toEqual([Date.parse('2025-03-15T00:00:00.000Z'), 61000]);
        expect(option.title).toBeUndefined();
        expect((option.xAxis as { name?: string; type?: string }).name).toBe(dateField.name);
        expect((option.xAxis as { type?: string }).type).toBe('time');
        expect((option.xAxis as { data?: string[] }).data).toBeUndefined();
    });

    test('horizontal bar keeps swapped axis titles', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), horizontal: true },
        });
        const xAxis = option.xAxis as { name?: string };
        const yAxis = option.yAxis as { name?: string };
        expect(xAxis.name).toContain('Платный доход');
        expect(yAxis.name).toBe(dateField.name);
    });

    test('pie becomes a donut when chrome.donut is on', () => {
        const pay: IViewField = {
            fid: 'pay',
            name: 'Pay',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'arc',
            rows: [],
            columns: [],
            color: pay,
            theta: cash,
            chrome: { ...resolveChartChrome(), donut: true },
        });
        const pie = (option.series as Array<{ type?: string; radius?: string[] }>)[0];
        expect(pie.type).toBe('pie');
        expect(pie.radius?.[0]).not.toBe('0%');
        expect((option.title as { text?: string }).text).toContain('Платный доход');
    });

    test('color field splits the primary series', () => {
        const pay: IViewField = {
            fid: 'pay',
            name: 'Pay',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            color: pay,
            dataSource: [
                { ...rows[0], pay: 'card' },
                { ...rows[1], pay: 'cash' },
            ],
            chrome: resolveChartChrome(),
        });
        const series = option.series as Array<{ name?: string }>;
        expect(series.length).toBeGreaterThanOrEqual(2);
        expect(series.some((item) => item.name === 'card')).toBe(true);
        expect(series.some((item) => item.name === 'cash')).toBe(true);
        expect((option.legend as { orient?: string }).orient).toBe('vertical');
    });

    test('color + stack stacks all series on the same stack id', () => {
        const pay: IViewField = {
            fid: 'pay',
            name: 'Pay',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            color: pay,
            stack: 'stack',
            dataSource: [
                { ...rows[0], pay: 'card' },
                { ...rows[0], pay: 'cash', [getMeaAggKey(CASH, 'sum')]: 12000 },
                { ...rows[1], pay: 'card' },
                { ...rows[1], pay: 'cash', [getMeaAggKey(CASH, 'sum')]: 9000 },
            ],
            chrome: resolveChartChrome(),
        });
        const series = option.series as Array<{ stack?: string }>;
        expect(series.every((item) => item.stack === 'total')).toBe(true);
    });

    test('color + stack none groups bars without a shared stack', () => {
        const pay: IViewField = {
            fid: 'pay',
            name: 'Pay',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            color: pay,
            stack: 'none',
            dataSource: [
                { ...rows[0], pay: 'card' },
                { ...rows[1], pay: 'cash' },
            ],
            chrome: resolveChartChrome(),
        });
        const series = option.series as Array<{ stack?: string }>;
        expect(series.every((item) => item.stack === undefined)).toBe(true);
        expect((option.xAxis as { type?: string }).type).toBe('category');
    });

    test('overlay none splits two measures into separate charts', () => {
        const views = toEchartsViews({
            ...base,
            geomType: 'bar',
            rows: [cashAgo, cash],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), overlay: 'none' },
        });
        expect(views.rows).toBe(2);
        expect(views.cols).toBe(1);
        expect(views.options).toHaveLength(2);
        const titles = views.options.map((option) => (option.yAxis as Array<{ name?: string }>)[0]?.name);
        expect(titles.some((name) => name?.includes('год назад'))).toBe(true);
        expect(titles.some((name) => name?.includes('Платный доход') && !name?.includes('год назад'))).toBe(true);
    });

    test('combo overlay keeps two measures on one chart', () => {
        const views = toEchartsViews({
            ...base,
            geomType: 'bar',
            rows: [cashAgo, cash],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), overlay: 'line' },
        });
        expect(views.options).toHaveLength(1);
    });

    test('pie rose uses radius encoding and percent labels format {d}%', () => {
        const pay: IViewField = {
            fid: 'pay',
            name: 'Pay',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'arc',
            rows: [],
            columns: [],
            color: pay,
            theta: cash,
            chrome: { ...resolveChartChrome(), rose: true, showLabels: true, labelFormat: 'percent' },
        });
        const pie = (option.series as Array<{ type?: string; roseType?: string; radius?: string[]; label?: { formatter?: string } }>)[0];
        expect(pie.roseType).toBe('radius');
        expect(pie.radius?.[0]).toBe('0%');
        expect(pie.label?.formatter).toBe('{d}%');
    });

    test('smooth line sets series.smooth', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'line',
            rows: [cash],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), lineShape: 'smooth' },
        });
        const line = (option.series as Array<{ smooth?: boolean; step?: string }>)[0];
        expect(line.smooth).toBe(true);
        expect(line.step).toBeUndefined();
    });

    test('horizontal bar puts the category on Y and the measure on X', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), horizontal: true },
        });
        const xAxis = option.xAxis as { type?: string };
        const yAxis = option.yAxis as { type?: string };
        const series = (option.series as Array<{ encode?: { x?: string; y?: string }; label?: { position?: string } }>)[0];
        expect(xAxis.type).toBe('value');
        expect(yAxis.type).toBe('category');
        expect(series.encode?.x).toBe(getMeaAggKey(CASH, 'sum'));
        expect(series.encode?.y).toBe(DATE);
        expect(series.label?.position).toBeUndefined();
    });

    test('month grain axis ticks are localized dates, not unix numbers', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            locale: 'ru-RU',
            chrome: resolveChartChrome(),
        });
        const xAxis = option.xAxis as { type?: string; axisLabel?: { formatter?: (value: string | number) => string } };
        expect(xAxis.type).toBe('category');
        const label = xAxis.axisLabel?.formatter?.('2025-02-15T00:00:00.000Z') ?? '';
        expect(label.toLowerCase()).toMatch(/фев/);
        expect(label).toMatch(/2025/);
        expect(label).not.toMatch(/^[0-9.e+-]+$/);
        expect(xAxis.axisLabel?.formatter?.(1739577600000).toLowerCase()).toMatch(/фев/);
    });

    test('line with month grain stays on a time axis and keeps localized ticks', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'line',
            rows: [cash],
            columns: [dateField],
            locale: 'ru-RU',
            chrome: resolveChartChrome(),
        });
        const xAxis = option.xAxis as { type?: string; data?: unknown; minInterval?: number; axisLabel?: { formatter?: (value: string | number) => string } };
        const series = option.series as Array<{ data?: Array<[number, number]> }>;
        expect(xAxis.type).toBe('time');
        expect(xAxis.data).toBeUndefined();
        expect(xAxis.minInterval).toBeGreaterThan(0);
        expect(series[0]?.data?.[0]?.[0]).toBe(Date.parse('2025-02-15T00:00:00.000Z'));
        expect(series[0]?.data?.[0]?.[1]).toBe(48000);
        const label = xAxis.axisLabel?.formatter?.(Date.parse('2025-02-15T00:00:00.000Z')) ?? '';
        expect(label.toLowerCase()).toMatch(/фев/);
        expect(label).toMatch(/2025/);
        expect(label).not.toMatch(/^[0-9.e+-]+$/);
    });

    test('area with month grain also uses time points, not a category axis', () => {
        const option = toEchartsOption({
            ...base,
            geomType: 'area',
            rows: [cash],
            columns: [dateField],
            locale: 'ru-RU',
            chrome: resolveChartChrome(),
        });
        expect((option.xAxis as { type?: string }).type).toBe('time');
        expect((option.series as Array<{ data?: Array<[number, number]> }>)[0]?.data?.length).toBe(2);
    });

    test('circle geom maps a size measure to bubble radius', () => {
        const passengers: IViewField = {
            fid: 'pax',
            name: 'Пассажиры',
            analyticType: 'measure',
            semanticType: 'quantitative',
            aggName: 'sum',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'circle',
            defaultAggregated: true,
            rows: [cash],
            columns: [cashAgo],
            size: passengers,
            dataSource: [
                {
                    [getMeaAggKey(CASH, 'sum')]: 48000,
                    [getMeaAggKey(CASH_AGO, 'sum')]: 92000,
                    [getMeaAggKey('pax', 'sum')]: 10,
                },
                {
                    [getMeaAggKey(CASH, 'sum')]: 61000,
                    [getMeaAggKey(CASH_AGO, 'sum')]: 95000,
                    [getMeaAggKey('pax', 'sum')]: 90,
                },
            ],
            chrome: resolveChartChrome(),
        });
        const series = option.series as Array<{
            type?: string;
            data?: Array<{ symbolSize: number; value: [number, number] }>;
        }>;
        expect(series).toHaveLength(1);
        expect(series[0]?.type).toBe('scatter');
        const sizes = (series[0]?.data ?? []).map((point) => point.symbolSize);
        expect(sizes).toHaveLength(2);
        expect(sizes[1]).toBeGreaterThan(sizes[0]!);
        expect(sizes[0]).toBeGreaterThanOrEqual(10);
        expect(sizes[1]).toBeLessThanOrEqual(52);
    });

    test('encoded tooltip still prints details without tooltip=all', () => {
        const station: IViewField = {
            fid: 'station',
            name: 'Станция',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            details: [station],
            dataSource: [
                { ...rows[0], station: 'Казань' },
                { ...rows[1], station: 'Самара' },
            ],
            chrome: resolveChartChrome(),
        });
        const tooltip = option.tooltip as { formatter?: (params: unknown) => string };
        const html =
            tooltip.formatter?.({
                axisValue: rows[0][DATE],
                axisValueLabel: rows[0][DATE],
                name: String(rows[0][DATE]),
                seriesName: 'sum(Платный доход)',
                value: 48000,
                marker: '',
            }) ?? '';
        expect(html).toContain('Станция');
        expect(html).toContain('Казань');
        expect(html).not.toContain('Самара');
    });

    test('bar opacity varies per category instead of using a constant', () => {
        const share: IViewField = {
            fid: 'share',
            name: 'Доля',
            analyticType: 'measure',
            semanticType: 'quantitative',
            aggName: 'sum',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            opacity: share,
            dataSource: [
                { ...rows[0], [getMeaAggKey('share', 'sum')]: 1 },
                { ...rows[1], [getMeaAggKey('share', 'sum')]: 9 },
            ],
            chrome: resolveChartChrome(),
        });
        const series = option.series as Array<{
            data?: Array<{ itemStyle?: { opacity?: number } }>;
        }>;
        const opacities = (series[0]?.data ?? []).map((item) => item.itemStyle?.opacity ?? 1);
        expect(opacities).toHaveLength(2);
        expect(opacities[1]!).toBeGreaterThan(opacities[0]!);
    });

    test('line size maps to stroke width', () => {
        const passengers: IViewField = {
            fid: 'pax',
            name: 'Пассажиры',
            analyticType: 'measure',
            semanticType: 'quantitative',
            aggName: 'sum',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'line',
            rows: [cash],
            columns: [dateField],
            size: passengers,
            dataSource: [
                { ...rows[0], [getMeaAggKey('pax', 'sum')]: 10 },
                { ...rows[1], [getMeaAggKey('pax', 'sum')]: 90 },
            ],
            chrome: resolveChartChrome(),
        });
        const line = (option.series as Array<{ lineStyle?: { width?: number } }>)[0];
        expect(line.lineStyle?.width).toBeGreaterThan(1.5);
        expect(line.lineStyle?.width).toBeLessThan(7);
        expect(line.lineStyle?.width).not.toBe(2);
    });

    test('pie tooltip includes the size measure and varies label font size', () => {
        const pay: IViewField = {
            fid: 'pay',
            name: 'Pay',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const passengers: IViewField = {
            fid: 'pax',
            name: 'Пассажиры',
            analyticType: 'measure',
            semanticType: 'quantitative',
            aggName: 'sum',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'arc',
            rows: [],
            columns: [],
            color: pay,
            theta: cash,
            size: passengers,
            dataSource: [
                { pay: 'card', [getMeaAggKey(CASH, 'sum')]: 48000, [getMeaAggKey('pax', 'sum')]: 10 },
                { pay: 'cash', [getMeaAggKey(CASH, 'sum')]: 61000, [getMeaAggKey('pax', 'sum')]: 90 },
            ],
            chrome: resolveChartChrome(),
        });
        const pie = (option.series as Array<{
            roseType?: string;
            data?: Array<{ name?: string; label?: { fontSize?: number }; row?: Record<string, unknown> }>;
        }>)[0];
        expect(pie.roseType).toBeUndefined();
        const sizes = (pie.data ?? []).map((slice) => slice.label?.fontSize ?? 0);
        expect(sizes[1]).toBeGreaterThan(sizes[0]!);
        const tooltip = option.tooltip as { formatter?: (params: unknown) => string };
        const html =
            tooltip.formatter?.({
                name: 'card',
                marker: '',
                data: pie.data?.[0],
                value: 48000,
            }) ?? '';
        expect(html).toContain('Пассажиры');
        expect(html).toContain('10');
    });

    test('scatter shape field maps to distinct ECharts symbols', () => {
        const kind: IViewField = {
            fid: 'kind',
            name: 'Тип',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'point',
            defaultAggregated: false,
            rows: [{ ...cash, aggName: undefined }],
            columns: [{ ...cashAgo, aggName: undefined }],
            shape: kind,
            dataSource: [
                { [CASH]: 10, [CASH_AGO]: 20, kind: 'bus' },
                { [CASH]: 30, [CASH_AGO]: 40, kind: 'train' },
            ],
            chrome: resolveChartChrome(),
        });
        const series = option.series as Array<{ data?: Array<{ symbol?: string }> }>;
        const symbols = (series[0]?.data ?? []).map((point) => point.symbol);
        expect(symbols).toHaveLength(2);
        expect(symbols[0]).toBeTruthy();
        expect(symbols[1]).toBeTruthy();
        expect(symbols[0]).not.toBe(symbols[1]);
    });

    test('text field drives cartesian labels even when value labels are off', () => {
        const station: IViewField = {
            fid: 'station',
            name: 'Станция',
            analyticType: 'dimension',
            semanticType: 'nominal',
        };
        const option = toEchartsOption({
            ...base,
            geomType: 'bar',
            rows: [cash],
            columns: [dateField],
            text: station,
            dataSource: [
                { ...rows[0], station: 'Казань' },
                { ...rows[1], station: 'Самара' },
            ],
            chrome: { ...resolveChartChrome(), showLabels: false },
        });
        const series = option.series as Array<{
            label?: { show?: boolean; formatter?: (params: { data?: { row?: Record<string, unknown> } }) => string };
            data?: Array<{ row?: Record<string, unknown> }>;
        }>;
        expect(series[0]?.label?.show).toBe(true);
        expect(series[0]?.label?.formatter?.({ data: series[0]?.data?.[0] })).toBe('Казань');
    });
});
