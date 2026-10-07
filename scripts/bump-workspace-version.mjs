import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const DEP_SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function usage() {
    console.error('Использование: node scripts/bump-workspace-version.mjs <package-name-or-dir> <new-version>');
    process.exit(1);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

/**
 * @param {string[]} packageDirs
 * @returns {Promise<Map<string, { name: string, version: string, dirName: string, manifestPath: string }>>}
 */
async function buildWorkspaceIndex(packageDirs) {
    /** @type {Map<string, { name: string, version: string, dirName: string, manifestPath: string }>} */
    const byName = new Map();
    /** @type {Map<string, { name: string, version: string, dirName: string, manifestPath: string }>} */
    const byDir = new Map();

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
        const dirName = path.basename(packageDir);

        if (typeof name !== 'string' || typeof version !== 'string') {
            continue;
        }

        const entry = { name, version, dirName, manifestPath };
        byName.set(name, entry);
        byDir.set(dirName, entry);
    }

    return { byName, byDir };
}

/**
 * @param {string} text
 * @param {string} packageName
 * @param {string} newVersion
 */
function replaceDependencyVersions(text, packageName, newVersion) {
    const depKey = escapeRegExp(packageName);
    const re = new RegExp(`(^\\s*"${depKey}":\\s*")([^"]+)(")`, 'gm');
    return text.replace(re, `$1${newVersion}$3`);
}

/**
 * @param {string} text
 * @param {string} newVersion
 */
function replaceOwnVersion(text, newVersion) {
    return text.replace(/^(\s*"version":\s*")([^"]+)(")/m, `$1${newVersion}$3`);
}

/**
 * @param {string} filePath
 * @param {string} content
 */
async function writeIfChanged(filePath, content, original) {
    if (content === original) {
        return false;
    }
    const withNewline = content.endsWith('\n') ? content : `${content}\n`;
    await fs.writeFile(filePath, withNewline, 'utf8');
    return true;
}

async function main() {
    const packageArg = process.argv[2];
    const newVersion = process.argv[3];

    if (!packageArg || !newVersion) {
        usage();
    }

    if (!SEMVER_RE.test(newVersion)) {
        console.error(`Некорректная версия: ${newVersion}`);
        process.exit(1);
    }

    const packageDirs = await loadRootWorkspaces();
    const { byName, byDir } = await buildWorkspaceIndex(packageDirs);

    const target = byName.get(packageArg) ?? byDir.get(packageArg);

    if (!target) {
        console.error(`Пакет не найден в workspace: ${packageArg}`);
        process.exit(1);
    }

    /** @type {string[]} */
    const changedFiles = [];

    const targetOriginal = await fs.readFile(target.manifestPath, 'utf8');
    const targetUpdated = replaceOwnVersion(targetOriginal, newVersion);
    if (await writeIfChanged(target.manifestPath, targetUpdated, targetOriginal)) {
        changedFiles.push(path.relative(repoRoot, target.manifestPath).replace(/\\/g, '/'));
    }

    for (const packageDir of packageDirs) {
        const manifestPath = path.join(packageDir, 'package.json');
        let original;

        try {
            original = await fs.readFile(manifestPath, 'utf8');
        } catch (error) {
            if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
                continue;
            }
            throw error;
        }

        let updated = original;
        let manifest;

        try {
            manifest = JSON.parse(original);
        } catch (error) {
            throw new Error(`Не удалось разобрать ${manifestPath}: ${/** @type {Error} */ (error).message}`);
        }

        let touchesDeps = false;
        for (const section of DEP_SECTIONS) {
            const deps = manifest[section];
            if (!deps || typeof deps !== 'object' || deps[target.name] === undefined) {
                continue;
            }
            touchesDeps = true;
        }

        if (!touchesDeps) {
            continue;
        }

        updated = replaceDependencyVersions(updated, target.name, newVersion);

        if (manifestPath === target.manifestPath) {
            continue;
        }

        if (await writeIfChanged(manifestPath, updated, original)) {
            changedFiles.push(path.relative(repoRoot, manifestPath).replace(/\\/g, '/'));
        }
    }

    if (changedFiles.length > 0) {
        console.log('Изменённые файлы:');
        for (const file of changedFiles) {
            console.log(`  ${file}`);
        }
    } else {
        console.log('Изменённых файлов нет');
    }

    const checkScript = path.join(scriptDir, 'check-workspace-versions.mjs');
    const result = spawnSync(process.execPath, [checkScript], {
        cwd: repoRoot,
        stdio: 'inherit',
    });

    process.exit(result.status ?? 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
