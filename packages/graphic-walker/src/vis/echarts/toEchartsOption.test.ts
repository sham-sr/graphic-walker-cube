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
});
