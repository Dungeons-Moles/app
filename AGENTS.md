# Repository Guidelines

This repository hosts the React Native + Expo codebase for Dungeons & Moles. Use this guide to keep contributions consistent and easy to review.

## Project Structure & Module Organization
- `src/` holds application code: `components/`, `contexts/`, `game/`, `navigation/`, `screens/`, `types/`, `utils/`, and `polyfills.ts`.
- Entry points and config live at the root: `App.tsx`, `index.ts`, `app.json`, `babel.config.js`, `tsconfig.json`.
- Tests are in `__tests__/` and alongside source when needed.
- Product specs and plans live in `specs/001-pve-dungeon-crawler/` (see `spec.md`, `plan.md`, `tasks.md`).
- Static assets are in `assets/`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm start`: start Expo dev server.
- `npm run android` / `npm run ios`: run a development build on device/emulator.
- `npm run web`: run Expo on web.
- `npm run lint` / `npm run lint:fix`: lint TypeScript/TSX with ESLint.
- `npm run format`: format `src/**/*.ts(x)` with Prettier.
- `npm run typecheck`: TypeScript type checking.
- `npm test`, `npm run test:watch`, `npm run test:coverage`, `npm run test:ci`: run Jest tests.

## Coding Style & Naming Conventions
- TypeScript is required for app code; keep new files in `src/` as `.ts`/`.tsx`.
- Prettier enforces 2-space indentation, single quotes, semicolons, and `printWidth: 100`.
- ESLint runs with `@typescript-eslint`, `react`, and `react-hooks` rules.
- Test files should be named `*.test.ts` to match Jest config.
- Use `@/` alias for `src/` imports (e.g., `@/game/engine`).

## Testing Guidelines
- Jest uses `ts-jest` and looks in `__tests__/` and `src/`.
- Coverage is collected from `src/game/**/*.ts` by default; add tests there when touching game logic.
- Prefer small, deterministic unit tests; avoid network or device-only dependencies.

## Commit & Pull Request Guidelines
- Commit messages follow a short prefix style seen in history: `feat(scope): ...`, `fix: ...`, `docs: ...`, or `merge: ...`.
- Keep summaries imperative and include task references when relevant (e.g., `T134`).
- PRs should include a concise description, testing notes (commands run), and screenshots for UI changes.
- Update `specs/001-pve-dungeon-crawler/tasks.md` when completing planned tasks.
