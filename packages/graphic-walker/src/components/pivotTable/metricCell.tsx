import React from 'react';
import { cn } from '@/utils';
import Tooltip from '../tooltip';
import type { PivotColorMode } from './display';
import { heatmapFill } from './display';

export interface PivotMetricCellProps {
    text: string;
    absText: string;
    percentText?: string;
    t?: number;
    colorMode: PivotColorMode;
    isSummary: boolean;
    missing: boolean;
    dark: boolean;
    keepEnabled: boolean;
    onKeep?: () => void;
}

export function PivotMetricCell({ text, absText, percentText, t, colorMode, isSummary, missing, dark, keepEnabled, onKeep }: PivotMetricCellProps) {
    const fill = !missing && colorMode === 'heatmap' && t !== undefined ? heatmapFill(t, dark) : undefined;
    const bar = !missing && colorMode === 'bar' && t !== undefined ? `${Math.round(t * 100)}%` : undefined;
    const tooltip = percentText ? `${absText} · ${percentText}` : absText;
    return (
        <td
            className={cn(
                'relative h-8 max-h-8 whitespace-nowrap px-2 py-0 text-xs leading-8 tabular-nums text-right',
                isSummary && 'bg-muted/60 font-medium',
                keepEnabled && !missing && 'cursor-pointer hover:ring-1 hover:ring-primary/40'
            )}
            style={fill ? { backgroundColor: fill } : undefined}
            onClick={keepEnabled && onKeep && !missing ? onKeep : undefined}
        >
            {bar && (
                <span className="pointer-events-none absolute inset-y-0 left-0 bg-primary/20" style={{ width: bar }} aria-hidden="true" />
            )}
            <Tooltip content={<span className="font-mono text-[11px]">{tooltip}</span>}>
                <span className="relative z-[1]">{text}</span>
            </Tooltip>
        </td>
    );
}
