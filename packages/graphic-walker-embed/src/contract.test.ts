import {
    DatasetLimitError,
    GW_ARTIFACT_VERSION,
    GW_CONFIG_EXTENSION,
    GW_CONFIG_KIND,
    GW_REPORT_EXTENSION,
    GW_REPORT_KIND,
    detectWalkerArtifact,
    fileExtensionForKind,
    isGraphicWalkerConfig,
    isGraphicWalkerReport,
} from './contract';

const config = {
    kind: GW_CONFIG_KIND,
    version: GW_ARTIFACT_VERSION,
    datasets: [{ id: 'ds1', name: 'A', fields: [], specsJson: '[]' }],
};

const report = {
    kind: GW_REPORT_KIND,
    version: GW_ARTIFACT_VERSION,
    datasets: [{ id: 'ds1', name: 'A', fields: [], specsJson: '[]', rows: [{ n: 1 }] }],
};

describe('walker contract', () => {
    test('detects config and report kinds', () => {
        expect(isGraphicWalkerConfig(config)).toBe(true);
        expect(isGraphicWalkerReport(config)).toBe(false);
        expect(isGraphicWalkerReport(report)).toBe(true);
        expect(detectWalkerArtifact(config)?.kind).toBe(GW_CONFIG_KIND);
        expect(detectWalkerArtifact(report)?.kind).toBe(GW_REPORT_KIND);
        expect(detectWalkerArtifact({ kind: 'other', version: 1, datasets: [] })).toBeNull();
        expect(detectWalkerArtifact(null)).toBeNull();
    });

    test('maps file extensions by kind', () => {
        expect(fileExtensionForKind(GW_CONFIG_KIND)).toBe(GW_CONFIG_EXTENSION);
        expect(fileExtensionForKind(GW_REPORT_KIND)).toBe(GW_REPORT_EXTENSION);
    });

    test('DatasetLimitError exposes replace candidates', () => {
        const error = new DatasetLimitError(2, [{ id: 'a', name: 'A' }]);
        expect(error.code).toBe('DATASET_LIMIT');
        expect(error.maxDatasets).toBe(2);
        expect(error.datasets).toEqual([{ id: 'a', name: 'A' }]);
    });
});
