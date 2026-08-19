/**
 * Radix DialogTitleWarning uses document.getElementById.
 * Graphic Walker dialogs live in a shadow root, so the real title is invisible
 * to that lookup. A hidden light-DOM probe with the same id silences the warning
 * without moving the styled dialog out of the shadow tree.
 */
export function bindLightDomTitleProbe(id: string): () => void {
    if (!id || typeof document === 'undefined') {
        return () => undefined;
    }
    if (document.getElementById(id)) {
        return () => undefined;
    }
    const probe = document.createElement('span');
    probe.id = id;
    probe.setAttribute('data-gw-dialog-title-probe', '');
    probe.hidden = true;
    document.body.appendChild(probe);
    return () => {
        probe.remove();
    };
}
