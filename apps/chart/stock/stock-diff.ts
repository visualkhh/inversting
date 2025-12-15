import { Chart } from '../chart/Chart';
import { StockLoader, Interval } from './StockLoader';

// 비교할 주식 티커 (파라미터로 받을 수 있도록)
const symbols: string[] = process.argv.slice(2).length > 0 
  ? process.argv.slice(2) 
  : ['MU', '005930.KS','000660.KS'];

async function main() {
  // 날짜 범위 지정 방식
  const loader = new StockLoader({ 
    from: '2025-12-01',
    to: '2025-12-13',
    interval: '1d' 
  });
  
  console.log(`Comparing stocks: ${symbols.join(', ')} (2024-12-01 ~ 2024-12-15)`);
  
  const dataMap = await loader.loadStocks(symbols);

  // 타임스탬프에서 날짜만 추출 (시간 제거)
  const dateOnlyDataMap = new Map<string, any[]>();
  dataMap.forEach((data, symbol) => {
    const dateOnlyData = data.map(d => ({
      ...d,
      timestamp: d.timestamp.split(' ')[0] // 'YYYY-MM-DD HH:MM:SS' -> 'YYYY-MM-DD'
    }));
    dateOnlyDataMap.set(symbol, dateOnlyData);
  });

  // 차트 그리기
  const chartName = symbols.join('_vs_');
  const overlayChart = new Chart(chartName);
  overlayChart.drawOverlayChart(dateOnlyDataMap, '_overlay_chart.png', true); // 평균선 표시 안 함

  console.log(`Chart saved: dist/chart/${chartName}_overlay_chart.png`);
}

main().catch(console.error);
