import { observer } from 'mobx-react-lite';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVizStore } from '../../store';
import { isNotEmpty, parseErrorMessage } from '../../utils';
import { highlightField } from '../highlightField';
import { aggFuncs, reservedKeywords, sqlFunctions } from '../../lib/sql';
import { COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID, PAINT_FIELD_ID } from '../../constants';
import { unstable_batchedUpdates } from 'react-dom';
import { Dialog, DialogContent } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

const keywordRegex = new RegExp(`\\b(${Array.from(reservedKeywords).join('|')})\\b`, 'gi');
const bulitInRegex = new RegExp(`\\b(${Array.from(sqlFunctions).join('|')})(\\s*)\\(`, 'gi');
const aggBultinRegex = new RegExp(`\\b(${Array.from(aggFuncs).join('|')})(\\s*)\\(`, 'gi');

const stringRegex = /('[^']*'?)/g;

const ComputedFieldDialog: React.FC = observer(() => {
    const vizStore = useVizStore();
    const { t } = useTranslation();
    const { editingComputedFieldFid } = vizStore;
    const [name, setName] = useState<string>('');
    const [sql, setSql] = useState<string>('');
    const [error, setError] = useState<string>('');
    const ref = useRef<HTMLDivElement>(null);

    const SQLField = useMemo(() => {
        const fields = vizStore.allFields
            .filter((x) => ![COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID, PAINT_FIELD_ID].includes(x.fid))
            .map((x) => x.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
            .join('|');
        const fieldRegex = fields.length > 0 ? new RegExp(`\\b(${fields})\\b`, 'gi') : null;
        return highlightField((sql: string) => {
            // highlight field
            if (fieldRegex) {
                sql = sql.replace(fieldRegex, '<span class="text-blue-700 dark:text-blue-600">$1</span>');
            }

            // highlight keyword
            sql = sql.replace(keywordRegex, '<span class="text-fuchsia-700 dark:text-fuchsia-600">$1</span>');

            // highlight function
            sql = sql.replace(bulitInRegex, '<span class="text-yellow-700 dark:text-yellow-600">$1</span>$2(');

            // highlight agg function
            sql = sql.replace(aggBultinRegex, '<span class="text-amber-700 dark:text-amber-600">$1</span>$2(');

            // highlight string
            sql = sql.replace(stringRegex, '<span class="text-green-700 dark:text-green-600">$1</span>');

            return sql;
        });
    }, [vizStore.allFields]);

    useEffect(() => {
        if (isNotEmpty(editingComputedFieldFid)) {
            if (editingComputedFieldFid === '') {
                let idx = 1;
                while (vizStore.allFields.find((x) => x.name === `Computed ${idx}`)) {
                    idx++;
                }
                unstable_batchedUpdates(() => {
                    setName(`Computed ${idx}`);
                    setSql('');
                    setError('');
                });
                ref.current && (ref.current.innerHTML = '');
            } else {
                const f = vizStore.allFields.find((x) => x.fid === editingComputedFieldFid);
                if (!f || !f.computed || f.expression?.op !== 'expr') {
                    vizStore.setComputedFieldFid('');
                    return;
                }
                const sql = f.expression.params.find((x) => x.type === 'sql');
                if (!sql) {
                    vizStore.setComputedFieldFid('');
                    return;
                }
                unstable_batchedUpdates(() => {
                    setName(f.name);
                    setSql(sql.value);
                    setError('');
                });
                ref.current && (ref.current.innerHTML = sql.value);
            }
        }
    }, [editingComputedFieldFid, vizStore]);

    if (!isNotEmpty(editingComputedFieldFid)) return null;

    return (
        <Dialog
            open={true}
            onOpenChange={() => {
                vizStore.setComputedFieldFid();
            }}
        >
            <DialogContent aria-describedby={undefined}>
                <div className="flex flex-col space-y-2">
                    <div>
                        <div className="text-xl font-bold">
                            {editingComputedFieldFid === '' ? t('computed_field.add_title') : t('computed_field.edit_title')}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {t('computed_field.guide')}{' '}
                            <a
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline text-primary"
                                href="https://github.com/Kanaries/graphic-walker/wiki/How-to-Create-Computed-field-in-Graphic-Walker"
                            >
                                {t('computed_field.read_here')}
                            </a>
                        </span>
                    </div>
                    <div className="flex flex-col space-y-2">
                        <label className="text-ml whitespace-nowrap">{t('computed_field.name')}</label>
                        <Input
                            type="text"
                            value={name}
                            placeholder={t('computed_field.name_placeholder')}
                            onChange={(e) => {
                                setName(e.target.value);
                            }}
                        />
                        <label className="text-ml whitespace-nowrap">{t('computed_field.sql')}</label>
                        <SQLField ref={ref} value={sql} onChange={setSql} placeholder={t('computed_field.sql_placeholder')} />
                    </div>
                    {error && <div className="text-xs text-red-500">{error}</div>}
                    <div className="flex justify-end space-x-2">
                        <Button
                            disabled={!sql || !name}
                            children={editingComputedFieldFid === '' ? t('computed_field.add') : t('computed_field.edit')}
                            onClick={() => {
                                try {
                                    vizStore.upsertComputedField(editingComputedFieldFid!, name, sql);
                                    vizStore.setComputedFieldFid();
                                } catch (e) {
                                    setError(parseErrorMessage(e));
                                }
                            }}
                        ></Button>
                        <Button variant="outline" children={t('actions.cancel')} onClick={() => vizStore.setComputedFieldFid()}></Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
});

export default ComputedFieldDialog;
