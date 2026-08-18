import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { downloadBlob } from '../utils/save';
import GwFile from './dataSelection/gwFile';
import DataSelection from './dataSelection';
import DropdownSelect from '../components/dropdownSelect';
import { IUIThemeConfig, IComputationFunction, IDarkMode, IDataSourceEventType, IDataSourceProvider, IMutField, IThemeKey } from '../interfaces';
import { persistDatasetSpecs, syncProviderSpecs } from './syncSpecs';
import { ShadowDom } from '../shadow-dom';
import { CommonStore } from '../store/commonStore';
import { VizSpecStore } from '../store/visualSpecStore';
import { useCurrentMediaTheme } from '../utils/media';
import { GWGlobalConfig } from '../vis/theme';
import { composeContext } from '../utils/context';
import { portalContainerContext, themeContext, vegaThemeContext } from '../store/theme';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DSSegmentProps {
    commonStore: CommonStore;
    dataSources: { name: string; id: string }[];
    selectedId: string;
    onSelectId: (value: string) => void;
    onSave?: () => Promise<Blob>;
    onLoad?: (file: File) => void;
    hideCreateDataset?: boolean;
    onRemove?: (id: string) => void;
}

const DataSourceSegment: React.FC<DSSegmentProps> = observer((props) => {
    const { commonStore, dataSources, onSelectId, selectedId, onLoad, onSave, hideCreateDataset, onRemove } = props;
    const gwFileRef = useRef<HTMLInputElement>(null);
    const { t } = useTranslation();

    const { showDSPanel } = commonStore;
    return (
        <div className="font-sans gap-2 flex flex-wrap items-center m-4 p-4 border rounded-md">
            {props.onLoad && <GwFile onImport={props.onLoad} fileRef={gwFileRef} />}
            {/* <label className="text-xs mr-1 whitespace-nowrap self-center h-4">
                {t("DataSource.labels.cur_dataset")}
            </label> */}
            <div>
                <DropdownSelect
                    className="text-xs !h-8"
                    options={dataSources.map((d) => ({ label: d.name, value: d.id }))}
                    selectedKey={selectedId}
                    onSelect={onSelectId}
                    placeholder={t('DataSource.labels.cur_dataset')}
                />
            </div>

            {!hideCreateDataset && (
                <Button
                    size="sm"
                    onClick={() => {
                        commonStore.startDSBuildingTask();
                    }}
                >
                    {t('DataSource.buttons.create_dataset')}
                </Button>
            )}
            {onRemove && selectedId && (
                <Button
                    size="sm"
                    variant="outline"
                    disabled={dataSources.length === 0}
                    onClick={() => {
                        onRemove(selectedId);
                    }}
                >
                    {t('DataSource.buttons.remove_dataset')}
                </Button>
            )}
            {onSave && (
                <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                        const blob = await onSave();
                        downloadBlob(blob, 'graphic-walker-notebook.json');
                    }}
                >
                    {t('DataSource.buttons.export_as_file')}
                </Button>
            )}
            {props.onLoad && (
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        if (gwFileRef.current) {
                            gwFileRef.current.click();
                        }
                    }}
                >
                    {t('DataSource.buttons.import_file')}
                </Button>
            )}
            <Dialog
                onOpenChange={() => {
                    commonStore.setShowDSPanel(false);
                }}
                open={showDSPanel}
            >
                <DialogContent aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{t('DataSource.dialog.create_data_source')}</DialogTitle>
                    </DialogHeader>
                    <DataSelection commonStore={commonStore} />
                </DialogContent>
            </Dialog>
        </div>
    );
});

function once<T extends (...args: any[]) => any>(register: (x: T) => () => void, cb: T) {
    const disposer = { current: () => {} };
    const newCB = (...args: Parameters<T>) => {
        const result = cb(...args);
        disposer.current();
        return result;
    };
    disposer.current = register(newCB as T);
}

const DataSourceThemeContext = composeContext({ themeContext, vegaThemeContext, portalContainerContext });

export function DataSourceSegmentComponent(props: {
    provider: IDataSourceProvider;
    hideCreateDataset?: boolean;
    /** Скрыть панель выбора/удаления датасета — хост управляет слотами сам */
    hideDatasetToolbar?: boolean;
    displayOffset?: number;
    /** Внешний выбор датасета (слот Cube / хост) */
    preferredDatasetId?: string;
    /** @deprecated renamed to appearence */
    dark?: IDarkMode;
    appearance?: IDarkMode;
    /** @deprecated use vizThemeConfig instead */
    themeKey?: IThemeKey;
    /** @deprecated use vizThemeConfig instead */
    themeConfig?: GWGlobalConfig;
    vizThemeConfig?: IThemeKey | GWGlobalConfig;
    /** @deprecated renamed to uiTheme */
    colorConfig?: IUIThemeConfig;
    uiTheme?: IUIThemeConfig;
    children: (props: {
        meta: IMutField[];
        onMetaChange: (fid: string, meta: Partial<IMutField>) => void;
        computation: IComputationFunction;
        storeRef: React.RefObject<VizSpecStore | null>;
        datasetName: string;
        datasetId: string;
        syncSpecs: () => void;
    }) => React.ReactNode;
}) {
    const [selectedId, setSelectedId] = useState('');
    const [datasetList, setDatasetList] = useState<{ name: string; id: string }[]>([]);
    const vizSpecStoreRef = useRef<VizSpecStore>(null);
    const datasetStoresRef = useRef(new Map<string, VizSpecStore>());
    const specSyncGenerationRef = useRef(0);
    const handleSelectIdRef = useRef<(id: string) => void>(() => {});

    useEffect(() => {
        const applyList = (list: { name: string; id: string }[]) => {
            setDatasetList(list);
            setSelectedId((current) => {
                if (current && list.some((item) => item.id === current)) {
                    return current;
                }
                if (current) {
                    persistDatasetSpecs(props.provider, current, datasetStoresRef.current.get(current));
                    specSyncGenerationRef.current += 1;
                }
                return (
                    (props.preferredDatasetId && list.some((item) => item.id === props.preferredDatasetId)
                        ? props.preferredDatasetId
                        : list[list.length - 1]?.id) ?? ''
                );
            });
        };
        props.provider.getDataSourceList().then(applyList);
        return props.provider.registerCallback((e) => {
            if (e & IDataSourceEventType.updateList) {
                props.provider.getDataSourceList().then(applyList);
            }
        });
    }, [props.provider]);

    useEffect(() => {
        const preferredId = props.preferredDatasetId;
        if (!preferredId || !datasetList.some(item => item.id === preferredId)) {
            return;
        }
        handleSelectIdRef.current(preferredId);
    }, [props.preferredDatasetId, datasetList]);

    const dataset = useMemo(() => datasetList.find((x) => x.id === selectedId), [datasetList, selectedId]);

    const [computationID, refreshComputation] = useReducer((x: number) => x + 1, 0);
    const [meta, setMeta] = useState<IMutField[]>([]);

    useLayoutEffect(() => {
        const store = vizSpecStoreRef.current;
        if (selectedId && store) {
            datasetStoresRef.current.set(selectedId, store);
        }
    }, [selectedId, meta, dataset]);

    const persistSelectedSpecs = useCallback(
        (datasetId: string) => {
            persistDatasetSpecs(props.provider, datasetId, datasetStoresRef.current.get(datasetId) ?? vizSpecStoreRef.current);
        },
        [props.provider]
    );

    const handleSelectId = useCallback(
        (nextId: string) => {
            if (nextId !== selectedId) {
                persistSelectedSpecs(selectedId);
                specSyncGenerationRef.current += 1;
            }
            setSelectedId(nextId);
        },
        [selectedId, persistSelectedSpecs]
    );

    useEffect(() => {
        if (dataset) {
            const { provider } = props;
            const datasetId = dataset.id;
            const generation = ++specSyncGenerationRef.current;
            const isCurrent = () => specSyncGenerationRef.current === generation;
            provider.getMeta(datasetId).then(setMeta);
            syncProviderSpecs(provider, datasetId, vizSpecStoreRef, isCurrent);
            const disposer = provider.registerCallback((e, eventDatasetId) => {
                if (datasetId === eventDatasetId) {
                    if (e & IDataSourceEventType.updateData) {
                        refreshComputation();
                    }
                    if (e & IDataSourceEventType.updateMeta) {
                        provider.getMeta(eventDatasetId).then(setMeta);
                    }
                    if (e & IDataSourceEventType.updateSpec) {
                        syncProviderSpecs(provider, eventDatasetId, vizSpecStoreRef, isCurrent);
                    }
                }
            });
            return () => {
                disposer();
                persistDatasetSpecs(provider, datasetId, datasetStoresRef.current.get(datasetId));
            };
        }
    }, [dataset, props.provider]);

    const computation = useMemo<IComputationFunction>(
        () => async (payload) => {
            return selectedId ? props.provider.queryData(payload, [selectedId]) : [];
        },
        [computationID, props.provider, selectedId]
    );

    const onMetaChange = useCallback(
        (fid: string, meta: Partial<IMutField>) => {
            setMeta((x) => {
                const result = x.map((f) => (f.fid === fid ? { ...f, ...meta } : f));
                props.provider.setMeta(selectedId, result);
                return result;
            });
        },
        [props.provider, selectedId]
    );

    handleSelectIdRef.current = handleSelectId;
    const commonStore = useMemo(
        () => new CommonStore(props.provider, (id) => handleSelectIdRef.current(id), { displayOffset: props.displayOffset }),
        [props.provider]
    );

    useEffect(() => {
        commonStore.setDisplayOffset(props.displayOffset);
    }, [props.displayOffset, commonStore]);

    const onLoad = useMemo(() => {
        const importFile = props.provider.onImportFile;
        if (importFile) {
            return (file: File) => {
                importFile(file);
                once(props.provider.registerCallback, (e) => {
                    if (e & IDataSourceEventType.updateList) {
                        props.provider.getDataSourceList().then(([first]) => setSelectedId(first.id));
                    }
                });
            };
        }
    }, [props.provider]);

    const onSave = useMemo(() => {
        const exportFile = props.provider.onExportFile;
        if (exportFile) {
            return async () => {
                persistSelectedSpecs(selectedId);
                return exportFile();
            };
        }
    }, [selectedId, persistSelectedSpecs, props.provider]);

    const syncSpecs = useCallback(() => {
        persistSelectedSpecs(selectedId);
    }, [selectedId, persistSelectedSpecs]);

    const darkMode = useCurrentMediaTheme(props.appearance ?? props.dark);
    const [currentTheme, setCurrentTheme] = useState<IThemeKey | GWGlobalConfig>(
        (props.vizThemeConfig ?? props.themeConfig ?? props.themeKey) as IThemeKey | GWGlobalConfig
    );
    const [portal, setPortal] = useState<HTMLDivElement | null>(null);

    return (
        <>
            {!props.hideDatasetToolbar && (
            <ShadowDom
                // This host is toolbar-sized, while its create-data-source dialog
                // must remain reachable in the viewport.
                containOverlays={false}
                uiTheme={props.uiTheme ?? props.colorConfig}
            >
                <DataSourceThemeContext
                    themeContext={darkMode}
                    vegaThemeContext={{ vizThemeConfig: currentTheme, setVizThemeConfig: setCurrentTheme }}
                    portalContainerContext={portal}
                >
                    <div className={`${darkMode === 'dark' ? 'dark' : ''} App`}>
                        <DataSourceSegment
                            commonStore={commonStore}
                            dataSources={datasetList}
                            onSelectId={handleSelectId}
                            selectedId={selectedId}
                            onLoad={onLoad}
                            onSave={onSave}
                            hideCreateDataset={props.hideCreateDataset}
                            onRemove={
                                props.provider.removeDataSource
                                    ? (id) => {
                                          void props.provider.removeDataSource?.(id);
                                      }
                                    : undefined
                            }
                        />
                        <div ref={setPortal} />
                    </div>
                </DataSourceThemeContext>
            </ShadowDom>
            )}
            <props.children
                computation={computation}
                datasetName={dataset?.name ?? ''}
                datasetId={selectedId}
                meta={meta}
                onMetaChange={onMetaChange}
                storeRef={vizSpecStoreRef}
                syncSpecs={syncSpecs}
            />
        </>
    );
}

export default DataSourceSegment;
