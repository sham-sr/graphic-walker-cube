import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bars3Icon, ChartBarIcon, FireIcon, HashtagIcon, MinusCircleIcon, PlusCircleIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { Toggle } from '../ui/toggle';
import { Button } from '../ui/button';
import Tooltip from '../tooltip';
import type { PivotColorMode, PivotHeaderMode, PivotPercentMode, PivotTotalsMode } from './display';
import { cn } from '@/utils';

export interface PivotTableToolbarProps {
    colorMode: PivotColorMode;
    percentMode: PivotPercentMode;
    rowTotals: PivotTotalsMode;
    columnTotals: PivotTotalsMode;
    headerMode: PivotHeaderMode;
    onColorModeChange: (mode: PivotColorMode) => void;
    onPercentModeChange: (mode: PivotPercentMode) => void;
    onRowTotalsChange: (mode: PivotTotalsMode) => void;
    onColumnTotalsChange: (mode: PivotTotalsMode) => void;
    onHeaderModeChange: (mode: PivotHeaderMode) => void;
    showKeepHint?: boolean;
    showHeaderMode?: boolean;
    showCollapseAll?: boolean;
    anyCollapsed?: boolean;
    onCollapseAllToggle?: () => void;
}

function Segment<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { id: T; label: string; title: string; icon?: React.ComponentType<{ className?: string }> }[];
    onChange: (value: T) => void;
}) {
    return (
        <div className="inline-flex rounded-md border border-input p-0.5" role="group">
            {options.map((option) => {
                const Icon = option.icon;
                return (
                    <Tooltip key={option.id} content={option.title}>
                        <Toggle
                            size="sm"
                            variant="none"
                            pressed={value === option.id}
                            aria-label={option.title}
                            className={cn(
                                'h-7 min-w-7 rounded px-1.5 text-[11px] font-medium',
                                value === option.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                            )}
                            onPressedChange={() => onChange(option.id)}
                        >
                            {Icon ? <Icon className="h-3.5 w-3.5" /> : option.label}
                        </Toggle>
                    </Tooltip>
                );
            })}
        </div>
    );
}

export function PivotTableToolbar({
    colorMode,
    percentMode,
    rowTotals,
    columnTotals,
    headerMode,
    onColorModeChange,
    onPercentModeChange,
    onRowTotalsChange,
    onColumnTotalsChange,
    onHeaderModeChange,
    showKeepHint,
    showHeaderMode = true,
    showCollapseAll = false,
    anyCollapsed = false,
    onCollapseAllToggle,
}: PivotTableToolbarProps) {
    const { t } = useTranslation();
    const collapseLabel = anyCollapsed ? t('pivotTable.expand_all') : t('pivotTable.collapse_all');
    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-1 py-1" data-testid="pivot-table-toolbar">
            <Segment
                value={colorMode}
                onChange={onColorModeChange}
                options={[
                    { id: 'none', label: '#', title: t('pivotTable.color_none'), icon: HashtagIcon },
                    { id: 'heatmap', label: '', title: t('pivotTable.color_heatmap'), icon: FireIcon },
                    { id: 'bar', label: '', title: t('pivotTable.color_bar'), icon: ChartBarIcon },
                ]}
            />
            <Segment
                value={percentMode}
                onChange={onPercentModeChange}
                options={[
                    { id: 'none', label: '#', title: t('pivotTable.percent_none') },
                    { id: 'row', label: '%→', title: t('pivotTable.percent_row') },
                    { id: 'column', label: '%↓', title: t('pivotTable.percent_column') },
                    { id: 'grand', label: '%Σ', title: t('pivotTable.percent_grand') },
                ]}
            />
            <Segment
                value={rowTotals}
                onChange={onRowTotalsChange}
                options={[
                    { id: 'off', label: 'Σ↓·', title: t('pivotTable.totals_row_off') },
                    { id: 'grand', label: 'Σ↓', title: t('pivotTable.totals_row_grand') },
                    { id: 'all', label: 'Σ↓+', title: t('pivotTable.totals_row_all') },
                ]}
            />
            <Segment
                value={columnTotals}
                onChange={onColumnTotalsChange}
                options={[
                    { id: 'off', label: 'Σ→·', title: t('pivotTable.totals_col_off') },
                    { id: 'grand', label: 'Σ→', title: t('pivotTable.totals_col_grand') },
                    { id: 'all', label: 'Σ→+', title: t('pivotTable.totals_col_all') },
                ]}
            />
            {showHeaderMode && (
                <Segment
                    value={headerMode}
                    onChange={onHeaderModeChange}
                    options={[
                        { id: 'nested', label: '', title: t('pivotTable.headers_nested'), icon: Squares2X2Icon },
                        { id: 'repeat', label: '', title: t('pivotTable.headers_repeat'), icon: Bars3Icon },
                    ]}
                />
            )}
            {showCollapseAll && (
                <Tooltip content={collapseLabel}>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2"
                        aria-label={collapseLabel}
                        data-testid="pivot-collapse-all"
                        onClick={onCollapseAllToggle}
                    >
                        {anyCollapsed ? <PlusCircleIcon className="h-3.5 w-3.5" /> : <MinusCircleIcon className="h-3.5 w-3.5" />}
                    </Button>
                </Tooltip>
            )}
            <span className="text-[11px] text-muted-foreground">{t(showKeepHint ? 'pivotTable.hint_full' : 'pivotTable.hint_sort')}</span>
        </div>
    );
}
