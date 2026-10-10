import type { Ref, RefObject } from 'react';
import { PureRenderer } from '@kanaries/graphic-walker';
import type { IDataQueryPayload, IRow } from '@kanaries/graphic-walker';
import type { ChartRendererExport, TableExportHandle } from './chartExport';
import { visualEncodings } from './chartFilters';

/** Один объект на все плитки: новая ссылка заставила бы PureRenderer пересобирать layout. */
const FULL_OVERRIDE_SIZE = { mode: 'full' as const, width: 1, height: 1 };
const EMPTY_LAYOUT: Record<string, unknown> = {};

const encodingsCache = new WeakMap<Record<string, unknown>, Map<string, Record<string, unknown>>>();

function disabledKey(disabledFids: ReadonlySet<string>): string {
    return [...disabledFids].sort().join('\0');
}

/** Повторный рендер с тем же spec и тем же набором выключенных полей не создаёт новый visualState. */
function stableVisualEncodings(spec: Record<string, unknown>, disabledFids: ReadonlySet<string>): Record<string, unknown> {
    const key = disabledKey(disabledFids);
    let byDisabled = encodingsCache.get(spec);
    if (!byDisabled) {
        byDisabled = new Map();
        encodingsCache.set(spec, byDisabled);
    }
    const cached = byDisabled.get(key);
    if (cached) {
        return cached;
    }
    const next = visualEncodings(spec, disabledFids);
    byDisabled.set(key, next);
    return next;
}

export interface ChartTileAppProps {
    spec: Record<string, unknown>;
    disabledFids: ReadonlySet<string>;
    exportRef: Ref<ChartRendererExport>;
    tableExportRef: RefObject<TableExportHandle | null>;
    /** Стабильная функция на id провайдера. Хост меняет ссылку только когда строки датасета сменились. */
    computation: (payload: IDataQueryPayload) => Promise<IRow[]>;
    appearance: 'light' | 'dark';
    locale: string;
}

export function ChartTileApp(props: ChartTileAppProps) {
    const config = props.spec.config as Record<string, unknown>;
    const layout = (props.spec.layout as Record<string, unknown> | undefined) ?? EMPTY_LAYOUT;
    const name = typeof props.spec.name === 'string' ? props.spec.name : undefined;
    const visualState = stableVisualEncodings(props.spec, props.disabledFids);

    return (
        <PureRenderer
            ref={props.exportRef as Ref<unknown>}
            exportHandlerRef={props.tableExportRef}
            type="remote"
            computation={props.computation}
            visualState={visualState}
            visualConfig={config}
            visualLayout={layout}
            overrideSize={FULL_OVERRIDE_SIZE}
            appearance={props.appearance}
            vizThemeConfig="cube"
            locale={props.locale}
            name={name}
            disableCollapse
            showToolbar={false}
        />
    );
}
