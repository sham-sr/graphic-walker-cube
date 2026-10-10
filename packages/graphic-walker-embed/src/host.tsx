import { createRoot, type Root } from 'react-dom/client';
import { DataSourceSegmentComponent, GraphicWalker, SheetFilterEditor } from '@kanaries/graphic-walker';
import type { IDataQueryPayload, IDataSourceProvider, IRow } from '@kanaries/graphic-walker';
import { getMemoryProvider, init as initDuckdb } from '@kanaries/duckdb-computation';
import type {
    GraphicWalkerExperimentalFeatures,
    GraphicWalkerHost,
    GraphicWalkerHostOptions,
    WalkerChartRef,
} from './contract';
import { GW_DEFAULT_EXPERIMENTAL_FEATURES, GW_DEFAULT_TOOLBAR_EXCLUDE, GW_EMBED_ENHANCE_API } from './contract';
import type { ChartRendererExport, TableExportHandle } from './chartExport';
import { isTableExportFormat, readChartExport, readTableGrid, runTableExport } from './chartExport';
import { patchChartFilterSpecs } from './chartFilters';
import { ChartTileApp } from './chartTile';
import { chartKindFromSpec, findChartSpec, listChartsFromRegistry } from './chartSpecs';
import { persistedChartRaw, replacePersistedChart, sheetFilterAllowlist } from './sheetFilterFields';
import { createDatasetRegistry, type DatasetRegistry } from './datasetRegistry';
import { createHostController, syncSpecsFromProvider, toMutFields } from './hostController';
import { createQueryCache } from './queryCache';

const EMPTY_DISABLED: ReadonlySet<string> = new Set();

/** Какие плитки перерисовать. Без полей — все. datasetId — внешний id, который видит хост. */
interface TileRenderScope {
    datasetId?: string;
    visId?: string;
}

type TileComputation = (payload: IDataQueryPayload) => Promise<IRow[]>;

interface ChartTileView {
    datasetId: string;
    visId: string;
    root: Root;
    exportRef: { current: ChartRendererExport | null };
    tableExportRef: { current: TableExportHandle | null };
    renderedSpec?: Record<string, unknown>;
    specStamp: string;
    renderedProviderId: string;
    renderedDisabled: ReadonlySet<string>;
}

function chartKey(datasetId: string, visId: string): string {
    return `${datasetId}\0${visId}`;
}

/** Keep provider spec writes ordered so an editor unmount cannot land after a later filter patch. */
function queueSaveSpecs(provider: IDataSourceProvider): void {
    const save = provider.saveSpecs.bind(provider);
    let queue = Promise.resolve();
    provider.saveSpecs = (id, value) => {
        const run = queue.then(() => save(id, value));
        queue = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    };
}

interface HostAppProps {
    provider: IDataSourceProvider;
    registry: DatasetRegistry;
    i18nLang: string;
    appearance: 'light' | 'dark';
    listVersion: number;
    preferredDatasetId?: string;
    toolbarExclude: readonly string[];
    experimentalFeatures: GraphicWalkerExperimentalFeatures;
    defaultTab: 'data' | 'visualization';
    categoryOrderProvider?: GraphicWalkerHostOptions['categoryOrderProvider'];
    flushSpecsRef: { current: () => void | Promise<void> };
}

function externalIdForProvider(registry: DatasetRegistry, providerId: string): string {
    return registry.findExternalIdByProviderId(providerId) ?? providerId;
}

/** Внешний id датасета, открытого в редакторе. Слот GW хранит id провайдера, не id хоста. */
function selectedHostDatasetId(registry: DatasetRegistry, providerDatasetId: string): string {
    if (providerDatasetId) {
        return externalIdForProvider(registry, providerDatasetId);
    }
    return registry.selectedDatasetId ?? '';
}

function HostApp(props: HostAppProps) {
    return (
        <DataSourceSegmentComponent
            key={props.listVersion}
            provider={props.provider}
            hideCreateDataset
            hideDatasetToolbar
            appearance={props.appearance}
            {...{ preferredDatasetId: props.preferredDatasetId }}
        >
            {(slot) => {
                props.flushSpecsRef.current = slot.syncSpecs;
                const keepAliveExternal = slot.datasetId
                    ? externalIdForProvider(props.registry, slot.datasetId)
                    : false;
                const categoryOrderProvider = props.categoryOrderProvider;
                return (
                    <div style={{ height: '100%', minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <GraphicWalker
                        i18nLang={props.i18nLang}
                        appearance={props.appearance}
                        vizThemeConfig="cube"
                        computation={slot.computation}
                        rawFields={slot.meta}
                        onMetaChange={slot.onMetaChange}
                        storeRef={slot.storeRef}
                        keepAlive={keepAliveExternal || false}
                        toolbar={{ exclude: [...props.toolbarExclude] }}
                        experimentalFeatures={props.experimentalFeatures}
                        enhanceAPI={GW_EMBED_ENHANCE_API}
                        hideAskViz
                        hideChat
                        hideSegmentNav
                        datasetStatsToolbar
                        defaultTab={props.defaultTab}
                        categoryOrderProvider={
                            categoryOrderProvider
                                ? (request: { field: { fid: string; name: string; semanticType: string } }) =>
                                      categoryOrderProvider({
                                          datasetId: selectedHostDatasetId(props.registry, slot.datasetId),
                                          fid: request.field.fid,
                                          name: request.field.name,
                                          semanticType: request.field.semanticType,
                                      })
                                : undefined
                        }
                        style={{ width: '100%', height: '100%', minHeight: 0, flex: 1 }}
                    />
                    </div>
                );
            }}
        </DataSourceSegmentComponent>
    );
}

export interface CreateGraphicWalkerHostDeps {
    createProvider?: () => Promise<IDataSourceProvider>;
}

export async function warmupGraphicWalker(): Promise<void> {
    await initDuckdb();
}

export async function createGraphicWalkerHost(
    el: HTMLElement,
    options: GraphicWalkerHostOptions,
    deps?: CreateGraphicWalkerHostDeps
): Promise<GraphicWalkerHost> {
    const queryCache = createQueryCache();
    const computations = new Map<string, TileComputation>();
    const dropComputation = (providerId: string): void => {
        queryCache.invalidate(providerId);
        computations.delete(providerId);
    };
    const registry = createDatasetRegistry({
        maxDatasets: options.maxDatasets,
        maxRows: options.maxRows,
        onDatasetDataChanged: dropComputation,
        onDatasetDataCleared: () => {
            queryCache.clear();
            computations.clear();
        },
    });
    const provider = await (deps?.createProvider ?? getMemoryProvider)();
    queueSaveSpecs(provider);
    const originalRemove = provider.removeDataSource?.bind(provider);
    if (originalRemove) {
        provider.removeDataSource = async (id: string) => {
            await originalRemove(id);
            const externalId = registry.findExternalIdByProviderId(id);
            if (externalId) {
                registry.remove(externalId);
            }
        };
    }
    const controller = createHostController(provider, registry, { maxRows: options.maxRows });
    let i18nLang = options.i18nLang ?? 'ru-RU';
    let appearance: 'light' | 'dark' = options.appearance ?? 'light';
    let listVersion = 0;
    let preferredDatasetId: string | undefined;
    const toolbarExclude = options.toolbarExclude ?? GW_DEFAULT_TOOLBAR_EXCLUDE;
    const experimentalFeatures = options.experimentalFeatures ?? GW_DEFAULT_EXPERIMENTAL_FEATURES;
    const defaultTab = options.defaultTab ?? 'visualization';
    let editorMounted = true;
    let root: Root | null = createRoot(el);
    const sheetFilterRoots = new Map<HTMLElement, Root>();
    const flushSpecsRef = { current: (): void | Promise<void> => {} };
    const tileViews = new Map<HTMLElement, ChartTileView>();
    const disabledFilters = new Map<string, Set<string>>();

    const flushSpecs = async (): Promise<void> => {
        await Promise.resolve(flushSpecsRef.current());
        await syncSpecsFromProvider(provider, registry);
    };

    const providerIdForExternal = (externalId: string): string => registry.get(externalId).providerId;

    /** Единственная точка кэша queryData для плиток и панели фильтра листа. Редактор ходит в provider напрямую. */
    const queryDataset = (providerId: string, payload: IDataQueryPayload): Promise<IRow[]> =>
        queryCache.load(providerId, payload, () => provider.queryData(payload, [providerId]));

    const computationFor = (providerId: string): TileComputation => {
        const existing = computations.get(providerId);
        if (existing) {
            return existing;
        }
        const created: TileComputation = (payload) => queryDataset(providerId, payload);
        computations.set(providerId, created);
        return created;
    };

    const renderTile = (view: ChartTileView): void => {
        const parsed = findChartSpec(registry, view.datasetId, view.visId);
        if (!parsed) {
            view.renderedSpec = undefined;
            view.specStamp = '';
            view.root.render(null);
            return;
        }
        const providerId = providerIdForExternal(view.datasetId);
        const disabled = disabledFilters.get(chartKey(view.datasetId, view.visId)) ?? EMPTY_DISABLED;
        const stamp = JSON.stringify(parsed.spec);
        const previous = view.renderedSpec;
        const sameSpec =
            previous !== undefined &&
            view.specStamp === stamp &&
            view.renderedProviderId === providerId &&
            view.renderedDisabled === disabled;
        const spec = sameSpec && previous ? previous : parsed.spec;
        if (!sameSpec) {
            view.renderedSpec = spec;
            view.specStamp = stamp;
            view.renderedProviderId = providerId;
            view.renderedDisabled = disabled;
        }
        view.root.render(
            <ChartTileApp
                spec={spec}
                disabledFids={disabled}
                exportRef={view.exportRef}
                tableExportRef={view.tableExportRef}
                computation={computationFor(providerId)}
                appearance={appearance}
                locale={i18nLang}
            />
        );
    };

    const tileInScope = (view: ChartTileView, scope?: TileRenderScope): boolean => {
        if (scope?.datasetId !== undefined && scope.datasetId !== view.datasetId) {
            return false;
        }
        if (scope?.visId !== undefined && scope.visId !== view.visId) {
            return false;
        }
        return true;
    };

    const renderTiles = (scope?: TileRenderScope): void => {
        for (const view of tileViews.values()) {
            if (!tileInScope(view, scope)) {
                continue;
            }
            renderTile(view);
        }
    };

    const renderEditor = () => {
        if (!editorMounted || !root) {
            return;
        }
        root.render(
            <HostApp
                provider={provider}
                registry={registry}
                i18nLang={i18nLang}
                appearance={appearance}
                listVersion={listVersion}
                preferredDatasetId={preferredDatasetId}
                toolbarExclude={toolbarExclude}
                experimentalFeatures={experimentalFeatures}
                defaultTab={defaultTab}
                categoryOrderProvider={options.categoryOrderProvider}
                flushSpecsRef={flushSpecsRef}
            />
        );
    };

    const bumpList = (scope?: TileRenderScope): void => {
        void flushSpecsRef.current();
        listVersion += 1;
        renderEditor();
        renderTiles(scope);
    };

    const findTile = (ref: WalkerChartRef) => {
        for (const view of tileViews.values()) {
            if (view.datasetId === ref.datasetId && view.visId === ref.visId) {
                return view;
            }
        }
        return undefined;
    };

    const clearDisabledFilters = (datasetId?: string) => {
        if (!datasetId) {
            disabledFilters.clear();
            return;
        }
        const prefix = `${datasetId}\0`;
        for (const key of disabledFilters.keys()) {
            if (key.startsWith(prefix)) {
                disabledFilters.delete(key);
            }
        }
    };

    renderEditor();

    return {
        setLocale(lang: string) {
            i18nLang = lang;
            renderEditor();
            renderTiles();
        },
        setAppearance(mode: 'light' | 'dark') {
            appearance = mode;
            renderEditor();
            renderTiles();
        },
        async addDataset(input) {
            const result = await controller.addDataset(input);
            preferredDatasetId = providerIdForExternal(result.id);
            bumpList({ datasetId: result.id });
            return result;
        },
        async replaceDataset(id, input) {
            await flushSpecs();
            const result = await controller.replaceDataset(id, input);
            if (registry.selectedDatasetId === id) {
                preferredDatasetId = providerIdForExternal(id);
            }
            bumpList({ datasetId: id });
            return result;
        },
        async removeDataset(id) {
            await flushSpecs();
            clearDisabledFilters(id);
            await controller.removeDataset(id);
            if (registry.selectedDatasetId) {
                preferredDatasetId = providerIdForExternal(registry.selectedDatasetId);
            } else {
                preferredDatasetId = undefined;
            }
            bumpList({ datasetId: id });
        },
        listDatasets: controller.listDatasets,
        async listCharts() {
            await flushSpecs();
            return listChartsFromRegistry(registry);
        },
        createChartView(target, ref) {
            const existing = tileViews.get(target);
            if (existing) {
                existing.root.unmount();
                tileViews.delete(target);
            }
            const tileRoot = createRoot(target);
            const exportRef = { current: null as ChartRendererExport | null };
            const tableExportRef = { current: null as TableExportHandle | null };
            const view: ChartTileView = {
                datasetId: ref.datasetId,
                visId: ref.visId,
                root: tileRoot,
                exportRef,
                tableExportRef,
                specStamp: '',
                renderedProviderId: '',
                renderedDisabled: EMPTY_DISABLED,
            };
            tileViews.set(target, view);
            renderTile(view);
            return () => {
                const view = tileViews.get(target);
                if (view) {
                    view.root.unmount();
                    tileViews.delete(target);
                }
            };
        },
        async patchChartFilters(ref, patches) {
            const record = registry.get(ref.datasetId);
            const patched = patchChartFilterSpecs(record.specsJson, ref.visId, patches);
            const known = new Set(patched.fids);
            if (patched.specsJson !== record.specsJson) {
                registry.updateSpecs(ref.datasetId, patched.specsJson);
                await provider.saveSpecs(record.providerId, patched.specsJson);
            }
            const key = chartKey(ref.datasetId, ref.visId);
            const disabled = new Set(disabledFilters.get(key) ?? []);
            for (const patch of patches) {
                if (!known.has(patch.fid) || patch.enabled === undefined) {
                    continue;
                }
                if (patch.enabled) {
                    disabled.delete(patch.fid);
                } else {
                    disabled.add(patch.fid);
                }
            }
            if (disabled.size === 0) {
                disabledFilters.delete(key);
            } else {
                disabledFilters.set(key, disabled);
            }
            renderTiles({ datasetId: ref.datasetId, visId: ref.visId });
        },
        async exportChart(ref, format) {
            const view = findTile(ref);
            if (!view) {
                throw new Error(`Chart view not found: ${ref.datasetId}/${ref.visId}`);
            }
            if (format === 'grid') {
                return { format, data: '', grid: readTableGrid(view.tableExportRef.current) };
            }
            if ((format === 'png' || format === 'svg') && view.renderedSpec && chartKindFromSpec(view.renderedSpec) === 'table') {
                throw new Error('Table has no image export');
            }
            if (isTableExportFormat(format)) {
                runTableExport(view.tableExportRef.current, format);
                return { format, data: '' };
            }
            const data = await readChartExport(view.exportRef.current, format);
            return { format, data };
        },
        mountSheetFilterPanel(el, ref, options) {
            sheetFilterRoots.get(el)?.unmount();
            const panelRoot = createRoot(el);
            sheetFilterRoots.set(el, panelRoot);
            const release = () => {
                panelRoot.unmount();
                if (sheetFilterRoots.get(el) === panelRoot) {
                    sheetFilterRoots.delete(el);
                }
            };
            let record;
            try {
                record = registry.get(ref.datasetId);
            } catch {
                panelRoot.render(null);
                return release;
            }
            const specRaw = persistedChartRaw(record.specsJson, ref.visId);
            const chart = findChartSpec(registry, ref.datasetId, ref.visId);
            if (!specRaw || !chart) {
                panelRoot.render(null);
                return release;
            }
            const externalDatasetId = ref.datasetId;
            const visId = ref.visId;
            // Идентификатор провайдера читается в момент запроса: после replaceDataset строки уже другие.
            const computation: TileComputation = (payload) => {
                try {
                    return queryDataset(registry.get(externalDatasetId).providerId, payload);
                } catch {
                    return Promise.resolve([]);
                }
            };
            panelRoot.render(
                <SheetFilterEditor
                    meta={toMutFields(record.fields)}
                    specRaw={specRaw}
                    fieldAllowlist={sheetFilterAllowlist(chart.spec)}
                    computation={computation}
                    appearance={appearance}
                    locale={i18nLang}
                    onClose={() => options?.onClose?.()}
                    onSpecChange={(raw) => {
                        const current = registry.get(externalDatasetId);
                        const next = replacePersistedChart(current.specsJson, visId, raw);
                        if (!next) {
                            return;
                        }
                        registry.updateSpecs(externalDatasetId, next);
                        void provider.saveSpecs(current.providerId, next);
                        renderTiles({ datasetId: externalDatasetId, visId });
                    }}
                />
            );
            return release;
        },
        async setEditorMounted(mounted) {
            if (mounted === editorMounted) {
                return;
            }
            if (!mounted) {
                await flushSpecs();
                flushSpecsRef.current = () => {};
                root?.unmount();
                root = null;
                editorMounted = false;
                return;
            }
            editorMounted = true;
            root = createRoot(el);
            renderEditor();
        },
        async exportConfig() {
            await flushSpecs();
            return controller.exportConfig();
        },
        async exportReport() {
            await flushSpecs();
            return controller.exportReport();
        },
        async applyConfig(config, rowsById) {
            await flushSpecs();
            await controller.applyConfig(config, rowsById);
            const selected = registry.selectedDatasetId ?? config.selectedDatasetId;
            preferredDatasetId = selected ? providerIdForExternal(selected) : undefined;
            bumpList();
        },
        async importReport(report) {
            await flushSpecs();
            await controller.importReport(report);
            const selected = registry.selectedDatasetId ?? report.selectedDatasetId;
            preferredDatasetId = selected ? providerIdForExternal(selected) : undefined;
            bumpList();
        },
        flushSpecs,
        async selectDataset(id: string) {
            if (registry.selectedDatasetId === id) {
                return;
            }
            await flushSpecs();
            preferredDatasetId = providerIdForExternal(id);
            registry.setSelectedDatasetId(id);
            renderEditor();
        },
        destroy() {
            void flushSpecsRef.current();
            for (const view of tileViews.values()) {
                view.root.unmount();
            }
            tileViews.clear();
            clearDisabledFilters();
            root?.unmount();
            root = null;
            editorMounted = false;
            queryCache.clear();
            computations.clear();
            registry.clear();
        },
    };
}
