/** Must match leaf metric / header cell CSS (`h-8`). */
export const PIVOT_ROW_HEIGHT_PX = 32;

export const PIVOT_SCROLLBAR_MIN_THUMB = 24;

/** Hide native OS scrollbars: they do not receive clicks inside a CSS-transformed dashboard tile. */
const PIVOT_SCROLLBAR_HIDE =
    '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:w-0';

/** Single bounded scroller: fills the core body and owns both axes. */
export const PIVOT_SCROLLPORT_CLASS =
    `absolute inset-0 min-h-0 min-w-0 overflow-auto overscroll-contain [overflow-anchor:none] ${PIVOT_SCROLLBAR_HIDE}`;

export const PIVOT_TABLE_CLASS = 'min-w-max border border-collapse';

export function pivotScrollThumb(
    scrollSize: number,
    clientSize: number,
    scrollPos: number,
    trackSize: number
): { length: number; offset: number } | null {
    if (scrollSize <= clientSize + 1 || trackSize <= 0) {
        return null;
    }
    const length = Math.min(trackSize, Math.max(PIVOT_SCROLLBAR_MIN_THUMB, (clientSize / scrollSize) * trackSize));
    const maxOffset = Math.max(0, trackSize - length);
    const range = scrollSize - clientSize;
    const offset = maxOffset === 0 || range <= 0 ? 0 : (scrollPos / range) * maxOffset;
    return { length, offset };
}

export function pivotScrollFromThumb(
    offset: number,
    length: number,
    trackSize: number,
    scrollSize: number,
    clientSize: number
): number {
    const maxOffset = Math.max(0, trackSize - length);
    const range = Math.max(0, scrollSize - clientSize);
    if (maxOffset <= 0) {
        return 0;
    }
    const clamped = Math.min(maxOffset, Math.max(0, offset));
    return (clamped / maxOffset) * range;
}

/** Map a pointer along a transformed track using screen-space ratio, then CSS-pixel thumb math. */
export function pivotScrollFromPointerRatio(
    pointerRatio: number,
    thumbLength: number,
    trackSize: number,
    scrollSize: number,
    clientSize: number
): number {
    return pivotScrollFromThumb(pointerRatio * trackSize - thumbLength / 2, thumbLength, trackSize, scrollSize, clientSize);
}
