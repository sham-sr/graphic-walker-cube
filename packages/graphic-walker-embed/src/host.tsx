import { createRoot, type Root } from 'react-dom/client';
import { DataSourceSegmentComponent, GraphicWalker } from '@kanaries/graphic-walker';
import type { IDataSourceProvider } from '@kanaries/graphic-walker';
import { getMemoryProvider, init as initDuckdb } from '@kanaries/duckdb-computation';
import type { GraphicWalkerExperimentalFeatures, GraphicWalkerHost, GraphicWalkerHostOptions } from './contract';
import { GW_DEFAULT_EXPERIMENTAL_FEATURES, GW_DEFAULT_TOOLBAR_EXCLUDE, GW_EMBED_ENHANCE_API } from './contract';
import { ChartTileApp } from './chartTile';
import { findChartSpec, listChartsFromRegistry } from './chartSpecs';
import { createDatasetRegistry, type DatasetRegistry } from './datasetRegistry';
import { createHostController, syncSpecsFromProvider } from './hostController';

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
    flushSpecsRef: { current: () => void | Promise<void> };
}

function externalIdForProvider(registry: DatasetRegistry, providerId: string): string {
    return registry.findExternalIdByProviderId(providerId) ?? providerId;
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
    const registry = createDatasetRegistry({
        maxDatasets: options.maxDatasets,
        maxRows: options.maxRows,
    });
    const provider = await (deps?.createProvider ?? getMemoryProvider)();
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
    let root: Root | null = createRoot(el);
    const flushSpecsRef = { current: (): void | Promise<void> => {} };
    const tileViews = new Map<HTMLElement, { datasetId: string; visId: string; root: Root }>();

    const flushSpecs = async (): Promise<void> => {
        await Promise.resolve(flushSpecsRef.current());
        await syncSpecsFromProvider(provider, registry);
    };

    const providerIdForExternal = (externalId: string): string => registry.get(externalId).providerId;

    const renderTile = (_target: HTMLElement, externalDatasetId: string, visId: string, tileRoot: Root) => {
        const parsed = findChartSpec(registry, externalDatasetId, visId);
        if (!parsed) {
            tileRoot.render(null);
            return;
        }
        tileRoot.render(
            <ChartTileApp
                spec={parsed.spec}
                datasetId={providerIdForExternal(externalDatasetId)}
                provider={provider}
                appearance={appearance}
                locale={i18nLang}
            />
        );
    };

    const renderTiles = () => {
        for (const [target, view] of tileViews) {
            renderTile(target, view.datasetId, view.visId, view.root);
        }
    };

    const render = () => {
        root?.render(
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
                flushSpecsRef={flushSpecsRef}
            />
        );
    };

    const bumpList = () => {
        void flushSpecsRef.current();
        listVersion += 1;
        render();
        renderTiles();
    };

    render();

    return {
        setLocale(lang: string) {
            i18nLang = lang;
            render();
            renderTiles();
        },
        setAppearance(mode: 'light' | 'dark') {
            appearance = mode;
            render();
            renderTiles();
        },
        async addDataset(input) {
            const result = await controller.addDataset(input);
            preferredDatasetId = providerIdForExternal(result.id);
            bumpList();
            return result;
        },
        async replaceDataset(id, input) {
            await flushSpecs();
            const result = await controller.replaceDataset(id, input);
            if (registry.selectedDatasetId === id) {
                preferredDatasetId = providerIdForExternal(id);
            }
            bumpList();
            return result;
        },
        async removeDataset(id) {
            await flushSpecs();
            await controller.removeDataset(id);
            if (registry.selectedDatasetId) {
                preferredDatasetId = providerIdForExternal(registry.selectedDatasetId);
            } else {
                preferredDatasetId = undefined;
            }
            bumpList();
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
            tileViews.set(target, { datasetId: ref.datasetId, visId: ref.visId, root: tileRoot });
            renderTile(target, ref.datasetId, ref.visId, tileRoot);
            return () => {
                const view = tileViews.get(target);
                if (view) {
                    view.root.unmount();
                    tileViews.delete(target);
                }
            };
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
            render();
        },
        destroy() {
            void flushSpecsRef.current();
            for (const view of tileViews.values()) {
                view.root.unmount();
            }
            tileViews.clear();
            root?.unmount();
            root = null;
            registry.clear();
        },
    };
}
