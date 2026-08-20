import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import { PIVOT_SCROLLPORT_CLASS, pivotScrollFromPointerRatio, pivotScrollThumb } from './scrollport';

type Axis = 'h' | 'v';

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
    return (node: T | null) => {
        for (const ref of refs) {
            if (!ref) {
                continue;
            }
            if (typeof ref === 'function') {
                ref(node);
            } else {
                (ref as React.MutableRefObject<T | null>).current = node;
            }
        }
    };
}

export interface PivotScrollViewportProps {
    children: React.ReactNode;
    virtualized?: boolean;
}

export const PivotScrollViewport = forwardRef<HTMLDivElement, PivotScrollViewportProps>(function PivotScrollViewport(
    { children, virtualized },
    forwardedRef
) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const hTrackRef = useRef<HTMLDivElement>(null);
    const vTrackRef = useRef<HTMLDivElement>(null);
    const [, bump] = React.useState(0);
    const refresh = useCallback(() => bump((value) => value + 1), []);
    const setViewport = useCallback((node: HTMLDivElement | null) => {
        mergeRefs(viewportRef, forwardedRef)(node);
    }, [forwardedRef]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) {
            return;
        }
        refresh();
        el.addEventListener('scroll', refresh, { passive: true });
        const observer = new ResizeObserver(refresh);
        observer.observe(el);
        const table = el.firstElementChild;
        if (table) {
            observer.observe(table);
        }
        return () => {
            el.removeEventListener('scroll', refresh);
            observer.disconnect();
        };
    }, [refresh, children]);

    const el = viewportRef.current;
    const hTrack = hTrackRef.current;
    const vTrack = vTrackRef.current;
    const hThumb = el && hTrack ? pivotScrollThumb(el.scrollWidth, el.clientWidth, el.scrollLeft, hTrack.clientWidth) : null;
    const vThumb = el && vTrack ? pivotScrollThumb(el.scrollHeight, el.clientHeight, el.scrollTop, vTrack.clientHeight) : null;

    const onTrackPointerDown = (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const track = event.currentTarget;
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }
        const apply = (clientX: number, clientY: number) => {
            const rect = track.getBoundingClientRect();
            if (axis === 'h') {
                const thumb = pivotScrollThumb(viewport.scrollWidth, viewport.clientWidth, viewport.scrollLeft, track.clientWidth);
                if (!thumb || rect.width <= 0) {
                    return;
                }
                viewport.scrollLeft = pivotScrollFromPointerRatio(
                    (clientX - rect.left) / rect.width,
                    thumb.length,
                    track.clientWidth,
                    viewport.scrollWidth,
                    viewport.clientWidth
                );
                return;
            }
            const thumb = pivotScrollThumb(viewport.scrollHeight, viewport.clientHeight, viewport.scrollTop, track.clientHeight);
            if (!thumb || rect.height <= 0) {
                return;
            }
            viewport.scrollTop = pivotScrollFromPointerRatio(
                (clientY - rect.top) / rect.height,
                thumb.length,
                track.clientHeight,
                viewport.scrollHeight,
                viewport.clientHeight
            );
        };
        apply(event.clientX, event.clientY);
        const onMove = (next: PointerEvent) => apply(next.clientX, next.clientY);
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    return (
        <div className="absolute inset-0 min-h-0 min-w-0">
            <div
                ref={setViewport}
                className={PIVOT_SCROLLPORT_CLASS}
                data-testid="pivot-table-view"
                data-virtualized={virtualized ? 'true' : undefined}
            >
                {children}
            </div>
            <div
                ref={hTrackRef}
                className={`absolute bottom-0 left-0 right-3 z-20 h-3 cursor-pointer rounded-sm bg-black/10 dark:bg-white/10${hThumb ? '' : ' pointer-events-none opacity-0'}`}
                data-testid="pivot-scrollbar-x"
                onPointerDown={onTrackPointerDown('h')}
            >
                {hThumb && (
                    <div
                        className="absolute top-0.5 h-2 rounded-sm bg-black/45 dark:bg-white/45"
                        style={{ width: hThumb.length, left: hThumb.offset }}
                    />
                )}
            </div>
            <div
                ref={vTrackRef}
                className={`absolute bottom-3 right-0 top-0 z-20 w-3 cursor-pointer rounded-sm bg-black/10 dark:bg-white/10${vThumb ? '' : ' pointer-events-none opacity-0'}`}
                data-testid="pivot-scrollbar-y"
                onPointerDown={onTrackPointerDown('v')}
            >
                {vThumb && (
                    <div
                        className="absolute left-0.5 w-2 rounded-sm bg-black/45 dark:bg-white/45"
                        style={{ height: vThumb.length, top: vThumb.offset }}
                    />
                )}
            </div>
        </div>
    );
});
