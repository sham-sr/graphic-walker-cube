import embed from 'vega-embed';
import type { VisualizationSpec } from 'vega-embed';
import type { IViewField, VegaGlobalConfig } from '../../src/interfaces';
import { toVegaSpec } from '../../src/lib/vega';
import { getMeaAggKey } from '../../src/utils';
import { resolveChartChrome, type ChartChrome } from '../../src/vis/spec/chartChrome';

const DATE = 'micro_complex_tickets_with_trips.sell_date.month';
const CASH = 'micro_complex_tickets_with_trips.cash';
const CASH_AGO = 'micro_complex_tickets_with_trips.cash_1y_ago';
const PAY = 'micro_complex_tickets_with_trips.pay_kind';

const dateField: IViewField = {
    fid: DATE,
    name: 'Дата продажи (месяц)',
    analyticType: 'dimension',
    semanticType: 'temporal',
};
const payField: IViewField = {
    fid: PAY,
    name: 'Способ оплаты',
    analyticType: 'dimension',
    semanticType: 'nominal',
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

const viewRows = Array.from({ length: 12 }, (_, month) => ({
    [DATE]: new Date(Date.UTC(2025, month, 15)).toISOString(),
    [PAY]: month % 2 === 0 ? 'Карта' : 'Наличные',
    [getMeaAggKey(CASH, 'sum')]: 48_000 + month * 12_500 + (month % 3) * 4_000,
    [getMeaAggKey(CASH_AGO, 'sum')]: 92_000 + month * 3_200,
}));

const payRows = [
    {
        [PAY]: 'Карта',
        [getMeaAggKey(CASH, 'sum')]: 687_000,
        [getMeaAggKey(CASH_AGO, 'sum')]: 564_000,
    },
    {
        [PAY]: 'Наличные',
        [getMeaAggKey(CASH, 'sum')]: 762_000,
        [getMeaAggKey(CASH_AGO, 'sum')]: 612_000,
    },
];

const baseArgs = {
    interactiveScale: false,
    dataSource: viewRows,
    layoutMode: 'fixed' as const,
    width: 720,
    height: 340,
    defaultAggregated: true,
    stack: 'stack' as const,
    mediaTheme: 'light' as const,
    vegaConfig: {} as VegaGlobalConfig,
    displayOffset: 0,
    color: undefined,
    opacity: undefined,
    size: undefined,
    shape: undefined,
    theta: undefined,
    radius: undefined,
    text: undefined,
    details: [] as IViewField[],
};

type Scene = {
    id: string;
    spec: Record<string, unknown>;
};

function specOf(
    partial: {
        geomType: string;
        rows: IViewField[];
        columns: IViewField[];
        color?: IViewField;
        theta?: IViewField;
        details?: IViewField[];
        extraTooltipFields?: IViewField[];
        dataSource?: { [key: string]: string | number }[];
        defaultAggregated?: boolean;
    },
    chrome: Partial<ChartChrome>
) {
    const specs = toVegaSpec({
        ...baseArgs,
        ...partial,
        chrome: { ...resolveChartChrome(), ...chrome },
    });
    return specs[0] as Record<string, unknown>;
}

const scenes: Scene[] = [
    {
        id: 'labels',
        spec: specOf({ geomType: 'bar', rows: [cash], columns: [payField], dataSource: payRows }, { showLabels: true }),
    },
    {
        id: 'overlay-line',
        spec: specOf({ geomType: 'bar', rows: [cash, cashAgo], columns: [dateField] }, { overlay: 'line' }),
    },
    {
        id: 'overlay-dual',
        spec: specOf({ geomType: 'line', rows: [cash, cashAgo], columns: [dateField] }, { overlay: 'dual' }),
    },
    {
        id: 'tooltip-encoded',
        spec: specOf({ geomType: 'bar', rows: [cash], columns: [payField], dataSource: payRows }, { tooltip: 'encoded' }),
    },
    {
        id: 'tooltip-all',
        spec: specOf(
            { geomType: 'bar', rows: [cash], columns: [payField], dataSource: payRows, extraTooltipFields: [payField, cash, cashAgo] },
            { tooltip: 'all' }
        ),
    },
    {
        id: 'reference-mean',
        spec: specOf({ geomType: 'bar', rows: [cash], columns: [payField], dataSource: payRows }, { reference: 'mean' }),
    },
    {
        id: 'reference-median',
        spec: specOf({ geomType: 'bar', rows: [cash], columns: [payField], dataSource: payRows }, { reference: 'median' }),
    },
    {
        id: 'donut',
        spec: specOf({ geomType: 'arc', rows: [], columns: [], color: payField, theta: cash, dataSource: payRows }, { donut: true }),
    },
    {
        id: 'trend',
        spec: specOf(
            {
                geomType: 'point',
                rows: [{ ...cash, aggName: undefined }],
                columns: [{ ...cashAgo, aggName: undefined }],
                defaultAggregated: false,
                dataSource: viewRows.map((row, month) => ({
                    [DATE]: row[DATE],
                    [PAY]: row[PAY],
                    [CASH]: 52_000 + month * 6_500 + (month % 2 === 0 ? 38_000 : -22_000) + (month === 8 ? 45_000 : 0),
                    [CASH_AGO]: 70_000 + month * 9_800 + (month % 3) * 7_000,
                })),
            },
            { trendline: true }
        ),
    },
    {
        id: 'legend',
        spec: specOf({ geomType: 'bar', rows: [cash], columns: [dateField], color: payField }, {}),
    },
];

function prepareSpec(spec: Record<string, unknown>, id: string) {
    const clone = JSON.parse(JSON.stringify(spec)) as Record<string, unknown> & {
        params?: { name?: string }[];
        encoding?: { opacity?: { condition?: { param?: string } } };
        layer?: Record<string, unknown>[];
    };
    const rename = (name: string) => `${id.replace(/-/g, '_')}_${name}`;
    const walk = (node: typeof clone) => {
        if (Array.isArray(node.params)) {
            for (const param of node.params) {
                if (param.name) param.name = rename(param.name);
            }
        }
        const opacityParam = node.encoding?.opacity?.condition?.param;
        if (opacityParam) {
            node.encoding!.opacity!.condition!.param = rename(opacityParam);
        }
        node.layer?.forEach((layer) => walk(layer as typeof clone));
    };
    walk(clone);
    return clone;
}

async function mountAll() {
    for (const scene of scenes) {
        const el = document.getElementById(scene.id);
        if (!el) {
            throw new Error(`#${scene.id} missing`);
        }
        try {
            await embed(el, prepareSpec(scene.spec, scene.id) as VisualizationSpec, {
                actions: false,
                renderer: 'svg',
                tooltip: true,
            });
        } catch (error) {
            el.dataset.embedError = String(error);
            throw new Error(`${scene.id}: ${String(error)}`);
        }
    }
    document.body.dataset.reproReady = 'true';
}

void mountAll().catch((error) => {
    console.error(error);
    document.body.dataset.reproError = String(error);
});
