---
name: orchestrator-handoff
description: >
  Делит задачу graphic-walker-cube между gw-implementer (Composer 2.5) и
  gw-architect (Grok 4.7 high). Вызывай перед правкой packages, публичного
  API, contract.ts или тестов библиотеки.
---

# Передача задачи (graphic-walker-cube)

## Класс

- Простая: компонент, тест, адаптер DuckDB без нового export → `gw-implementer`.
- Архитектура: `index.tsx`, `exports`, `contract.ts`, формула, которую видит хост → `gw-architect`.

## Шаблон

```
Цель:
Разрешённые пути:
Запрещённые пути: packages/graphic-walker/src/index.tsx, packages/graphic-walker-embed/src/contract.ts, exports
Правила: library-api
Критерий готовности:
Не делать: ломающее изменение публичного типа, перенос логики в playground
```
