# Chart Application
cd /Users/hyunhakim/workspace/visualkhh/source/inversting && pnpm rebuild canvas
node --version && pnpm remove canvas && pnpm add -D canvas
cd /Users/hyunhakim/workspace/visualkhh/source/inversting/apps/chart && pnpm rebuild canvas
cd /Users/hyunhakim/workspace/visualkhh/source/inversting && rm -rf node_modules && pnpm install
cd /Users/hyunhakim/workspace/visualkhh/source/inversting/node_modules/.pnpm/canvas@3.1.2/node_modules/canvas && npm run install