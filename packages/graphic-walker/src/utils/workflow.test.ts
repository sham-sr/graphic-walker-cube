import type { IDataQueryWorkflowStep, IViewField } from '../interfaces';
import { toWorkflow } from './workflow';

const dimension = (fid: string): IViewField => ({
    fid,
    name: fid,
    analyticType: 'dimension',
    semanticType: 'nominal',
});

const measure = (fid: string, aggName = 'sum'): IViewField => ({
    fid,
    name: fid,
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName,
});

const exprMeasure = (fid: string, sql: string): IViewField => ({
    fid,
    name: fid,
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName: 'expr',
    computed: true,
    expression: { op: 'expr', as: fid, params: [{ type: 'sql', value: sql }] },
});

function aggregateMeasures(workflow: IDataQueryWorkflowStep[]) {
    const view = workflow.find((step) => step.type === 'view');
    if (!view || view.type !== 'view' || view.query[0]?.op !== 'aggregate') {
        return [];
    }
    return view.query[0].measures;
}

describe('toWorkflow expr component aggregates', () => {
    const region = dimension('region');
    const sales = measure('sales');
    const prev = measure('prev');
    const yoy = exprMeasure('yoy', '(sum("sales") - sum("prev")) / nullif(sum("prev"), 0)');

    test('adds additive component measures beside the expr', () => {
        const measures = aggregateMeasures(toWorkflow([], [region, sales, prev, yoy], [region], [yoy], true, 'none'));
        expect(measures).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ agg: 'expr', asFieldKey: 'yoy' }),
                { field: 'sales', agg: 'sum', asFieldKey: 'sales_sum' },
                { field: 'prev', agg: 'sum', asFieldKey: 'prev_sum' },
            ])
        );
        expect(measures.filter((item) => item.asFieldKey === 'yoy')).toHaveLength(1);
        expect(measures.find((item) => item.asFieldKey === 'yoy')?.field).not.toBe('yoy');
    });

    test('does not duplicate a component that is already a view measure', () => {
        const measures = aggregateMeasures(toWorkflow([], [region, sales, prev, yoy], [region], [sales, yoy], true, 'none'));
        expect(measures.filter((item) => item.asFieldKey === 'sales_sum')).toHaveLength(1);
    });

    test('does not add components for non-additive expressions', () => {
        const share = exprMeasure('share', 'avg("sales") / avg("prev")');
        const measures = aggregateMeasures(toWorkflow([], [region, sales, prev, share], [region], [share], true, 'none'));
        expect(measures.find((item) => item.asFieldKey === 'share')?.agg).toBe('expr');
        expect(measures.some((item) => item.asFieldKey === 'sales_sum')).toBe(false);
    });
});
