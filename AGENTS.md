# AGENTS — graphic-walker-cube

Форк библиотеки визуализации. Текущий чат — оркестратор.

Публичная поверхность не отдаётся Composer: `packages/graphic-walker/src/index.tsx`, `package.json` `exports`, `packages/graphic-walker-embed/src/contract.ts`.

## Роли

| Субагент | Модель | Когда |
|----------|--------|--------|
| `gw-implementer` | Composer 2.5 | Внутренняя правка компонента, Jest, Playwright, DuckDB-адаптер без смены экспорта |
| `gw-architect` | Grok 4.7 high | Публичный API, контракт embed, семантика вычисления, которая меняет числа на графике |

Правило границ: `.cursor/rules/library-api.mdc`. Шаблон: `.cursor/skills/orchestrator-handoff/SKILL.md`.

Коммит и push — только по явной просьбе. Репозиторий библиотечный: не превращать пакет в приложение.
