import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { StockLoader } from '../stock/StockLoader';

// 기본 심볼 목록 (stock-diff와 동일)
const symbols = ['AVGO', 'MU', '005930.KS', '000660.KS'];

// 날짜 범위 (stock-diff와 동일)
const from = '2025-01-01';
const to = '2025-12-16';

async function main() {
  const loader = new StockLoader({ from, to, interval: '1d' });
  console.log(`Exporting symbols: ${symbols.join(', ')} (${from} ~ ${to})`);

  // 실제 주식 데이터 및 이벤트 가져오기 (chart + quoteSummary 모두)
  const dataMap = await loader.loadStocks(symbols);
  const events = await loader.loadAllEvents(symbols);
  events.push({timestamp: '2025-09-23 23:00:00', color:'#FF0000', label: 'Micron Technology Q4'})
  // events.sort((a, b) => (new Date(a.timestamp).getTime() < new Date(b.timestamp).getTime() ? -1 : new Date(a.timestamp).getTime() > new Date(b.timestamp).getTime() ? 1 : 0));
  const obj: any = { dataMap: {}, events };
  dataMap.forEach((arr, key) => {
    obj.dataMap[key] = arr;
  });

  const outDir = path.resolve(__dirname, 'data');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'chart-data.json');
  writeFileSync(outPath, JSON.stringify(obj, null, 2), 'utf-8');
  console.log(`Saved: ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
