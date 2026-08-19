import { createRoot, type Root } from 'react-dom/client';
import { DataSourceSegmentComponent, GraphicWalker } from '@kanaries/graphic-walker';
import type { IDataSourceProvider } from '@kanaries/graphic-walker';
import { getMemoryProvider, init as initDuckdb } from '@kanaries/duckdb-computation';
import type { GraphicWalkerExperimentalFeatures, GraphicWalkerHost, GraphicWalkerHostOptions } from './contract';
import { GW_DEFAULT_EXPERIMENTAL_FEATURES, GW_DEFAULT_TOOLBAR_EXCLUDE, GW_EMBED_ENHANCE_API } from './contract';
import { ChartTileApp } from './chartTile';
import { findChartSpec, listChartsFromRegistry } from './chartSpecs';
import { createDatasetRegistry } from './datasetRegistry';
import { createHostController, syncSpecsFromProvider } from './hostController';

interface HostAppProps {
    provider: IDataSourceProvider;
    i18nLang: string;
    appearance: 'light' | 'dark';
    listVersion: number;
    preferredDatasetId?: string;
    toolbarExclude: readonly string[];
    experimentalFeatures: GraphicWalkerExperimentalFeatures;
    flushSpecsRef: { current: () => void | Promise<void> };
}

function HostApp(props: HostAppProps) {
    return (
        <DataSourceSegmentComponent
            key={props.listVersion}
            provider={props.provider}
            hideCreateDataset
            hideDatasetToolbar
            appearance={props.appearance}
            preferredDatasetId={props.preferredDatasetId}
        >
            {(slot) => {
                props.flushSpecsRef.current = slot.syncSpecs;
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
                        keepAlive={slot.datasetId || false}
                        toolbar={{ exclude: [...props.toolbarExclude] }}
                        experimentalFeatures={props.experimentalFeatures}
                        enhanceAPI={GW_EMBED_ENHANCE_API}
                        hideAskViz
                        hideChat
                        hideSegmentNav
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
            if (registry.list().some((dataset) => dataset.id === id)) {
                registry.remove(id);
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
    let root: Root | null = createRoot(el);
    const flushSpecsRef = { current: (): void | Promise<void> => {} };
    const tileViews = new Map<HTMLElement, { datasetId: string; visId: string; root: Root }>();

    const renderTile = (target: HTMLElement, datasetId: string, visId: string, tileRoot: Root) => {
        const parsed = findChartSpec(registry, datasetId, visId);
        if (!parsed) {
            tileRoot.render(null);
            return;
        }
        tileRoot.render(
            <ChartTileApp
                spec={parsed.spec}
                datasetId={datasetId}
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
                i18nLang={i18nLang}
                appearance={appearance}
                listVersion={listVersion}
                preferredDatasetId={preferredDatasetId}
                toolbarExclude={toolbarExclude}
                experimentalFeatures={experimentalFeatures}
                flushSpecsRef={flushSpecsRef}
            />
        );
    };

    const bumpList = () => {
        flushSpecsRef.current();
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
            bumpList();
            return result;
        },
        async replaceDataset(id, input) {
            await Promise.resolve(flushSpecsRef.current());
            const result = await controller.replaceDataset(id, input);
            bumpList();
            return result;
        },
        async removeDataset(id) {
            await controller.removeDataset(id);
            bumpList();
        },
        listDatasets: controller.listDatasets,
        async listCharts() {
            await Promise.resolve(flushSpecsRef.current());
            await syncSpecsFromProvider(provider, registry);
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
            await Promise.resolve(flushSpecsRef.current());
            return controller.exportConfig();
        },
        async exportReport() {
            await Promise.resolve(flushSpecsRef.current());
            return controller.exportReport();
        },
        async applyConfig(config, rowsById) {
            await controller.applyConfig(config, rowsById);
            preferredDatasetId = registry.selectedDatasetId ?? config.selectedDatasetId;
            bumpList();
        },
        async importReport(report) {
            await controller.importReport(report);
            preferredDatasetId = registry.selectedDatasetId ?? report.selectedDatasetId;
            bumpList();
        },
        selectDataset(id: string) {
            preferredDatasetId = id;
            registry.setSelectedDatasetId(id);
            render();
        },
        destroy() {
            flushSpecsRef.current();
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
