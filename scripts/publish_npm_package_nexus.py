#!/usr/bin/env python3
"""
Сборка и публикация npm-пакетов Graphic Walker в Nexus hosted.

Использование:
  python scripts/publish_npm_package_nexus.py -l
  python scripts/publish_npm_package_nexus.py -p graphic-walker-embed
  python scripts/publish_npm_package_nexus.py -p graphic-walker --no-publish
  python scripts/publish_npm_package_nexus.py --all
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

DEP_REWRITES = {
    "@kanaries/graphic-walker": "@cube/graphic-walker",
    "@kanaries/duckdb-computation": "@cube/duckdb-computation",
}

PUBLISH_ORDER = ("graphic-walker", "duckdb-computation", "graphic-walker-embed")


def load_config() -> tuple[dict, dict]:
    if not CONFIG_PATH.exists():
        sys.exit(f"Конфиг не найден: {CONFIG_PATH}")
    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    npm = data.get("npm") or {}
    env = {**(data.get("env") or {}), **(npm.get("env") or {})}
    return env, npm.get("packages") or {}


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
            os.environ[k.strip()] = v.strip().strip("\"'")


def load_local_env() -> bool:
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
    user = (os.environ.get("NEXUS_USER") or "").strip()
    password = (os.environ.get("NEXUS_PASSWORD") or "").strip()
    return user, password


def run_stream(cmd: list[str], cwd: Path | None, env: dict[str, str] | None = None) -> int:
    return subprocess.run(cmd, cwd=cwd, env=env).returncode


def rewrite_deps(pkg: dict) -> dict:
    for section in ("dependencies", "optionalDependencies", "peerDependencies", "devDependencies"):
        deps = pkg.get(section)
        if not isinstance(deps, dict):
            continue
        pkg[section] = {DEP_REWRITES.get(name, name): spec for name, spec in deps.items()}
    return pkg


def prepare_package_json(src: Path, publish_name: str) -> str:
    original = src.read_text(encoding="utf-8")
    data = json.loads(original)
    data["name"] = publish_name
    rewrite_deps(data)
    publish_config = data.get("publishConfig") or {}
    publish_config["registry"] = os.environ.get(
        "NPM_REGISTRY_URL",
        "https://snr.promit-ek.ru/repository/cube.npm-hosted/",
    )
    data["publishConfig"] = publish_config
    src.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return original


def publish_one(name: str, packages: dict, no_publish: bool, skip_build: bool) -> int:
    if name not in packages:
        print(f"Пакет '{name}' не в конфиге. Доступные: {', '.join(packages)}", file=sys.stderr)
        return 1
    rel = packages[name].get("path")
    publish_name = packages[name].get("publishName") or packages[name].get("name")
    if not rel:
        print(f"Для '{name}' не задан path в конфиге", file=sys.stderr)
        return 1
    pkg_dir = (PROJECT_ROOT / rel).resolve()
    if not pkg_dir.is_dir():
        print(f"Каталог пакета не найден: {pkg_dir}", file=sys.stderr)
        return 1
    pkg_json = pkg_dir / "package.json"
    if not pkg_json.is_file():
        print(f"Нет package.json в {pkg_dir}", file=sys.stderr)
        return 1

    if not skip_build:
        print(f"\n=== [{name}] Сборка в {pkg_dir} ===")
        if run_stream(["yarn", "workspace", json.loads(pkg_json.read_text(encoding="utf-8"))["name"], "build"], cwd=PROJECT_ROOT) != 0:
            # fallback: npm run build in package dir
            if run_stream(["npm", "run", "build"], cwd=pkg_dir) != 0:
                return 1

    if no_publish:
        print(f"=== [{name}] Готово (без публикации) ===")
        return 0

    url = os.environ.get("NPM_REGISTRY_URL", "").strip()
    user, password = nexus_credentials()
    if not url or not user or not password:
        if not ENV_FILE.exists():
            hint_create_env()
        else:
            print(
                "Для публикации нужны NPM_REGISTRY_URL (конфиг) и "
                f"NEXUS_PASSWORD в {ENV_FILE}",
                file=sys.stderr,
            )
        return 1

    original = None
    try:
        print(f"=== [{name}] Публикация как {publish_name} в {url} ===")
        original = prepare_package_json(pkg_json, publish_name)
        env = os.environ.copy()
        # Nexus npm hosted accepts basic auth via npm config
        cmd = [
            "npm",
            "publish",
            "--registry",
            url,
            "--access",
            "restricted",
            "--//" + url.split("://", 1)[-1].rstrip("/") + "/:_auth="
            + __import__("base64").b64encode(f"{user}:{password}".encode()).decode(),
        ]
        if run_stream(cmd, cwd=pkg_dir, env=env) != 0:
            return 1
        print(f"=== [{name}] Опубликовано как {publish_name} ===")
        return 0
    finally:
        if original is not None:
            pkg_json.write_text(original, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Сборка и публикация npm-пакетов в Nexus")
    parser.add_argument("-p", "--package", help="Имя пакета из конфига (ключ в npm.packages)")
    parser.add_argument("-n", "--no-publish", action="store_true", help="Только build, без npm publish")
    parser.add_argument("--skip-build", action="store_true", help="Не собирать, только publish")
    parser.add_argument("--all", action="store_true", help="Собрать/опубликовать все пакеты в порядке зависимостей")
    parser.add_argument("-l", "--list", action="store_true", help="Список пакетов из конфига")
    args = parser.parse_args()

    env_defaults, packages = load_config()
    apply_env_defaults(env_defaults)
    load_local_env()

    if args.list:
        for p in packages:
            path = packages[p].get("path", "?")
            pub = packages[p].get("publishName") or packages[p].get("name", "?")
            print(f"  {p}  ->  {path}  ({pub})")
        return 0

    names: list[str]
    if args.all:
        names = [n for n in PUBLISH_ORDER if n in packages] + [n for n in packages if n not in PUBLISH_ORDER]
    elif args.package:
        names = [args.package]
    else:
        print("Укажите -p <пакет>, --all или -l", file=sys.stderr)
        return 1

    for name in names:
        code = publish_one(name, packages, args.no_publish, args.skip_build)
        if code != 0:
            return code
    return 0


if __name__ == "__main__":
    sys.exit(main())
