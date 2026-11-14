# Submission checklist

Official form: https://binary.so/YIrD8L5  

**Do not submit until the public repository is accessible and a reviewer can run `npm install` + `npm run dev`.**

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Public GitHub repository URL | PENDING | Operator must create/push |
| 2 | Live demo URL | PENDING | Deploy when ready |
| 3 | DESIGN.md one-page | READY | ~500 words; hiring-focused |
| 4 | README completeness | READY | Setup, stack, limits |
| 5 | `.env.example` complete | READY | Keys empty |
| 6 | `npm install` | VERIFY | Run on clean machine |
| 7 | `npm run dev` without API keys | VERIFY | Startup must succeed |
| 8 | Golden evaluation results | READY | See `reports/final/` after `npm run eval` |
| 9 | Security verification | READY | Tests + audit notes |
| 10 | Performance smoke | READY | `npm run perf:smoke` |
| 11 | Demo video URL | PENDING | Record via DEMO_SCRIPT.md |
| 12 | Application form submitted | NOT SUBMITTED | Requires explicit authorization |

## Placeholders (fill when real)

```
GITHUB_URL=
LIVE_URL=
DEMO_VIDEO_URL=
```

## Pre-submit commands

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run eval
npm run perf:smoke
npm run security:audit
```
