/**
 * Запланировать `run` на ближайший кадр; при размонтировании — cancel.
 * @module
 */
export function scheduleRafResize(run: () => void): () => void {
    let rafId: number | null = null;

    const cancel = () => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    };

    if (rafId === null) {
        rafId = requestAnimationFrame(() => {
            rafId = null;
            run();
        });
    }

    return cancel;
}
