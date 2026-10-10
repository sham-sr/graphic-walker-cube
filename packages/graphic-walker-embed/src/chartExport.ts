import type { WalkerChartExportFormat, WalkerTableGrid } from './contract';

/** Subset of the Graphic Walker renderer handle used by the editor export toolbar. */
export interface ChartRendererExport {
    getCanvasData(): Promise<string[]>;
    getSVGData(): Promise<string[]>;
}

/** Pivot toolbar download handle filled by `PivotTableCore`. */
export interface TableExportHandle {
    download: () => void;
    downloadXLSX?: () => void;
    downloadODS?: () => void;
    readGrid?: () => WalkerTableGrid | null;
}

const TABLE_FORMATS = new Set<WalkerChartExportFormat>(['csv', 'xlsx', 'ods']);

export function isTableExportFormat(format: WalkerChartExportFormat): format is 'csv' | 'xlsx' | 'ods' {
    return TABLE_FORMATS.has(format);
}

/** Invoke the same pivot download the editor toolbar uses. The handler saves the file itself. */
export function runTableExport(handler: TableExportHandle | null, format: 'csv' | 'xlsx' | 'ods'): void {
    if (!handler) {
        throw new Error('Chart is not ready to export');
    }
    if (format === 'csv') {
        handler.download();
        return;
    }
    if (format === 'xlsx') {
        if (!handler.downloadXLSX) {
            throw new Error('Chart is not ready to export');
        }
        handler.downloadXLSX();
        return;
    }
    if (!handler.downloadODS) {
        throw new Error('Chart is not ready to export');
    }
    handler.downloadODS();
}

/** Read the on-screen pivot as a text grid. Throws when the table model is not ready. */
export function readTableGrid(handler: TableExportHandle | null): WalkerTableGrid {
    if (!handler?.readGrid) {
        throw new Error('Chart is not ready to export');
    }
    const grid = handler.readGrid();
    if (!grid) {
        throw new Error('Chart is not ready to export');
    }
    return grid;
}

/**
 * Read the image the editor toolbar would download.
 * Uses `getCanvasData` / `getSVGData` and does not click a download link.
 */
export async function readChartExport(renderer: ChartRendererExport | null, format: WalkerChartExportFormat): Promise<string> {
    if (!renderer) {
        throw new Error('Chart is not ready to export');
    }
    const parts = format === 'png' ? await renderer.getCanvasData() : await renderer.getSVGData();
    const data = parts.find((part) => part.length > 0);
    if (!data) {
        throw new Error('Chart export is empty');
    }
    return data;
}
