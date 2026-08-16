import { inject } from '@vercel/analytics';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DataSourceSegmentComponent, GraphicWalker, createMemoryProvider } from '@kanaries/graphic-walker';
import type { IDataSourceProvider } from '@kanaries/graphic-walker';
import './index.css';

if (!import.meta.env.DEV) {
    inject();
}

const LANG_STORAGE_KEY = 'gw-playground-lang';

const LANGUAGES = [
    { id: 'en-US', label: 'English' },
    { id: 'ru-RU', label: 'Русский' },
    { id: 'zh-CN', label: '中文' },
    { id: 'ja-JP', label: '日本語' },
] as const;

type LangId = (typeof LANGUAGES)[number]['id'];

const GEO_LIST = [
    { name: 'World Countries', type: 'GeoJSON' as const, url: 'https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json' },
    {
        name: 'World Cities',
        type: 'GeoJSON' as const,
        url: 'https://raw.githubusercontent.com/drei01/geojson-world-cities/f2a988af4bc15463df55586afbbffbd3068b7218/cities.geojson',
    },
];

function readStoredLang(): LangId {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (LANGUAGES.some((lang) => lang.id === stored)) {
        return stored as LangId;
    }
    return 'ru-RU';
}

function PlaygroundApp() {
    const [lang, setLang] = useState<LangId>(readStoredLang);
    const [provider, setProvider] = useState<IDataSourceProvider | null>(null);
    const [engineLabel, setEngineLabel] = useState('DuckDB-WASM');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        localStorage.setItem(LANG_STORAGE_KEY, lang);
        document.documentElement.lang = lang;
    }, [lang]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { getMemoryProvider } = await import('@kanaries/duckdb-computation');
                const duckdbProvider = await getMemoryProvider();
                if (!cancelled) {
                    setProvider(duckdbProvider);
                    setEngineLabel('DuckDB-WASM');
                }
            } catch (reason) {
                console.error('[playground] DuckDB provider failed, falling back to in-memory JS', reason);
                if (!cancelled) {
                    setProvider(createMemoryProvider());
                    setEngineLabel('In-memory JS (DuckDB unavailable)');
                    setError(reason instanceof Error ? reason.message : String(reason));
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
            <header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 12px',
                    borderBottom: '1px solid #e5e7eb',
                    flexShrink: 0,
                }}
            >
                <strong style={{ fontSize: 14 }}>Graphic Walker</strong>
                <span
                    style={{
                        fontSize: 12,
                        color: engineLabel.startsWith('DuckDB') ? '#15803d' : '#b45309',
                        background: engineLabel.startsWith('DuckDB') ? '#dcfce7' : '#ffedd5',
                        borderRadius: 999,
                        padding: '2px 8px',
                    }}
                >
                    {engineLabel}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label htmlFor="gw-lang" style={{ fontSize: 12, color: '#4b5563' }}>
                        Language
                    </label>
                    <select
                        id="gw-lang"
                        value={lang}
                        onChange={(event) => setLang(event.target.value as LangId)}
                        style={{
                            fontSize: 13,
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid #d1d5db',
                            background: '#fff',
                        }}
                    >
                        {LANGUAGES.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </div>
            </header>

            {error && (
                <div role="alert" style={{ padding: '6px 12px', fontSize: 12, background: '#fff7ed', color: '#9a3412' }}>
                    DuckDB init warning: {error}. Using fallback computation.
                </div>
            )}

            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                {!provider ? (
                    <div style={{ margin: 'auto', color: '#6b7280', fontSize: 14 }}>Starting DuckDB-WASM…</div>
                ) : (
                    <DataSourceSegmentComponent provider={provider} vizThemeConfig="g2">
                        {(p) => (
                            <GraphicWalker
                                i18nLang={lang}
                                vizThemeConfig="g2"
                                storeRef={p.storeRef}
                                computation={p.computation}
                                fields={p.meta}
                                onMetaChange={p.onMetaChange}
                                geoList={GEO_LIST}
                                experimentalFeatures={{ computedField: true }}
                                style={{ flex: 1, minHeight: 0 }}
                            />
                        )}
                    </DataSourceSegmentComponent>
                )}
            </div>
        </div>
    );
}

createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <PlaygroundApp />
    </React.StrictMode>
);
