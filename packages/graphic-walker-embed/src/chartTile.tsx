import { PureRenderer } from '@kanaries/graphic-walker';
import type { IDataQueryPayload, IDataSourceProvider } from '@kanaries/graphic-walker';

export interface ChartTileAppProps {
    spec: Record<string, unknown>;
    datasetId: string;
    provider: IDataSourceProvider;
    appearance: 'light' | 'dark';
    locale: string;
}

export function ChartTileApp(props: ChartTileAppProps) {
    const encodings = props.spec.encodings as Record<string, unknown>;
    const config = props.spec.config as Record<string, unknown>;
    const layout = (props.spec.layout as Record<string, unknown> | undefined) ?? {};
    const name = typeof props.spec.name === 'string' ? props.spec.name : undefined;
    const computation = (payload: IDataQueryPayload) => props.provider.queryData(payload, [props.datasetId]);

    return (
        <PureRenderer
            type="remote"
            computation={computation}
            visualState={encodings}
            visualConfig={config}
            visualLayout={layout}
            overrideSize={{ mode: 'full', width: 1, height: 1 }}
            appearance={props.appearance}
            vizThemeConfig="cube"
            locale={props.locale}
            name={name}
            disableCollapse
            showToolbar={false}
        />
    );
}
