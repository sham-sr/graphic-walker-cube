#!/usr/bin/env python3
"""
Сборка (python -m build) и публикация Python-пакетов в Nexus PyPI hosted (twine).

Использование:
  python scripts/publish_py_package_nexus.py -p etl-transformers
  python scripts/publish_py_package_nexus.py -p etl-transformers --no-publish
  python scripts/publish_py_package_nexus.py -l
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
CONFIG_PATH = SCRIPT_DIR / "nexus_config.json"
ENV_FILE = SCRIPT_DIR / ".env"
ENV_EXAMPLE = SCRIPT_DIR / ".env.example"


def load_config() -> tuple[dict, dict]:
    """Загружает shared + pypi env и packages из nexus_config.json."""
    if not CONFIG_PATH.exists():
        sys.exit(f"Конфиг не найден: {CONFIG_PATH}")
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    pypi = data.get("pypi") or {}
    env = {**(data.get("env") or {}), **(pypi.get("env") or {})}
    return env, pypi.get("packages") or {}


def apply_env_defaults(env_defaults: dict) -> None:
    for k, v in env_defaults.items():
        if v is not None and k not in os.environ:
            os.environ[k] = str(v)


def load_dotenv_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ[k.strip()] = v.strip().strip('"\'')


def load_local_env() -> bool:
    """Загружает scripts/.env. Возвращает False, если файла нет."""
    if not ENV_FILE.exists():
        return False
    load_dotenv_file(ENV_FILE)
    return True


def hint_create_env() -> None:
    print(
        f"Нет {ENV_FILE}\n"
        f"Создайте: copy {ENV_EXAMPLE.name} .env  (в каталоге scripts/)\n"
        f"и укажите NEXUS_PASSWORD.",
        file=sys.stderr,
    )


def nexus_credentials() -> tuple[str, str]:
    """Один юзер/пароль для Docker и PyPI."""
    user = (os.environ.get("NEXUS_USER") or "").strip()
    password = (os.environ.get("NEXUS_PASSWORD") or "").strip()
    return user, password


def run_stream(cmd: list[str], cwd: Path | None, env: dict[str, str] | None = None) -> int:
    return subprocess.run(cmd, cwd=cwd, env=env).returncode


def version_from_pyproject(pkg_dir: Path) -> str | None:
    pt = pkg_dir / "pyproject.toml"
    if not pt.is_file():
        return None
    try:
        import tomllib

        data = tomllib.loads(pt.read_text(encoding="utf-8"))
        v = data.get("project", {}).get("version")
        return str(v) if v else None
    except Exception:
        return None


def _artifact_matches_version(artifact: str, version: str) -> bool:
    name = Path(artifact).name
    if name.endswith(".tar.gz"):
        return name.endswith(f"-{version}.tar.gz")
    if name.endswith(".whl"):
        return f"-{version}-" in name
    return False


def list_dist_files(dist_dir: Path, project_version: str | None = None) -> list[str]:
    files = sorted(dist_dir.glob("*.whl")) + sorted(dist_dir.glob("*.tar.gz"))
    paths = [str(p) for p in files]
    if not project_version:
        return paths
    matched = [p for p in paths if _artifact_matches_version(p, project_version)]
    if not matched:
        return paths
    if len(matched) < len(paths):
        print(
            f"В dist/ лежат артефакты разных версий; публикуем только {project_version} "
            f"(из pyproject.toml). Очистите dist/ вручную или пересоберите без --skip-build.",
            file=sys.stderr,
        )
    return matched


def ensure_tools() -> None:
    try:
        import build  # noqa: F401
    except ImportError:
        print("Нужен пакет 'build'. Установите: python -m pip install build twine", file=sys.stderr)
        sys.exit(1)
    try:
        import twine  # noqa: F401
    except ImportError:
        print("Нужен пакет 'twine'. Установите: python -m pip install build twine", file=sys.stderr)
        sys.exit(1)


def publish_one(
    name: str,
    packages: dict,
    no_publish: bool,
    skip_build: bool,
) -> int:
    if name not in packages:
        print(f"Пакет '{name}' не в конфиге. Доступные: {', '.join(packages)}", file=sys.stderr)
        return 1
    rel = packages[name].get("path")
    if not rel:
        print(f"Для '{name}' не задан path в конфиге", file=sys.stderr)
        return 1
    pkg_dir = (PROJECT_ROOT / rel).resolve()
    if not pkg_dir.is_dir():
        print(f"Каталог пакета не найден: {pkg_dir}", file=sys.stderr)
        return 1

    dist_dir = pkg_dir / "dist"
    if not skip_build:
        if dist_dir.is_dir():
            print(f"\n=== [{name}] Очистка {dist_dir} (иначе twine зальёт старые версии) ===")
            shutil.rmtree(dist_dir)
        print(f"\n=== [{name}] Сборка в {pkg_dir} ===")
        if run_stream([sys.executable, "-m", "build"], cwd=pkg_dir) != 0:
            return 1
    else:
        if not dist_dir.is_dir() or not any(dist_dir.iterdir()):
            print(f"Нет артефактов в {dist_dir}. Уберите --skip-build или соберите вручную.", file=sys.stderr)
            return 1

    if no_publish:
        print(f"=== [{name}] Готово (артефакты в {dist_dir}) ===")
        return 0

    url = os.environ.get("PYPI_REPOSITORY_URL", "").strip()
    user, password = nexus_credentials()
    if not url or not user or not password:
        if not ENV_FILE.exists():
            hint_create_env()
        else:
            print(
                "Для публикации нужны PYPI_REPOSITORY_URL (конфиг) и "
                f"NEXUS_PASSWORD в {ENV_FILE}",
                file=sys.stderr,
            )
        return 1

    ver = version_from_pyproject(pkg_dir)
    files = list_dist_files(dist_dir, ver)
    if not files:
        print("Нет .whl или .tar.gz в dist/", file=sys.stderr)
        return 1

    print(f"\n=== [{name}] Проверка dist (twine check) ===")
    if run_stream([sys.executable, "-m", "twine", "check", *files], cwd=pkg_dir) != 0:
        return 1

    twine_env = os.environ.copy()
    twine_env["TWINE_USERNAME"] = user
    twine_env["TWINE_PASSWORD"] = password

    print(f"=== [{name}] Публикация в {url} ===")
    cmd = [sys.executable, "-m", "twine", "upload", "--repository-url", url, *files]
    if run_stream(cmd, cwd=pkg_dir, env=twine_env) != 0:
        return 1
    print(f"=== [{name}] Опубликовано ===")
    return 0


def interactive_menu(packages: dict) -> None:
    names = list(packages.keys())
    print("\nДоступные пакеты:")
    for i, s in enumerate(names, 1):
        print(f"  {i}. {s}")
    print()
    choice = input("Выберите номер или имя (Enter = выйти): ").strip()
    if not choice:
        return
    sel = (
        choice
        if choice in names
        else (names[int(choice) - 1] if choice.isdigit() and 1 <= int(choice) <= len(names) else None)
    )
    if sel is None:
        print("Неверный выбор", file=sys.stderr)
        sys.exit(1)
    no_pub = input("Только сборка, без публикации? [y/N]: ").strip().lower() in ("y", "yes", "д", "да")
    skip = input("Пропустить сборку, только upload из dist/? [y/N]: ").strip().lower() in ("y", "yes")
    sys.exit(publish_one(sel, packages, no_pub, skip))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Сборка и публикация Python-пакетов в Nexus (twine)"
    )
    parser.add_argument("-p", "--package", help="Имя пакета из конфига (ключ в packages)")
    parser.add_argument("-n", "--no-publish", action="store_true", help="Только build, без twine upload")
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Не вызывать python -m build, только twine (существующий dist/)",
    )
    parser.add_argument("-l", "--list", action="store_true", help="Список пакетов из конфига")
    args = parser.parse_args()

    env_defaults, packages = load_config()
    apply_env_defaults(env_defaults)
    load_local_env()

    if args.list:
        for p in packages:
            path = packages[p].get("path", "?")
            print(f"  {p}  ->  {path}")
        return 0

    ensure_tools()

    if not args.package:
        interactive_menu(packages)
        return 0

    return publish_one(args.package, packages, args.no_publish, args.skip_build)


if __name__ == "__main__":
    sys.exit(main())
