import React, { useMemo } from 'react';
import { format } from 'd3-format';
import type { IField } from '../../interfaces';
import type { INestNode, IPivotCube, IPivotTablePath } from './interface';
import { getCubeCell, leafValuePath } from './cube';
import { PivotMetricCell } from './metricCell';
import {
    cellDisplayValue,
    collectMeasureExtent,
    filterablePathItems,
    isSummaryLeaf,
    normalize01,
    percentShare,
    readNumericCell,
    type PivotColorMode,
    type PivotPercentMode,
} from './display';

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
    colorMode?: PivotColorMode;
    percentMode?: PivotPercentMode;
    dark?: boolean;
    onKeepPath?: (path: IPivotTablePath) => void;
}

function useNumberFormatter(numberFormat: string) {
    return useMemo<(value: number) => string>(() => {
        try {
            return numberFormat ? format(numberFormat) : (value: number) => value.toLocaleString();
        } catch {
            return (value: number) => value.toLocaleString();
        }
    }, [numberFormat]);
}

const MetricTable: React.FC<MetricTableProps> = React.memo((props) => {
    const {
        cube,
        leftLeaves,
        topLeaves,
        rowHeaders,
        meaInRows,
        meaInColumns,
        defaultAggregated,
        numberFormat,
        paddingTop = 0,
        paddingBottom = 0,
        spacerColumnCount,
        colorMode = 'none',
        percentMode = 'none',
        dark = false,
        onKeepPath,
    } = props;
    const formatNumber = useNumberFormatter(numberFormat);
    const keepEnabled = Boolean(onKeepPath);
    const measures = meaInRows.length ? meaInRows : meaInColumns;

    const extents = useMemo(() => {
        const next = new Map<string, { min: number; max: number }>();
        for (const measure of measures) {
            const extent = collectMeasureExtent(cube, leftLeaves, topLeaves, measure, defaultAggregated, (left, top) => {
                const value = readNumericCell(getCubeCell(cube, leafValuePath(left), leafValuePath(top)), measure, defaultAggregated);
                if (value === undefined) return undefined;
                if (percentMode === 'none') return value;
                return percentShare(cube, leafValuePath(left), leafValuePath(top), measure, defaultAggregated, percentMode, value);
            });
            if (extent) {
                next.set(`${measure.fid}:${measure.aggName ?? ''}`, extent);
            }
        }
        return next;
    }, [cube, defaultAggregated, leftLeaves, meaInColumns, meaInRows, measures, percentMode, topLeaves]);

    const renderMeasureCell = (left: INestNode, top: INestNode, measure: IField, key: string) => {
        const leftPath = leafValuePath(left);
        const topPath = leafValuePath(top);
        const value = readNumericCell(getCubeCell(cube, leftPath, topPath), measure, defaultAggregated);
        const share = percentMode === 'none' || value === undefined ? undefined : percentShare(cube, leftPath, topPath, measure, defaultAggregated, percentMode, value);
        const display = cellDisplayValue(value, share, percentMode, formatNumber);
        const scaled = percentMode === 'none' ? value : share;
        const extent = extents.get(`${measure.fid}:${measure.aggName ?? ''}`);
        const t = scaled !== undefined && extent ? normalize01(scaled, extent.min, extent.max) : undefined;
        return (
            <PivotMetricCell
                key={key}
                text={display.text}
                absText={display.absText}
                percentText={display.percentText}
                t={t}
                colorMode={colorMode}
                isSummary={isSummaryLeaf(left) || isSummaryLeaf(top)}
                missing={display.missing}
                dark={dark}
                keepEnabled={keepEnabled && !isSummaryLeaf(left) && !isSummaryLeaf(top)}
                onKeep={() => onKeepPath?.(filterablePathItems([...leftPath, ...topPath]))}
            />
        );
    };

    const metricCols = Math.max(topLeaves.length * Math.max(meaInColumns.length, 1), 1);
    const spacerSpan = spacerColumnCount ?? metricCols;

    return (
        <tbody className="bg-background text-foreground border-r border-b">
            {paddingTop > 0 && (
                <tr aria-hidden="true">
                    <td colSpan={spacerSpan} style={{ height: paddingTop, padding: 0, border: 0, lineHeight: 0 }} />
                </tr>
            )}
            {leftLeaves.map((left, rIndex) => {
                if (meaInRows.length !== 0) {
                    return meaInRows.map((rowMea, rmIndex) => (
                        <tr className="divide-x divide-border" key={`${rIndex}-${rowMea.fid}-${rowMea.aggName}`}>
                            {rowHeaders[rIndex * meaInRows.length + rmIndex]}
                            {topLeaves.flatMap((top, cIndex) => {
                                if (meaInColumns.length !== 0) {
                                    return meaInColumns.map((colMea) =>
                                        renderMeasureCell(
                                            left,
                                            top,
                                            colMea,
                                            `${rIndex}-${cIndex}-${rowMea.fid}-${rowMea.aggName}-${colMea.fid}-${colMea.aggName}`
                                        )
                                    );
                                }
                                return renderMeasureCell(left, top, rowMea, `${rIndex}-${cIndex}-${rowMea.fid}-${rowMea.aggName}`);
                            })}
                        </tr>
                    ));
                }
                return (
                    <tr className="divide-x divide-border" key={rIndex}>
                        {rowHeaders[rIndex]}
                        {topLeaves.flatMap((top, cIndex) => {
                            if (meaInColumns.length !== 0) {
                                return meaInColumns.map((colMea, cmIndex) =>
                                    renderMeasureCell(left, top, colMea, `${rIndex}-${cIndex}-${cmIndex}-${colMea.fid}-${colMea.aggName}`)
                                );
                            }
                            return (
                                <td className="h-8 max-h-8 whitespace-nowrap px-2 py-0 text-xs leading-8 text-right" key={`${rIndex}-${cIndex}`}>
                                    True
                                </td>
                            );
                        })}
                    </tr>
                );
            })}
            {paddingBottom > 0 && (
                <tr aria-hidden="true">
                    <td colSpan={spacerSpan} style={{ height: paddingBottom, padding: 0, border: 0, lineHeight: 0 }} />
                </tr>
            )}
        </tbody>
    );
});

export default MetricTable;
