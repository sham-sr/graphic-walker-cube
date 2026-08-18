import { createRoot, type Root } from 'react-dom/client';
import { DataSourceSegmentComponent, GraphicWalker } from '@kanaries/graphic-walker';
import type { IDataSourceProvider } from '@kanaries/graphic-walker';
import { getMemoryProvider } from '@kanaries/duckdb-computation';
import type { GraphicWalkerExperimentalFeatures, GraphicWalkerHost, GraphicWalkerHostOptions } from './contract';
import { GW_DEFAULT_EXPERIMENTAL_FEATURES, GW_DEFAULT_TOOLBAR_EXCLUDE } from './contract';
import { createDatasetRegistry } from './datasetRegistry';
import { createHostController } from './hostController';

interface HostAppProps {
    provider: IDataSourceProvider;
    i18nLang: string;
    appearance: 'light' | 'dark';
    listVersion: number;
    preferredDatasetId?: string;
    toolbarExclude: readonly string[];
    experimentalFeatures: GraphicWalkerExperimentalFeatures;
    flushSpecsRef: { current: () => void };
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
    const flushSpecsRef = { current: () => {} };

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
    };

    render();

    return {
        setLocale(lang: string) {
            i18nLang = lang;
            render();
        },
        setAppearance(mode: 'light' | 'dark') {
            appearance = mode;
            render();
        },
        async addDataset(input) {
            const result = await controller.addDataset(input);
            bumpList();
            return result;
        },
        async replaceDataset(id, input) {
            flushSpecsRef.current();
            const result = await controller.replaceDataset(id, input);
            bumpList();
            return result;
        },
        async removeDataset(id) {
            await controller.removeDataset(id);
            bumpList();
        },
        listDatasets: controller.listDatasets,
        async exportConfig() {
            flushSpecsRef.current();
            return controller.exportConfig();
        },
        async exportReport() {
            flushSpecsRef.current();
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
            root?.unmount();
            root = null;
            registry.clear();
        },
    };
}
