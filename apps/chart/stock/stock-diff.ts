import { Chart } from '../chart/Chart';
import { StockLoader, Interval } from './StockLoader';

const broadcomTicker = 'AVGO';
const samsungTicker = '005930.KS';
const intelTicker = 'INTC';
const amdTicker = 'AMD';
const micronTicker = 'MU';
const oracleTicker = 'ORCL';
const nvidiaTicker = 'NVDA';
const tsmcTicker = '2330.TW';
const skhynixTicker = '000660.KS';
// 비교할 주식 티커 (파라미터로 받을 수 있도록)
const symbols: string[] = process.argv.slice(2).length > 0 
  ? process.argv.slice(2) 
  : [oracleTicker, samsungTicker,  skhynixTicker  ];

async function main() {
  // 날짜 범위 지정 방식
  const from = '2025-10-01';
  const to = '2025-12-31';
  const loader = new StockLoader({ 
    from,
    to,
    interval: '1d' 
  });
  
  console.log(`Comparing stocks: ${symbols.join(', ')} (${from} ~ ${to})`);
  
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
  // 고해상도 렌더링을 위해 dpiScale 적용 (예: 3)
  const overlayChart = new Chart(chartName, 1200, 600, 50, 3);
  // 2025 이벤트 마킹 (CPI/NFP/FOMC)
  const cpiColor = '#5bc0de';
  const nfpColor = '#5cb85c';
  const fomcColor = '#d9534f';
  const rateCutColor = '#f0ad4e';

  const cpiEvents = [
    // { title: '1월 CPI', timestamp: '2025-02-13', color: cpiColor },
    // { title: '2월 CPI', timestamp: '2025-03-12', color: cpiColor },
    // { title: '3월 CPI', timestamp: '2025-04-10', color: cpiColor },
    // { title: '4월 CPI', timestamp: '2025-05-14', color: cpiColor },
    // { title: '5월 CPI', timestamp: '2025-06-11', color: cpiColor },
    // { title: '6월 CPI', timestamp: '2025-07-16', color: cpiColor },
    // { title: '7월 CPI', timestamp: '2025-08-13', color: cpiColor },
    // { title: '8월 CPI', timestamp: '2025-09-11', color: cpiColor },
    // { title: '9월 CPI', timestamp: '2025-10-15', color: cpiColor },
    // { title: '10월 CPI', timestamp: '2025-11-13', color: cpiColor },
    // { title: '11월 CPI', timestamp: '2025-12-10', color: cpiColor },
  ];

  const nfpEvents = [
    // { title: '1월 고용(NFP)', timestamp: '2025-01-03', color: nfpColor },
    // { title: '2월 고용(NFP)', timestamp: '2025-02-07', color: nfpColor },
    // { title: '3월 고용(NFP)', timestamp: '2025-03-07', color: nfpColor },
    // { title: '4월 고용(NFP)', timestamp: '2025-04-04', color: nfpColor },
    // { title: '5월 고용(NFP)', timestamp: '2025-05-02', color: nfpColor },
    // { title: '6월 고용(NFP)', timestamp: '2025-06-06', color: nfpColor },
    // { title: '7월 고용(NFP)', timestamp: '2025-07-03', color: nfpColor },
    // { title: '8월 고용(NFP)', timestamp: '2025-08-01', color: nfpColor },
    // { title: '9월 고용(NFP)', timestamp: '2025-09-05', color: nfpColor },
    // { title: '10월 고용(NFP)', timestamp: '2025-10-03', color: nfpColor },
    // { title: '11월 고용(NFP)', timestamp: '2025-11-07', color: nfpColor },
    // { title: '12월 고용(NFP)', timestamp: '2025-12-05', color: nfpColor },
  ];

  const fomcEvents = [
    // { title: '1월 FOMC', timestamp: '2025-01-29', color: fomcColor },
    // { title: '3월 FOMC', timestamp: '2025-03-19', color: fomcColor },
    // { title: '5월 FOMC', timestamp: '2025-05-07', color: fomcColor },
    // { title: '6월 FOMC', timestamp: '2025-06-18', color: fomcColor },
    // { title: '7월 FOMC', timestamp: '2025-07-30', color: fomcColor },
    // { title: '9월 FOMC', timestamp: '2025-09-17', color: fomcColor },
    // { title: '11월 FOMC', timestamp: '2025-11-05', color: fomcColor },
    // { title: '12월 FOMC', timestamp: '2025-12-17', color: fomcColor },
  ];

  const rateCutEvents = [
    { title: '금리 인하(-50bp)', timestamp: '2024-09-18', color: rateCutColor },
    { title: '금리 인하(-25bp)', timestamp: '2024-11-07', color: rateCutColor },
    { title: '금리 인하(-25bp)', timestamp: '2024-12-18', color: rateCutColor },
    { title: '금리 인하(-25bp)', timestamp: '2025-12-10', color: rateCutColor },
  ];

  const events = [...cpiEvents, ...nfpEvents, ...fomcEvents, ...rateCutEvents];

  overlayChart.drawOverlayChart({
    dataMap: dateOnlyDataMap,
    eventPoint: events,
    filenameSuffix: '_overlay_chart.png',
    showAverage: true
  });

  console.log(`Chart saved: dist/chart/${chartName}_overlay_chart.png`);
}

main().catch(console.error);
