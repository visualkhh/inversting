import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { StockLoader } from '../stock/StockLoader';

// 기본 심볼 목록 (stock-diff와 동일)
const symbols = ['AVGO', 'MU', '005930.KS', '000660.KS'];

// 날짜 범위 (stock-diff와 동일)
const from = '2025-09-01';
const to = '2025-12-16';

// 웹 이벤트 샘플 (필요에 맞게 수정 가능)
const events = [
  { timestamp: '2025-09-15 09:30:00', label: 'Event A', color: '#FF0000' },
  { timestamp: '2025-10-15 09:30:00', label: 'Event B', color: '#0000FF' },
  { timestamp: '2025-11-15 09:30:00', label: 'Event C', color: '#00AA00' },
];

async function main() {
  const loader = new StockLoader({ from, to, interval: '1d' });
  console.log(`Exporting symbols: ${symbols.join(', ')} (${from} ~ ${to})`);

  const dataMap = await loader.loadStocks(symbols);
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
