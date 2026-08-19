import { bindLightDomTitleProbe } from './dialogTitleProbe';

type ProbeNode = {
    id: string;
    hidden: boolean;
    removed?: boolean;
    setAttribute: (name: string, value: string) => void;
    remove: () => void;
};

function installDocumentMock() {
    const nodes: ProbeNode[] = [];
    const documentMock = {
        getElementById(id: string) {
            return nodes.find((node) => node.id === id && !node.removed) ?? null;
        },
        createElement(): ProbeNode {
            const node: ProbeNode = {
                id: '',
                hidden: false,
                setAttribute() {
                    return undefined;
                },
                remove() {
                    node.removed = true;
                },
            };
            return node;
        },
        body: {
            appendChild(node: ProbeNode) {
                nodes.push(node);
                return node;
            },
        },
    };
    const previous = (globalThis as { document?: unknown }).document;
    (globalThis as unknown as { document: typeof documentMock }).document = documentMock;
    return {
        document: documentMock,
        restore() {
            if (previous === undefined) {
                delete (globalThis as { document?: unknown }).document;
            } else {
                (globalThis as { document: unknown }).document = previous;
            }
        },
    };
}

describe('bindLightDomTitleProbe', () => {
    let restore: () => void;
    let documentMock: ReturnType<typeof installDocumentMock>['document'];

    beforeEach(() => {
        ({ restore, document: documentMock } = installDocumentMock());
    });

    afterEach(() => {
        restore();
    });

    test('inserts a hidden light-DOM node so Radix can find the dialog title id', () => {
        const release = bindLightDomTitleProbe('gw-dialog-title');
        const probe = documentMock.getElementById('gw-dialog-title');
        expect(probe).not.toBeNull();
        expect(probe?.hidden).toBe(true);
        release();
        expect(documentMock.getElementById('gw-dialog-title')).toBeNull();
    });

    test('does not duplicate an id that already exists in the document', () => {
        const existing = documentMock.createElement();
        existing.id = 'gw-dialog-title';
        documentMock.body.appendChild(existing);
        const release = bindLightDomTitleProbe('gw-dialog-title');
        expect(documentMock.getElementById('gw-dialog-title')).toBe(existing);
        release();
        expect(documentMock.getElementById('gw-dialog-title')).toBe(existing);
    });
});
