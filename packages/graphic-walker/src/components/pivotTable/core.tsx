import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IComputationFunction, IFilterField, IRenderStatus, IRow, IViewField } from '../../interfaces';
import LoadingLayer from '../loadingLayer';
import { buildPivotSheet } from '../../services/pivotExport';
import { buildCsvContent, exportSpreadsheet } from '../../services/spreadsheetExport';
import { download } from '../../utils/save';
import type { INestNode, IPivotTableModel, IPivotTablePath } from './interface';
import { getPivotTableFields, queryPivotTable, type PivotTableModelBuilder } from './query';
import { materializeMetricMatrix, pivotTableValuesEqual } from './utils';
import { PivotTableView } from './view';
import { PivotTableToolbar } from './toolbar';
import {
    resolvePivotColorMode,
    resolvePivotHeaderMode,
    resolvePivotPercentMode,
    resolvePivotTotals,
    showTableSummaryFromTotals,
    type PivotColorMode,
    type PivotHeaderMode,
    type PivotPercentMode,
    type PivotTotalsMode,
} from './display';
import { collectCollapsiblePaths } from './treeWalk';

const EMPTY_FILTERS: readonly IFilterField[] = [];
const EMPTY_PATHS: readonly IPivotTablePath[] = [];

function pathsEqual(left: readonly { key: string; value: unknown }[], right: readonly { key: string; value: unknown }[]): boolean {
    return left.length === right.length && left.every((item, index) => item.key === right[index].key && pivotTableValuesEqual(item.value, right[index].value));
}

function isPathPrefix(prefix: readonly { key: string; value: unknown }[], path: readonly { key: string; value: unknown }[]): boolean {
    return prefix.length <= path.length && prefix.every((item, index) => item.key === path[index].key && pivotTableValuesEqual(item.value, path[index].value));
}

export function togglePivotTablePath(paths: readonly IPivotTablePath[], target: IPivotTablePath): IPivotTablePath[] {
    const exists = paths.some((path) => pathsEqual(path, target));
    const nextPaths = paths
        .filter((path) => !pathsEqual(path, target) && !isPathPrefix(target, path))
        .map((path) => [...path]);
    if (!exists) {
        nextPaths.push([...target]);
    }
    return nextPaths;
}

export function nextCollapseAllPaths(current: readonly IPivotTablePath[], all: readonly IPivotTablePath[]): IPivotTablePath[] {
    if (all.length === 0) {
        return [];
    }
    return current.length > 0 ? [] : all.map((path) => path.map((item) => ({ ...item })));
}

export function shouldRenderPivotTableModel(model: IPivotTableModel | null): boolean {
    return model !== null && !model.isEmpty;
}

export interface PivotTableCoreProps {
    computation: IComputationFunction;
    fields: readonly IViewField[];
    rows: readonly IViewField[];
    columns: readonly IViewField[];
    filters?: readonly IFilterField[];
    defaultAggregated?: boolean;
    folds?: readonly string[];
    limit?: number;
    timezoneDisplayOffset?: number;
    showTableSummary?: boolean;
    rowTotals?: PivotTotalsMode;
    columnTotals?: PivotTotalsMode;
    numberFormat?: string;
    disableCollapse?: boolean;
    collapsedPaths?: readonly IPivotTablePath[];
    defaultCollapsedPaths?: readonly IPivotTablePath[];
    onCollapsedPathsChange?: (paths: IPivotTablePath[]) => void;
    onRenderStatusChange?: (status: IRenderStatus) => void;
    onError?: (error: Error) => void;
    emptyContent?: React.ReactNode;
    /** Aggregated leaf data supplied by Graphic Walker's existing renderer. */
    viewData?: readonly IRow[];
    /** Test and non-browser adapter for the model-building worker. */
    buildModel?: PivotTableModelBuilder;
    /** Optional chart/file name used by CSV/XLSX/ODS export. */
    name?: string;
    /** Ref filled with download handlers for toolbar export actions. */
    exportHandlerRef?: React.RefObject<{
        download: () => void;
        downloadXLSX?: () => void;
        downloadODS?: () => void;
    }>;
    colorMode?: PivotColorMode;
    percentMode?: PivotPercentMode;
    onColorModeChange?: (mode: PivotColorMode) => void;
    onPercentModeChange?: (mode: PivotPercentMode) => void;
    onRowTotalsChange?: (mode: PivotTotalsMode) => void;
    onColumnTotalsChange?: (mode: PivotTotalsMode) => void;
    /** Repeat nested group labels on every leaf. Controlled when `onRepeatLabelsChange` is set. */
    repeatLabels?: boolean;
    onRepeatLabelsChange?: (repeat: boolean) => void;
    dark?: boolean;
    onHeaderSort?: (fid: string) => void;
    onKeepPath?: (path: IPivotTablePath) => void;
}

export const PivotTableCore: React.FC<PivotTableCoreProps> = ({
    computation,
    fields,
    rows,
    columns,
    filters = EMPTY_FILTERS,
    defaultAggregated = true,
    folds,
    limit = -1,
    timezoneDisplayOffset,
    showTableSummary = false,
    rowTotals,
    columnTotals,
    numberFormat = '',
    disableCollapse = false,
    collapsedPaths,
    defaultCollapsedPaths = EMPTY_PATHS,
    onCollapsedPathsChange,
    onRenderStatusChange,
    onError,
    emptyContent = null,
    viewData,
    buildModel,
    name,
    exportHandlerRef,
    colorMode,
    percentMode,
    onColorModeChange,
    onPercentModeChange,
    onRowTotalsChange,
    onColumnTotalsChange,
    repeatLabels,
    onRepeatLabelsChange,
    dark = false,
    onHeaderSort,
    onKeepPath,
}) => {
    const { t } = useTranslation();
    const [model, setModel] = useState<IPivotTableModel | null>(null);
    const [loading, setLoading] = useState(false);
    const [uncontrolledCollapsedPaths, setUncontrolledCollapsedPaths] = useState<IPivotTablePath[]>(() =>
        defaultCollapsedPaths.map((path) => [...path])
    );
    const [localColorMode, setLocalColorMode] = useState<PivotColorMode>(() => resolvePivotColorMode(colorMode));
    const [localPercentMode, setLocalPercentMode] = useState<PivotPercentMode>(() => resolvePivotPercentMode(percentMode));
    const initialTotals = resolvePivotTotals({ showTableSummary, pivotRowTotals: rowTotals, pivotColumnTotals: columnTotals }, defaultAggregated);
    const [localRowTotals, setLocalRowTotals] = useState<PivotTotalsMode>(() => initialTotals.rows);
    const [localColumnTotals, setLocalColumnTotals] = useState<PivotTotalsMode>(() => initialTotals.columns);
    const [localHeaderMode, setLocalHeaderMode] = useState<PivotHeaderMode>(() => resolvePivotHeaderMode(repeatLabels));
    const requestIdRef = useRef(0);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onErrorRef = useRef(onError);
    const onStatusChangeRef = useRef(onRenderStatusChange);
    onErrorRef.current = onError;
    onStatusChangeRef.current = onRenderStatusChange;

    const activeCollapsedPaths = collapsedPaths ?? uncontrolledCollapsedPaths;
    const aggregationFeaturesEnabled = defaultAggregated;
    const effectiveCollapsedPaths = disableCollapse || !aggregationFeaturesEnabled ? EMPTY_PATHS : activeCollapsedPaths;
    const resolvedTotals = resolvePivotTotals(
        { showTableSummary, pivotRowTotals: rowTotals, pivotColumnTotals: columnTotals },
        aggregationFeaturesEnabled
    );
    const activeRowTotals = onRowTotalsChange ? resolvedTotals.rows : aggregationFeaturesEnabled ? localRowTotals : 'off';
    const activeColumnTotals = onColumnTotalsChange ? resolvedTotals.columns : aggregationFeaturesEnabled ? localColumnTotals : 'off';
    const summaryLabels = useMemo(
        () => ({
            total: t('pivotTable.total'),
            totalOf: (name: string) => t('pivotTable.total_of', { name }),
        }),
        [t]
    );

    const fieldStructureKey = useMemo(
        () =>
            JSON.stringify({
                rows: rows.map((field) => [field.fid, field.analyticType, field.aggName]),
                columns: columns.map((field) => [field.fid, field.analyticType, field.aggName]),
            }),
        [rows, columns]
    );
    const previousFieldStructureKeyRef = useRef(fieldStructureKey);
    useEffect(() => {
        if (previousFieldStructureKeyRef.current !== fieldStructureKey) {
            previousFieldStructureKeyRef.current = fieldStructureKey;
            if (collapsedPaths === undefined) {
                setUncontrolledCollapsedPaths([]);
            }
        }
    }, [collapsedPaths, fieldStructureKey]);

    useEffect(() => {
        const requestId = ++requestIdRef.current;
        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
            idleTimerRef.current = null;
        }
        setLoading(true);
        onStatusChangeRef.current?.('computing');

        queryPivotTable(
            {
                computation,
                fields,
                rows,
                columns,
                filters,
                defaultAggregated,
                folds,
                limit,
                timezoneDisplayOffset,
                showTableSummary: showTableSummaryFromTotals({ rows: activeRowTotals, columns: activeColumnTotals }),
                rowTotals: activeRowTotals,
                columnTotals: activeColumnTotals,
                collapsedPaths: EMPTY_PATHS,
                viewData,
            },
            buildModel
        )
            .then((nextModel) => {
                if (requestId !== requestIdRef.current) {
                    return;
                }
                onStatusChangeRef.current?.('rendering');
                setModel(nextModel);
                setLoading(false);
                idleTimerRef.current = setTimeout(() => {
                    if (requestId === requestIdRef.current) {
                        onStatusChangeRef.current?.('idle');
                    }
                }, 0);
            })
            .catch((reason) => {
                if (requestId !== requestIdRef.current) {
                    return;
                }
                const error = reason instanceof Error ? reason : new Error(String(reason));
                setModel(null);
                setLoading(false);
                onStatusChangeRef.current?.('error');
                onErrorRef.current?.(error);
            });

        return () => {
            requestIdRef.current += 1;
        };
    }, [
        computation,
        fields,
        rows,
        columns,
        filters,
        defaultAggregated,
        folds,
        limit,
        timezoneDisplayOffset,
        activeRowTotals,
        activeColumnTotals,
        viewData,
        buildModel,
    ]);

    useEffect(
        () => () => {
            if (idleTimerRef.current) {
                clearTimeout(idleTimerRef.current);
            }
        },
        []
    );

    const handleHeaderCollapse = useCallback(
        (node: INestNode) => {
            if (disableCollapse || !aggregationFeaturesEnabled || node.kind !== 'value' || node.height < 1) {
                return;
            }
            const nextPaths = togglePivotTablePath(activeCollapsedPaths, node.path);
            if (collapsedPaths === undefined) {
                setUncontrolledCollapsedPaths(nextPaths);
            }
            onCollapsedPathsChange?.(nextPaths);
        },
        [activeCollapsedPaths, aggregationFeaturesEnabled, collapsedPaths, disableCollapse, onCollapsedPathsChange]
    );

    const { dimsInRow, dimsInColumn, measInRow, measInColumn } = useMemo(() => getPivotTableFields(rows, columns), [rows, columns]);
    const activeColorMode = onColorModeChange ? resolvePivotColorMode(colorMode) : localColorMode;
    const activePercentMode = onPercentModeChange ? resolvePivotPercentMode(percentMode) : localPercentMode;
    const activeHeaderMode = onRepeatLabelsChange ? resolvePivotHeaderMode(repeatLabels) : localHeaderMode;
    const activeRepeatLabels = activeHeaderMode === 'repeat';
    const collapsiblePaths = useMemo(() => {
        if (!model?.leftTree || !model.topTree) {
            return [];
        }
        return [...collectCollapsiblePaths(model.leftTree), ...collectCollapsiblePaths(model.topTree)];
    }, [model]);
    const showCollapseAll = aggregationFeaturesEnabled && !disableCollapse && collapsiblePaths.length > 0;
    const showHeaderMode = dimsInRow.length + dimsInColumn.length > 0;
    const sortedField = useMemo(
        () => [...rows, ...columns].find((field) => field.sort && field.sort !== 'none'),
        [columns, rows]
    );

    const handleColorModeChange = useCallback(
        (mode: PivotColorMode) => {
            if (onColorModeChange) {
                onColorModeChange(mode);
                return;
            }
            setLocalColorMode(mode);
        },
        [onColorModeChange]
    );
    const handlePercentModeChange = useCallback(
        (mode: PivotPercentMode) => {
            if (onPercentModeChange) {
                onPercentModeChange(mode);
                return;
            }
            setLocalPercentMode(mode);
        },
        [onPercentModeChange]
    );
    const handleRowTotalsChange = useCallback(
        (mode: PivotTotalsMode) => {
            if (onRowTotalsChange) {
                onRowTotalsChange(mode);
                return;
            }
            setLocalRowTotals(mode);
        },
        [onRowTotalsChange]
    );
    const handleColumnTotalsChange = useCallback(
        (mode: PivotTotalsMode) => {
            if (onColumnTotalsChange) {
                onColumnTotalsChange(mode);
                return;
            }
            setLocalColumnTotals(mode);
        },
        [onColumnTotalsChange]
    );

    const handleHeaderModeChange = useCallback(
        (mode: PivotHeaderMode) => {
            if (onRepeatLabelsChange) {
                onRepeatLabelsChange(mode === 'repeat');
                return;
            }
            setLocalHeaderMode(mode);
        },
        [onRepeatLabelsChange]
    );

    const handleCollapseAllToggle = useCallback(() => {
        if (disableCollapse || !aggregationFeaturesEnabled) {
            return;
        }
        const nextPaths = nextCollapseAllPaths(activeCollapsedPaths, collapsiblePaths);
        if (collapsedPaths === undefined) {
            setUncontrolledCollapsedPaths(nextPaths);
        }
        onCollapsedPathsChange?.(nextPaths);
    }, [activeCollapsedPaths, aggregationFeaturesEnabled, collapsedPaths, collapsiblePaths, disableCollapse, onCollapsedPathsChange]);

    const downloadPivot = useCallback(
        (type: 'csv' | 'xlsx' | 'ods') => {
            if (!model || !shouldRenderPivotTableModel(model) || !model.leftTree || !model.topTree) {
                return;
            }
            const metricTable = materializeMetricMatrix(model.leftTree, model.topTree, model.cube).map((row) => row.map((cell) => cell ?? null));
            const sheet = buildPivotSheet({
                leftTree: model.leftTree,
                topTree: model.topTree,
                metricTable,
                dimsInRow,
                dimsInColumn,
                measInRow,
                measInColumn,
                displayOffset: timezoneDisplayOffset,
                summaryLabels,
                repeatLabels: activeRepeatLabels,
            });
            const fileName = `${name || 'pivot-table'}.${type}`;
            if (type === 'csv') {
                const csvContent = buildCsvContent(sheet.data);
                download(csvContent, fileName, 'text/plain');
                return;
            }
            void exportSpreadsheet(
                {
                    name: name || 'Pivot',
                    data: sheet.data,
                    merges: sheet.merges,
                },
                fileName,
                type
            );
        },
        [dimsInColumn, dimsInRow, measInColumn, measInRow, model, name, timezoneDisplayOffset, summaryLabels, activeRepeatLabels]
    );

    useEffect(() => {
        if (!exportHandlerRef) return;
        exportHandlerRef.current = {
            download: () => downloadPivot('csv'),
            downloadXLSX: () => downloadPivot('xlsx'),
            downloadODS: () => downloadPivot('ods'),
        };
    }, [downloadPivot, exportHandlerRef]);

    return (
        <div className="relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden" data-testid="pivot-table-core" aria-busy={loading}>
            {loading && <LoadingLayer />}
            <PivotTableToolbar
                colorMode={activeColorMode}
                percentMode={activePercentMode}
                rowTotals={activeRowTotals}
                columnTotals={activeColumnTotals}
                headerMode={activeHeaderMode}
                onColorModeChange={handleColorModeChange}
                onPercentModeChange={handlePercentModeChange}
                onRowTotalsChange={handleRowTotalsChange}
                onColumnTotalsChange={handleColumnTotalsChange}
                onHeaderModeChange={handleHeaderModeChange}
                showKeepHint={Boolean(onKeepPath)}
                showHeaderMode={showHeaderMode}
                showCollapseAll={showCollapseAll}
                anyCollapsed={effectiveCollapsedPaths.length > 0}
                onCollapseAllToggle={handleCollapseAllToggle}
            />
            <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
                {model && shouldRenderPivotTableModel(model) ? (
                    <PivotTableView
                        model={model}
                        rows={rows}
                        columns={columns}
                        defaultAggregated={defaultAggregated}
                        numberFormat={numberFormat}
                        timezoneDisplayOffset={timezoneDisplayOffset}
                        enableCollapse={aggregationFeaturesEnabled && !disableCollapse}
                        collapsedPaths={effectiveCollapsedPaths}
                        onHeaderCollapse={handleHeaderCollapse}
                        colorMode={activeColorMode}
                        percentMode={activePercentMode}
                        dark={dark}
                        onHeaderSort={onHeaderSort}
                        sortedFid={sortedField?.fid}
                        sortedDir={sortedField?.sort}
                        onKeepPath={onKeepPath}
                        summaryLabels={summaryLabels}
                        repeatLabels={activeRepeatLabels}
                    />
                ) : (
                    !loading && emptyContent
                )}
            </div>
        </div>
    );
};
