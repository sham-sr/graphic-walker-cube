import React from 'react';
import { useMemo } from 'react';
import { IField } from '../../interfaces';
import { getMeaAggKey } from '../../utils';
import { format } from 'd3-format';
import type { INestNode, IPivotCube } from './interface';
import { getCubeCell, leafValuePath } from './cube';

export interface MetricTableProps {
    cube: IPivotCube;
    leftLeaves: INestNode[];
    topLeaves: INestNode[];
    rowHeaders: React.ReactNode[][];
    meaInRows: IField[];
    meaInColumns: IField[];
    defaultAggregated: boolean;
    numberFormat: string;
    paddingTop?: number;
    paddingBottom?: number;
    spacerColumnCount?: number;
}

function getCellData(cell: Record<string, unknown> | undefined, measure: IField, defaultAggregated: boolean, formatter: (value: unknown) => string) {
    const meaKey = defaultAggregated ? getMeaAggKey(measure.fid, measure.aggName) : measure.fid;
    if (!cell || cell[meaKey] === undefined) {
        return '--';
    }
    return formatter(cell[meaKey]);
}

const MetricTable: React.FC<MetricTableProps> = React.memo((props) => {
    const { cube, leftLeaves, topLeaves, rowHeaders, meaInRows, meaInColumns, defaultAggregated, numberFormat, paddingTop = 0, paddingBottom = 0, spacerColumnCount } = props;

    const numberFormatter = useMemo<(value: unknown) => string>(() => {
        let numberFormatter: (value: number) => string;
        try {
            numberFormatter = numberFormat ? format(numberFormat) : (value: number) => value.toLocaleString();
        } catch {
            numberFormatter = (value: number) => value.toLocaleString();
        }
        return (value: unknown) => {
            if (typeof value !== 'number') {
                return `${value}`;
            }
            return numberFormatter(value);
        };
    }, [numberFormat]);

    const metricCols = Math.max(topLeaves.length * Math.max(meaInColumns.length, 1), 1);
    const spacerSpan = spacerColumnCount ?? metricCols;

    return (
        <tbody className="bg-background text-foreground border-r border-b">
            {paddingTop > 0 && (
                <tr aria-hidden="true">
                    <td colSpan={spacerSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
                </tr>
            )}
            {leftLeaves.map((left, rIndex) => {
                if (meaInRows.length !== 0) {
                    return meaInRows.map((rowMea, rmIndex) => {
                        return (
                            <tr className="divide-x divide-border" key={`${rIndex}-${rowMea.fid}-${rowMea.aggName}`}>
                                {rowHeaders[rIndex * meaInRows.length + rmIndex]}
                                {topLeaves.flatMap((top, cIndex) => {
                                    const record = getCubeCell(cube, leafValuePath(left), leafValuePath(top));
                                    if (meaInColumns.length !== 0) {
                                        return meaInColumns.map((colMea) => (
                                            <td
                                                className="whitespace-nowrap p-2 text-xs"
                                                key={`${rIndex}-${cIndex}-${rowMea.fid}-${rowMea.aggName}-${colMea.fid}-${colMea.aggName}`}
                                            >
                                                {getCellData(record, rowMea, defaultAggregated, numberFormatter)} ,{' '}
                                                {getCellData(record, colMea, defaultAggregated, numberFormatter)}
                                            </td>
                                        ));
                                    }
                                    return (
                                        <td className="whitespace-nowrap p-2 text-xs" key={`${rIndex}-${cIndex}-${rowMea.fid}-${rowMea.aggName}`}>
                                            {getCellData(record, rowMea, defaultAggregated, numberFormatter)}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    });
                }
                return (
                    <tr className="divide-x divide-border" key={rIndex}>
                        {rowHeaders[rIndex]}
                        {topLeaves.flatMap((top, cIndex) => {
                            const record = getCubeCell(cube, leafValuePath(left), leafValuePath(top));
                            if (meaInRows.length === 0 && meaInColumns.length !== 0) {
                                return meaInColumns.map((colMea, cmIndex) => (
                                    <td className="whitespace-nowrap p-2 text-xs" key={`${rIndex}-${cIndex}-${cmIndex}-${colMea.fid}-${colMea.aggName}`}>
                                        {getCellData(record, colMea, defaultAggregated, numberFormatter)}
                                    </td>
                                ));
                            } else if (meaInRows.length === 0 && meaInColumns.length === 0) {
                                return (
                                    <td className="whitespace-nowrap p-2 text-xs" key={`${rIndex}-${cIndex}`}>
                                        {`True`}
                                    </td>
                                );
                            }
                            return null;
                        })}
                    </tr>
                );
            })}
            {paddingBottom > 0 && (
                <tr aria-hidden="true">
                    <td colSpan={spacerSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                </tr>
            )}
        </tbody>
    );
});

export default MetricTable;
