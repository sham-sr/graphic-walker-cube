function resolveChart(data) {
    const parsed = JSON.parse(data);
    if (parsed && parsed.encodings) {
        return parsed;
    }
    if (parsed && parsed.base) {
        return {
            visId: parsed.base.visId,
            name: parsed.base.name || 'Chart',
            encodings: parsed.base.encodings || {},
            config: parsed.base.config || {},
            layout: parsed.base.layout || {},
        };
    }
    return parsed;
}

function DataSourceSegmentComponent(props) {
    if (typeof props.children !== 'function') {
        return null;
    }
    return props.children({
        meta: [],
        onMetaChange() {},
        computation: async () => [],
        storeRef: { current: null },
        datasetName: '',
        datasetId: '',
        syncSpecs() {},
    });
}

const graphicWalkerMounts = [];

function GraphicWalker(props) {
    graphicWalkerMounts.push(props);
    return null;
}

function PureRenderer() {
    return null;
}

const sheetFilterMounts = [];

function SheetFilterEditor(props) {
    sheetFilterMounts.push({
        fieldAllowlist: props.fieldAllowlist,
        specRaw: props.specRaw,
        onClose: props.onClose,
    });
    return null;
}

module.exports = {
    resolveChart,
    DataSourceSegmentComponent,
    GraphicWalker,
    graphicWalkerMounts,
    PureRenderer,
    SheetFilterEditor,
    sheetFilterMounts,
};
