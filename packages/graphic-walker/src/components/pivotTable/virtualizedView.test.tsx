import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IViewField } from '../../interfaces';
import { buildPivotTable } from '../../workers/buildPivotTable';
import { PivotTableView } from './view';

jest.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: (opts: { count: number }) => {
        const size = 32;
        const visible = Math.min(opts.count, 12);
        return {
            getTotalSize: () => opts.count * size,
            getVirtualItems: () =>
                Array.from({ length: visible }, (_, index) => ({
                    key: index,
                    index,
                    start: index * size,
                    end: (index + 1) * size,
                    size,
                })),
        };
    },
}));

const dimension = (fid: string, name: string): IViewField => ({
    fid,
    name,
    analyticType: 'dimension',
    semanticType: 'nominal',
});

const measure: IViewField = {
    fid: 'sales',
    name: 'Sales',
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName: 'sum',
};

describe('windowed PivotTableView', () => {
    test('keeps nested table headers and collapse controls while rendering only a row window', () => {
        const region = dimension('region', 'Region');
        const city = dimension('city', 'City');
        const data = Array.from({ length: 20 }, (_, regionIndex) =>
            Array.from({ length: 4 }, (_, cityIndex) => ({
                region: `R${regionIndex}`,
                city: `C${cityIndex}`,
                sales_sum: 1,
            }))
        ).flat();
        const result = buildPivotTable([region, city], [], data, [], [], false);
        const markup = renderToStaticMarkup(
            <PivotTableView
                model={{ leftTree: result.lt, topTree: result.tt, cube: result.cube, isEmpty: false }}
                rows={[region, city, measure]}
                columns={[]}
                enableCollapse
                onHeaderCollapse={() => {}}
            />
        );

        expect(markup).toContain('data-virtualized="true"');
        expect(markup).toContain('<table');
        expect(markup).toContain('scope="row"');
        expect(markup).toContain('aria-label="Collapse R0"');
        expect(markup).toContain('rowSpan="4"');
        expect(markup).toContain('C0');
        expect(markup).toContain('R10');
        expect(markup).not.toContain('R19');
        expect(markup).not.toContain('>R2<');
    });
});
