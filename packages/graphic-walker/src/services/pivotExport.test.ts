import type { IField } from '../interfaces';
import { buildNestTree } from '../components/pivotTable/utils';
import { buildPivotSheet } from './pivotExport';

const category: IField = { fid: 'category', name: 'Category', analyticType: 'dimension', semanticType: 'nominal' };
const date: IField = { fid: 'date', name: 'Date', analyticType: 'dimension', semanticType: 'temporal' };
const sales: IField = { fid: 'sales', name: 'Paid', analyticType: 'measure', semanticType: 'quantitative', aggName: 'sum' };
const region: IField = { fid: 'region', name: 'Region', analyticType: 'dimension', semanticType: 'nominal' };
const city: IField = { fid: 'city', name: 'City', analyticType: 'dimension', semanticType: 'nominal' };

const summaryLabels = {
    total: 'Итого',
    totalOf: (name: string) => `Итого: ${name}`,
};

describe('buildPivotSheet', () => {
    test('exports localized totals instead of raw summary keys or NaN dates', () => {
        const data = [
            { category: 'Adult', date: '2021-01-01', sales_sum: 10 },
            { category: 'Child', date: '2021-11-01', sales_sum: 5 },
        ];
        const leftTree = buildNestTree(['category'], data, [], 'grand');
        const topTree = buildNestTree(['date'], data, [], 'grand');
        const sheet = buildPivotSheet({
            leftTree,
            topTree,
            metricTable: [
                [{ sales_sum: 10 }, { sales_sum: null }, { sales_sum: 10 }],
                [{ sales_sum: null }, { sales_sum: 5 }, { sales_sum: 5 }],
                [{ sales_sum: 10 }, { sales_sum: 5 }, { sales_sum: 15 }],
            ],
            dimsInRow: [category],
            dimsInColumn: [date],
            measInRow: [],
            measInColumn: [sales],
            summaryLabels,
        });
        const cells = sheet.data.flat().map((value) => String(value ?? ''));
        expect(cells.some((cell) => cell.includes('__pivot_summary__'))).toBe(false);
        expect(cells.some((cell) => cell.includes('NaN'))).toBe(false);
        expect(cells).toContain('Итого');
    });

    test('repeat mode fills every leaf with ancestor labels and skips merges', () => {
        const data = [
            { region: 'East', city: 'Boston', sales_sum: 9 },
            { region: 'East', city: 'NYC', sales_sum: 11 },
        ];
        const leftTree = buildNestTree(['region', 'city'], data, [], false);
        const topTree = buildNestTree([], data, [], false);
        const sheet = buildPivotSheet({
            leftTree,
            topTree,
            metricTable: [[{ sales_sum: 9 }], [{ sales_sum: 11 }]],
            dimsInRow: [region, city],
            dimsInColumn: [],
            measInRow: [],
            measInColumn: [sales],
            repeatLabels: true,
        });
        expect(sheet.merges).toEqual([]);
        expect(sheet.data.some((row) => row[0] === 'East' && row[1] === 'Boston')).toBe(true);
        expect(sheet.data.some((row) => row[0] === 'East' && row[1] === 'NYC')).toBe(true);
    });

    test('exports truncated ISO month headers in technical date mode', () => {
        const month: IField = { fid: 'tickets.sell_date.month', name: 'Month', analyticType: 'dimension', semanticType: 'temporal' };
        const data = [{ [month.fid]: '2021-11-01T00:00:00.000Z', sales_sum: 5 }];
        const leftTree = buildNestTree([], data, [], false);
        const topTree = buildNestTree([month.fid], data, [], false);
        const sheet = buildPivotSheet({
            leftTree,
            topTree,
            metricTable: [[{ sales_sum: 5 }]],
            dimsInRow: [],
            dimsInColumn: [month],
            measInRow: [],
            measInColumn: [sales],
            dateFormat: 'technical',
        });
        const cells = sheet.data.flat().map((value) => String(value ?? ''));
        expect(cells).toContain('2021-11');
        expect(cells.some((cell) => cell.includes('00:00:00'))).toBe(false);
    });
});
