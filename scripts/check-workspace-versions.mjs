import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

async function loadRootWorkspaces() {
    const rootManifestPath = path.join(repoRoot, 'package.json');
    const rootManifest = JSON.parse(await fs.readFile(rootManifestPath, 'utf8'));
    const workspaceGlobs = rootManifest.workspaces?.packages;

    if (!Array.isArray(workspaceGlobs) || workspaceGlobs.length === 0) {
        throw new Error('В корневом package.json не задан workspaces.packages');
    }

    const unsupported = workspaceGlobs.filter((glob) => glob !== 'packages/*');
    if (unsupported.length > 0) {
        throw new Error(`Неподдерживаемые шаблоны workspaces: ${unsupported.join(', ')}`);
    }

    const packagesDir = path.join(repoRoot, 'packages');
    const entries = await fs.readdir(packagesDir, { withFileTypes: true });
    const packageDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    return packageDirs.map((dirName) => path.join(packagesDir, dirName));
}

async function buildWorkspaceVersionMap(packageDirs) {
    /** @type {Map<string, { version: string, dirName: string }>} */
    const workspaceByName = new Map();

    for (const packageDir of packageDirs) {
        const manifestPath = path.join(packageDir, 'package.json');
        let manifest;

        try {
            manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        } catch (error) {
            if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
                continue;
            }
            throw error;
        }

        const name = manifest.name;
        const version = manifest.version;

        if (typeof name !== 'string' || typeof version !== 'string') {
            continue;
        }

        workspaceByName.set(name, {
            version,
            dirName: path.basename(packageDir),
        });
    }

    return workspaceByName;
}

async function main() {
    const packageDirs = await loadRootWorkspaces();
    const workspaceByName = await buildWorkspaceVersionMap(packageDirs);
    /** @type {string[]} */
    const errors = [];

    for (const packageDir of packageDirs) {
        const manifestPath = path.join(packageDir, 'package.json');
        let manifest;

        try {
            manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        } catch (error) {
            if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
                continue;
            }
            throw error;
        }

        const dirName = path.basename(packageDir);
        const relativeManifest = `packages/${dirName}/package.json`;

        for (const section of DEP_SECTIONS) {
            const deps = manifest[section];

            if (!deps || typeof deps !== 'object') {
                continue;
            }

            for (const [depName, spec] of Object.entries(deps)) {
                const workspace = workspaceByName.get(depName);

                if (!workspace || typeof spec !== 'string') {
                    continue;
                }

                if (spec !== workspace.version) {
                    errors.push(
                        `${relativeManifest}: ${section}.${depName} = ${spec}, версия в workspace — ${workspace.version}`
                    );
                }
            }
        }
    }

    if (errors.length > 0) {
        for (const message of errors) {
            console.error(message);
        }
        process.exit(1);
    }

    console.log('Проверка версий workspace-пакетов: OK');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
