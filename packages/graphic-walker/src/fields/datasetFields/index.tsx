import React, { useEffect } from 'react';
import { Droppable } from '@kanaries/react-beautiful-dnd';
import { useTranslation } from 'react-i18next';
import DimFields from './dimFields';
import MeaFields from './meaFields';
import { refMapper } from '../fieldsContext';
import { useVizStore } from '../../store';

const DatasetFields: React.FC = (props) => {
    const { t } = useTranslation('translation', { keyPrefix: 'main.tabpanel.DatasetFields' });
    const vizStore = useVizStore();

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                vizStore.clearFieldSelection();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [vizStore]);

    return (
        <div
            className="p-1 sm:mr-0.5 my-0.5 border flex sm:flex-col sm:h-full min-h-0 overflow-hidden"
            style={{ paddingBlock: 0, paddingInline: '0.6em' }}
            onClick={(e) => {
                // clicking blank space (not a field pill) drops the selection
                if (!(e.target as HTMLElement).closest('[data-field-pill]')) {
                    vizStore.clearFieldSelection();
                }
            }}
        >
            <h4 className="text-xs mb-1 flex-shrink-0 cursor-default select-none mt-1">{t('field_list')}</h4>
            <Droppable droppableId="dimensions" direction="vertical">
                {(provided, snapshot) => (
                    <div className="min-h-0 min-w-0 overflow-y-auto flex-1" {...provided.droppableProps} ref={refMapper(provided.innerRef)}>
                        <div className="pd-1">
                            <DimFields />
                        </div>
                    </div>
                )}
            </Droppable>
            <Droppable droppableId="measures" direction="vertical">
                {(provided, snapshot) => (
                    <div className="min-h-0 min-w-0 overflow-y-auto flex-1" {...provided.droppableProps} ref={refMapper(provided.innerRef)}>
                        <div className="border-t pd-1">
                            <MeaFields />
                        </div>
                    </div>
                )}
            </Droppable>
        </div>
    );
};

export default DatasetFields;
