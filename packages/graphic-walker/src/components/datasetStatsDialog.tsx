import React from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { toJS } from 'mobx';
import DataTable from './dataTable';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useCompututaion, useVizStore } from '../store';

/** Профилирующая таблица по всему текущему датасету (как вкладка Data, но в модалке). */
const DatasetStatsDialog = observer(function DatasetStatsDialog({ hideProfiling }: { hideProfiling?: boolean }) {
    const vizStore = useVizStore();
    const computation = useCompututaion();
    const { t } = useTranslation();
    const metas = toJS(vizStore.meta);

    return (
        <Dialog
            open={vizStore.showDatasetStatsBoard}
            onOpenChange={(open) => {
                vizStore.setShowDatasetStatsBoard(open);
            }}
        >
            <DialogContent aria-describedby={undefined} className="flex max-h-[min(90vh,900px)] w-[min(96vw,1120px)] max-w-none flex-col gap-2">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle>{t('App.labels.dataset_statistics')}</DialogTitle>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-hidden">
                    <DataTable
                        size={100}
                        metas={metas}
                        computation={computation}
                        displayOffset={vizStore.config.timezoneDisplayOffset}
                        onMetaChange={(fid, _fIndex, diffMeta) => {
                            vizStore.updateCurrentDatasetMetas(fid, diffMeta);
                        }}
                        hideProfiling={hideProfiling}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
});

export default DatasetStatsDialog;
