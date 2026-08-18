import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowTrendingUpIcon, ChartBarIcon, PresentationChartLineIcon } from '@heroicons/react/24/outline';
import { Toggle } from '../ui/toggle';
import Tooltip from '../tooltip';
import { cn } from '@/utils';
import type { ChartChrome, ChartLineShape, ChartOverlayMode, ChartReferenceMode, ChartTooltipMode } from '../../vis/spec/chartChrome';
import type { IStackMode } from '../../interfaces';

export interface ChartToolbarProps {
    chrome: ChartChrome;
    geomType: string;
    stack: IStackMode;
    canOverlay: boolean;
    canTrend: boolean;
    canDonut: boolean;
    canStack: boolean;
    canDrill: boolean;
    onChange: (patch: Partial<ChartChrome>) => void;
    onStackChange: (mode: IStackMode) => void;
}

function Segment<T extends string>({
    name,
    value,
    options,
    onChange,
}: {
    name: string;
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
                            data-testid={`chart-chrome-${name}-${option.id}`}
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

export function ChartToolbar({ chrome, geomType, stack, canOverlay, canTrend, canDonut, canStack, canDrill, onChange, onStackChange }: ChartToolbarProps) {
    const { t } = useTranslation();
    const hideLinear = geomType === 'arc' || geomType === 'boxplot';
    const canLineShape = geomType === 'line' || geomType === 'area' || geomType === 'trail';
    const canOrient = geomType === 'bar';
    const stackToggle: IStackMode = stack === 'normalize' ? 'normalize' : stack === 'none' ? 'none' : 'stack';
    const arcMode = chrome.rose ? 'rose' : chrome.donut ? 'donut' : 'pie';
    const labelMode = !chrome.showLabels ? 'off' : chrome.labelFormat === 'percent' && geomType === 'arc' ? 'percent' : 'on';
    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-1 py-1" data-testid="chart-toolbar">
            <Segment
                name="labels"
                value={labelMode}
                onChange={(value) =>
                    onChange(
                        value === 'off'
                            ? { showLabels: false }
                            : { showLabels: true, labelFormat: value === 'percent' ? 'percent' : 'value' }
                    )
                }
                options={[
                    { id: 'off', label: '#', title: t('chartChrome.labels_off') },
                    { id: 'on', label: '123', title: t('chartChrome.labels_on') },
                    ...(geomType === 'arc' ? [{ id: 'percent', label: '%', title: t('chartChrome.labels_percent') }] : []),
                ]}
            />
            {!hideLinear && (
                <Segment
                    name="reference"
                    value={chrome.reference}
                    onChange={(value) => onChange({ reference: value as ChartReferenceMode })}
                    options={[
                        { id: 'none', label: '—', title: t('chartChrome.ref_none') },
                        { id: 'mean', label: 'μ', title: t('chartChrome.ref_mean') },
                        { id: 'median', label: 'M', title: t('chartChrome.ref_median') },
                    ]}
                />
            )}
            {canOverlay && !hideLinear && (
                <Segment
                    name="overlay"
                    value={chrome.overlay}
                    onChange={(value) => onChange({ overlay: value as ChartOverlayMode })}
                    options={[
                        { id: 'none', label: '1', title: t('chartChrome.overlay_none'), icon: ChartBarIcon },
                        { id: 'line', label: '', title: t('chartChrome.overlay_line'), icon: PresentationChartLineIcon },
                        { id: 'dual', label: '2Y', title: t('chartChrome.overlay_dual') },
                    ]}
                />
            )}
            {canStack && !hideLinear && (
                <Segment
                    name="stack"
                    value={stackToggle}
                    onChange={(value) => onStackChange(value as IStackMode)}
                    options={[
                        { id: 'none', label: '||', title: t('chartChrome.stack_group') },
                        { id: 'stack', label: '≡', title: t('chartChrome.stack_stack') },
                        { id: 'normalize', label: '%', title: t('chartChrome.stack_normalize') },
                    ]}
                />
            )}
            {canDonut && (
                <Segment
                    name="arc"
                    value={arcMode}
                    onChange={(value) =>
                        onChange({
                            donut: value === 'donut',
                            rose: value === 'rose',
                        })
                    }
                    options={[
                        { id: 'pie', label: '◔', title: t('chartChrome.arc_pie') },
                        { id: 'donut', label: '◎', title: t('chartChrome.arc_donut') },
                        { id: 'rose', label: '❋', title: t('chartChrome.arc_rose') },
                    ]}
                />
            )}
            {canLineShape && (
                <Segment
                    name="line"
                    value={chrome.lineShape}
                    onChange={(value) => onChange({ lineShape: value as ChartLineShape })}
                    options={[
                        { id: 'linear', label: '/', title: t('chartChrome.line_linear') },
                        { id: 'smooth', label: '~', title: t('chartChrome.line_smooth') },
                        { id: 'step', label: '⌊', title: t('chartChrome.line_step') },
                    ]}
                />
            )}
            {canOrient && (
                <Segment
                    name="orient"
                    value={chrome.horizontal ? 'h' : 'v'}
                    onChange={(value) => onChange({ horizontal: value === 'h' })}
                    options={[
                        { id: 'v', label: '↕', title: t('chartChrome.orient_v') },
                        { id: 'h', label: '↔', title: t('chartChrome.orient_h') },
                    ]}
                />
            )}
            {canTrend && !hideLinear && (
                <Tooltip content={t('chartChrome.trend')}>
                    <Toggle
                        size="sm"
                        variant="none"
                        pressed={chrome.trendline}
                        aria-label={t('chartChrome.trend')}
                        data-testid="chart-chrome-trend"
                        className={cn(
                            'h-7 min-w-7 rounded px-1.5',
                            chrome.trendline ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                        )}
                        onPressedChange={(pressed) => onChange({ trendline: pressed })}
                    >
                        <ArrowTrendingUpIcon className="h-3.5 w-3.5" />
                    </Toggle>
                </Tooltip>
            )}
            <Segment
                name="tooltip"
                value={chrome.tooltip}
                onChange={(value) => onChange({ tooltip: value as ChartTooltipMode })}
                options={[
                    { id: 'encoded', label: 'tip', title: t('chartChrome.tooltip_encoded') },
                    { id: 'all', label: 'all', title: t('chartChrome.tooltip_all') },
                ]}
            />
            {canDrill && (
                <Tooltip content={t('chartChrome.drill')}>
                    <Toggle
                        size="sm"
                        variant="none"
                        pressed={chrome.timeDrill}
                        aria-label={t('chartChrome.drill')}
                        data-testid="chart-chrome-drill"
                        className={cn(
                            'h-7 rounded px-1.5 text-[11px] font-medium',
                            chrome.timeDrill ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                        )}
                        onPressedChange={(pressed) => onChange({ timeDrill: pressed })}
                    >
                        {t('chartChrome.drill_short')}
                    </Toggle>
                </Tooltip>
            )}
            <span className="text-[11px] text-muted-foreground">{t('chartChrome.hint')}</span>
        </div>
    );
}
