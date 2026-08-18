import { compile } from 'vega-lite';
import type { IViewField, VegaGlobalConfig } from '../interfaces';
import { toVegaSpec } from './vega';
import { getMeaAggKey } from '../utils';
import { encodeFid } from '../vis/spec/encode';
import { resolveChartChrome } from '../vis/spec/chartChrome';

const DATE = 'micro_complex_tickets_with_trips.sell_date.month';
const CASH = 'micro_complex_tickets_with_trips.cash';
const CASH_AGO = 'micro_complex_tickets_with_trips.cash_1y_ago';
const PAY = 'micro_complex_tickets_with_trips.pay_kind';

const dateField: IViewField = {
    fid: DATE,
    name: 'Дата продажи (month)',
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
const pay: IViewField = {
    fid: PAY,
    name: 'Способ оплаты',
    analyticType: 'dimension',
    semanticType: 'nominal',
};

const yearDrill: IViewField = {
    fid: 'year_sell_date',
    name: 'year (Дата продажи)',
    analyticType: 'dimension',
    semanticType: 'temporal',
    timeUnit: 'year',
    computed: true,
    expression: {
        op: 'dateTimeDrill',
        as: 'year_sell_date',
        params: [
            { type: 'field', value: DATE },
            { type: 'value', value: 'year' },
        ],
    },
};

/** View rows as `useRenderer` emits them: measures already aggregated to `fid_sum`. */
const viewRows = [
    {
        [DATE]: '2025-12-31T19:00:00.000Z',
        [PAY]: 'СБП Сбер',
        [getMeaAggKey(CASH, 'sum')]: 1254,
        [getMeaAggKey(CASH_AGO, 'sum')]: 6142,
        year_sell_date: Date.UTC(2025, 0, 1),
    },
    {
        [DATE]: '2026-01-31T19:00:00.000Z',
        [PAY]: 'SberPay',
        [getMeaAggKey(CASH, 'sum')]: 52808866.5,
        [getMeaAggKey(CASH_AGO, 'sum')]: 3932,
        year_sell_date: Date.UTC(2026, 0, 1),
    },
    {
        [DATE]: '2026-02-28T19:00:00.000Z',
        [PAY]: 'Наличные',
        [getMeaAggKey(CASH, 'sum')]: 41600,
        [getMeaAggKey(CASH_AGO, 'sum')]: 367056.8,
        year_sell_date: Date.UTC(2026, 0, 1),
    },
];

const baseArgs = {
    interactiveScale: false,
    dataSource: viewRows,
    layoutMode: 'auto' as const,
    width: 480,
    height: 320,
    defaultAggregated: true,
    stack: 'stack' as const,
    mediaTheme: 'light' as const,
    vegaConfig: {} as VegaGlobalConfig,
    color: undefined,
    opacity: undefined,
    size: undefined,
    shape: undefined,
    theta: undefined,
    radius: undefined,
    text: undefined,
    details: [] as IViewField[],
};

function compileSpec(spec: unknown) {
    const warnings: string[] = [];
    const compiled = compile(spec as never, {
        logger: {
            level: () => 0,
            warn: (...args: unknown[]) => warnings.push(args.join(' ')),
            info: () => undefined,
            debug: () => undefined,
            error: (...args: unknown[]) => {
                throw new Error(`vega-lite error: ${args.join(' ')}`);
            },
        } as never,
    });
    return { compiled, warnings };
}

describe('chart chrome Vega-Lite compile (Cube dotted fids)', () => {
    test('median + labels + combo overlay compile without mixing aggregates', () => {
        const specs = toVegaSpec({
            ...baseArgs,
            geomType: 'bar',
            rows: [cash, cashAgo],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), overlay: 'line', reference: 'median', showLabels: true },
        });
        expect(specs).toHaveLength(1);
        const spec = specs[0] as { layer?: unknown[]; resolve?: { scale?: { y?: string } } };
        expect(Array.isArray(spec.layer)).toBe(true);
        expect(JSON.stringify(spec)).not.toMatch(/"aggregate":"median"/);
        expect(JSON.stringify(spec)).toContain('joinaggregate');
        const rule = (spec.layer as { transform?: { joinaggregate?: { field?: string; op?: string }[] }[] }[]).find(
            (layer) => layer.transform?.[0]?.joinaggregate
        );
        expect(rule?.transform?.[0].joinaggregate?.[0]).toEqual({
            op: 'median',
            field: encodeFid(getMeaAggKey(CASH_AGO, 'sum')),
            as: '__chart_ref',
        });

        const { compiled, warnings } = compileSpec(spec);
        expect(compiled.spec).toBeDefined();
        expect(warnings.filter((w) => /Infinite extent/i.test(w))).toEqual([]);
    });

    test('line + temporal x + two measures collapses to one spec with an overlay y', () => {
        const specs = toVegaSpec({
            ...baseArgs,
            geomType: 'line',
            rows: [cash, cashAgo],
            columns: [dateField],
            chrome: { ...resolveChartChrome(), overlay: 'dual' },
        });
        expect(specs).toHaveLength(1);
        const spec = specs[0] as {
            layer?: { mark?: { type?: string }; encoding?: { y?: { field?: string; axis?: { orient?: string } } } }[];
            resolve?: { scale?: { y?: string } };
        };
        const yFields = (spec.layer ?? []).map((layer) => layer.encoding?.y?.field).filter(Boolean);
        expect(yFields.some((field) => String(field).includes('cash_1y_ago_sum'))).toBe(true);
        expect(yFields.some((field) => String(field).includes('cash_sum') && !String(field).includes('1y_ago'))).toBe(true);
        expect(spec.resolve?.scale?.y).toBe('independent');
        const overlay = spec.layer?.find((layer) => String(layer.encoding?.y?.field ?? '').includes('cash_sum') && !String(layer.encoding?.y?.field ?? '').includes('1y_ago'));
        expect(overlay?.encoding?.y?.axis?.orient).toBe('right');
        const { compiled } = compileSpec(spec);
        const compiledJson = JSON.stringify(compiled.spec);
        expect(compiled.spec).toBeDefined();
        expect(compiledJson).toContain('cash_sum');
        expect(compiledJson).toContain('cash_1y_ago_sum');
    });

    test('dual-axis overlay compiles with an independent y scale', () => {
        const specs = toVegaSpec({
            ...baseArgs,
            geomType: 'bar',
            rows: [cash, cashAgo],
            columns: [pay],
            chrome: { ...resolveChartChrome(), overlay: 'dual' },
        });
        const spec = specs[0] as { resolve?: { scale?: { y?: string } }; layer?: unknown[] };
        expect(spec.resolve?.scale?.y).toBe('independent');
        expect(spec.layer?.length).toBeGreaterThanOrEqual(2);
        const { compiled } = compileSpec(spec);
        expect(compiled.spec).toBeDefined();
    });

    test('temporal offset transform reads unescaped Cube date keys', () => {
        const specs = toVegaSpec({
            ...baseArgs,
            geomType: 'line',
            rows: [cash],
            columns: [dateField],
            displayOffset: 300,
            chrome: resolveChartChrome(),
        });
        const calculate = (specs[0] as { transform?: { calculate?: string; as?: string }[] }).transform?.find((step) => step.calculate)?.calculate ?? '';
        expect(calculate).toContain(DATE);
        expect(calculate).not.toContain('\\.');
    });

    test('dateTimeDrill year field does not emit Vega timeUnit or a missing .year column', () => {
        const specs = toVegaSpec({
            ...baseArgs,
            geomType: 'bar',
            rows: [cash],
            columns: [yearDrill],
            chrome: resolveChartChrome(),
        });
        const json = JSON.stringify(specs[0]);
        expect(json).not.toContain(`${DATE.replace(/month$/, 'year')}`);
        expect(json).not.toMatch(/"timeUnit":"utcyear"/);
        expect(json).toContain('year_sell_date');
        const { compiled, warnings } = compileSpec(specs[0]);
        expect(compiled.spec).toBeDefined();
        expect(warnings.filter((w) => /Infinite extent/i.test(w) || /sell_date\.year/i.test(w))).toEqual([]);
    });

    test('OLS trendline on two quantitative measures compiles', () => {
        const specs = toVegaSpec({
            ...baseArgs,
            geomType: 'point',
            rows: [cash],
            columns: [cashAgo],
            chrome: { ...resolveChartChrome(), trendline: true },
        });
        const trend = specs[0] as { layer?: { transform?: { regression?: string; on?: string; calculate?: string }[] }[] };
        const steps = trend.layer?.find((layer) => layer.transform?.some((step) => step.regression))?.transform ?? [];
        expect(steps.some((step) => step.regression === '__trend_y' && step.on === '__trend_x')).toBe(true);
        expect(steps.some((step) => step.calculate?.includes(getMeaAggKey(CASH, 'sum')))).toBe(true);
        expect(steps.some((step) => step.calculate?.includes(getMeaAggKey(CASH_AGO, 'sum')))).toBe(true);
        const { compiled } = compileSpec(specs[0]);
        expect(compiled.spec).toBeDefined();
    });

    test('donut innerRadius compiles for an arc', () => {
        const specs = toVegaSpec({
            ...baseArgs,
            geomType: 'arc',
            rows: [],
            columns: [],
            theta: cash,
            color: pay,
            chrome: { ...resolveChartChrome(), donut: true },
        });
        expect((specs[0] as { mark?: { innerRadius?: number } }).mark?.innerRadius).toBe(56);
        const { compiled } = compileSpec(specs[0]);
        expect(compiled.spec).toBeDefined();
    });
});
