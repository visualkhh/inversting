import { Chart } from '../chart/Chart';
import { StockLoader, Interval } from './StockLoader';
/*
📊 obv (On-Balance Volume)
이게 살짝 생소할 수 있는데, 핵심 지표임.
개념
가격 움직임에 거래량을 누적한 값
“돈이 들어오고 있냐, 빠져나가고 있냐”를 보는 용도
계산 방식 (개념적으로)
오늘 종가 > 어제 종가 → obv += 오늘 거래량
오늘 종가 < 어제 종가 → obv -= 오늘 거래량
같으면 → 변화 없음
👉 가격보다 수급을 먼저 보려고 쓰는 지표야.
🧠 왜 obv가 중요하냐면
가격은 횡보인데
OBV는 계속 상승 👉 큰손 매집 중
반대로
가격은 오르는데
OBV는 빠짐 👉 힘 없는 상승 (개미만 사고 있음)
그래서
“가격은 거짓말할 수 있어도 거래량은 거짓말 못 한다”
이런 말 나오는 거임.
 */
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
  : [broadcomTicker, micronTicker,samsungTicker, skhynixTicker];

// ---- 간단 계량/진단 헬퍼 ----
const getSortedDates = (dataMap: Map<string, any[]>): string[] => {
  const s = new Set<string>();
  dataMap.forEach(arr => arr.forEach(d => s.add(d.timestamp)));
  return Array.from(s).sort();
};

const buildPriceMap = (data: any[]): Map<string, number> => {
  const m = new Map<string, number>();
  data.forEach(d => m.set(d.timestamp, d.close));
  return m;
};

const computeReturns = (dates: string[], priceMap: Map<string, number>): number[] => {
  const ret: number[] = new Array(dates.length).fill(NaN);
  for (let i = 1; i < dates.length; i++) {
    const p0 = priceMap.get(dates[i - 1]);
    const p1 = priceMap.get(dates[i]);
    if (p0 !== undefined && p1 !== undefined && p0 > 0) {
      ret[i] = (p1 - p0) / p0;
    }
  }
  return ret;
};

const rollingMean = (arr: number[], endIdx: number, win: number): number => {
  let sum = 0, cnt = 0;
  for (let i = endIdx - win + 1; i <= endIdx; i++) {
    const v = arr[i];
    if (!isNaN(v)) { sum += v; cnt++; }
  }
  return cnt > 0 ? sum / cnt : NaN;
};

const rollingStd = (arr: number[], endIdx: number, win: number): number => {
  const mean = rollingMean(arr, endIdx, win);
  if (isNaN(mean)) return NaN;
  let s = 0, cnt = 0;
  for (let i = endIdx - win + 1; i <= endIdx; i++) {
    const v = arr[i];
    if (!isNaN(v)) { s += Math.pow(v - mean, 2); cnt++; }
  }
  return cnt > 1 ? Math.sqrt(s / (cnt - 1)) : NaN;
};

const rollingCorr = (a: number[], b: number[], endIdx: number, win: number): number => {
  const xs: number[] = []; const ys: number[] = [];
  for (let i = endIdx - win + 1; i <= endIdx; i++) {
    const x = a[i]; const y = b[i];
    if (!isNaN(x) && !isNaN(y)) { xs.push(x); ys.push(y); }
  }
  const n = xs.length;
  if (n < 3) return NaN;
  const meanX = xs.reduce((p,c)=>p+c,0)/n;
  const meanY = ys.reduce((p,c)=>p+c,0)/n;
  let num=0, dx=0, dy=0;
  for (let i=0;i<n;i++) { const xx=xs[i]-meanX; const yy=ys[i]-meanY; num+=xx*yy; dx+=xx*xx; dy+=yy*yy; }
  return dx>0 && dy>0 ? num/Math.sqrt(dx*dy) : NaN;
};

// 간단 OLS (작은 피처수용) - 정상방정식 + Gauss-Jordan
const ols = (X: number[][], y: number[]): number[] | null => {
  const rows = X.length; if (rows === 0) return null;
  const cols = X[0].length;
  // A = X^T X, b = X^T y
  const A = Array.from({length: cols}, () => new Array(cols).fill(0));
  const b = new Array(cols).fill(0);
  for (let r=0;r<rows;r++) {
    const xr = X[r]; const yr = y[r];
    for (let i=0;i<cols;i++) {
      b[i] += xr[i]*yr;
      for (let j=0;j<cols;j++) A[i][j] += xr[i]*xr[j];
    }
  }
  // Augment A|b
  for (let i=0;i<cols;i++) A[i].push(b[i]);
  // Gauss-Jordan
  for (let i=0;i<cols;i++) {
    // pivot
    let piv = i; while (piv<cols && Math.abs(A[piv][i])<1e-12) piv++;
    if (piv===cols) return null;
    if (piv!==i) [A[piv],A[i]]=[A[i],A[piv]];
    const div = A[i][i]; for (let j=i;j<=cols;j++) A[i][j]/=div;
    for (let r=0;r<cols;r++) if (r!==i) {
      const f = A[r][i];
      for (let c=i;c<=cols;c++) A[r][c]-=f*A[i][c];
    }
  }
  return A.map(row=>row[cols]);
};

async function main() {
  // 날짜 범위 지정 방식
  const from = '2025-09-01';
  const to = '2025-12-16';
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
  
  // 이벤트 컬러
  const earningsColor = '#022fc5'; // 실적발표 (빨강)
  const nfpColor = '#5cb85c'; // NFP/고용 (초록)
  const fomcColor = '#b10606'; // FOMC/금리 (진빨강)
  const rateCutColor = '#f0ad4e'; // 금리인상/기타 (주황)

  // ====== 2025년 기업 실적발표 이벤트 ======
  const earningsEvents: { [key: string]: Array<{ title: string; timestamp: string; color: string }> } = {
    // 브로드컴 (AVGO)
    // 'AVGO': [
    //   { title: 'AVGO FY25 Q4', timestamp: '2025-12-11', color: earningsColor },
    // ],
    // // 엔비디아 (NVDA)
    // 'NVDA': [
    //   { title: 'NVDA FY25 Q4', timestamp: '2025-02-26', color: earningsColor },
    //   { title: 'NVDA FY26 Q1', timestamp: '2025-05-28', color: earningsColor },
    //   { title: 'NVDA FY26 Q2', timestamp: '2025-08-27', color: earningsColor },
    // ],
    // // 인텔 (INTC) - 1·4·7·10월 말 패턴
    // 'INTC': [
    //   { title: 'INTC 2025 Q4', timestamp: '2025-01-31', color: earningsColor },
    //   { title: 'INTC 2025 Q1', timestamp: '2025-04-30', color: earningsColor },
    //   { title: 'INTC 2025 Q2', timestamp: '2025-07-31', color: earningsColor },
    //   { title: 'INTC 2025 Q3', timestamp: '2025-10-31', color: earningsColor },
    // ],
    // // AMD - 1·4·7·10월 말 패턴
    // 'AMD': [
    //   { title: 'AMD 2025 Q4', timestamp: '2025-01-31', color: earningsColor },
    //   { title: 'AMD 2025 Q1', timestamp: '2025-04-30', color: earningsColor },
    //   { title: 'AMD 2025 Q2', timestamp: '2025-07-31', color: earningsColor },
    //   { title: 'AMD 2025 Q3', timestamp: '2025-10-31', color: earningsColor },
    // ],
    // 마이크론 (MU) - 회계연도 8월말 기준, 6월/9월 말
    'MU': [
      { title: 'MU FY25 Q3', timestamp: '2025-09-24', color: earningsColor },
      { title: 'MU FY25 Q4', timestamp: '2025-12-18', color: earningsColor },
    ],
    // 오라클 (ORCL) - 회계연도 5월말 기준, 3·6·9·12월 중순
    // 'ORCL': [
    //   { title: 'ORCL FY25 Q3', timestamp: '2025-03-15', color: earningsColor },
    //   { title: 'ORCL FY25 Q4', timestamp: '2025-06-15', color: earningsColor },
    //   { title: 'ORCL FY26 Q1', timestamp: '2025-09-15', color: earningsColor },
    //   { title: 'ORCL FY26 Q2', timestamp: '2025-12-15', color: earningsColor },
    // ],
    // TSMC (TSM) - 4월/7월/10월 중순
    // '2330.TW': [
    //   { title: 'TSMC 2025 Q1', timestamp: '2025-04-18', color: earningsColor },
    //   { title: 'TSMC 2025 Q2', timestamp: '2025-07-18', color: earningsColor },
    //   { title: 'TSMC 2025 Q3', timestamp: '2025-10-17', color: earningsColor },
    // ],
    // // 삼성전자 - 1월/4월/7월 말
    // '005930.KS': [
    //   { title: 'Samsung 2024 Q4', timestamp: '2025-01-31', color: earningsColor },
    //   { title: 'Samsung 2025 Q1', timestamp: '2025-04-30', color: earningsColor },
    //   { title: 'Samsung 2025 Q2', timestamp: '2025-07-30', color: earningsColor },
    // ],
    // // SK하이닉스 - 1월/4월/7월 말
    // '000660.KS': [
    //   { title: 'SK Hynix 2024 Q4', timestamp: '2025-01-31', color: earningsColor },
    //   { title: 'SK Hynix 2025 Q1', timestamp: '2025-04-30', color: earningsColor },
    //   { title: 'SK Hynix 2025 Q2', timestamp: '2025-07-30', color: earningsColor },
    // ],
  };

  // 현재 심볼의 실적발표 이벤트만 수집
  const symbolEarningsEvents: Array<{ title: string; timestamp: string; color: string }> = [];
  symbols.forEach(sym => {
    if (earningsEvents[sym]) {
      symbolEarningsEvents.push(...earningsEvents[sym]);
    }
  });
  
  // ====== 2024~2025년 거시경제 이벤트 ======
  
  // 2024년 금리 인하 이벤트
  const rateCutEvents = [
    { title: '금리 인하(-25bp)', timestamp: '2025-12-11', color: rateCutColor },
  ];

  const events = [...rateCutEvents, ...symbolEarningsEvents];
  const eventDateSet = new Set(events.map(e => e.timestamp));

  // ---------- 계량/진단: 모멘텀+변동성+이벤트 회귀, 롤링 상관, 레짐 ----------
  const dates = getSortedDates(dateOnlyDataMap);
  const priceMapBySym = new Map<string, Map<string, number>>();
  const returnsBySym = new Map<string, number[]>();
  symbols.forEach(sym => {
    const arr = dateOnlyDataMap.get(sym) || [];
    const pm = buildPriceMap(arr);
    priceMapBySym.set(sym, pm);
    returnsBySym.set(sym, computeReturns(dates, pm));
  });

  // 회귀: 특징 = [bias, momentum5, vol10, eventDummy], 타깃 = 다음날 수익률
  /**
   * 회귀 결과 (mom5·vol10·event → 다음날 수익률)
   *
   * 공통적으로 mom5 베타가 모두 음수: 최근 5일 수익이 높을수록 다음날 수익이 낮아지는 경향(단기 모멘텀 음→역추세/되돌림 성향).
   * vol10 베타도 대부분 음수: 최근 변동성이 높을수록 다음날 수익이 낮아지는 경향(리스크 확장 구간의 수익률 압박).
   * bias는 모두 양수: 전체 기간 평균적으로는 소폭 우상향 드리프트가 있었다는 의미(평균 수준).
   * event 베타는 소폭 음수: 이벤트 날짜가 있으면 다음날 수익률에 약간의 압박이 걸렸음(크긴 작음).
   * 해석: 단기 과열 후 조정(음의 모멘텀), 변동성 확대 구간에서 추가
   */
  console.log('\n[회귀: momentum5 + vol10 + eventDummy -> next return]');
  symbols.forEach(sym => {
    const rets = returnsBySym.get(sym)!;
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 10; i < rets.length - 1; i++) {
      const mom5 = rollingMean(rets, i, 5);
      const vol10 = rollingStd(rets, i, 10);
      const eventDummy = eventDateSet.has(dates[i]) ? 1 : 0;
      if (!isNaN(mom5) && !isNaN(vol10) && !isNaN(rets[i+1])) {
        X.push([1, mom5, vol10, eventDummy]);
        y.push(rets[i+1]);
      }
    }
    const beta = ols(X, y);
    if (beta) {
      const labels = ['bias','mom5','vol10','event'];
      const coeffStr = beta.map((b,idx)=>`${labels[idx]}=${b.toFixed(4)}`).join(', ');
      console.log(` ${sym}: n=${y.length} -> ${coeffStr}`);
    } else {
      console.log(` ${sym}: 데이터 부족으로 회귀 불가`);
    }
  });

  /** 예시
   * [회귀: momentum5 + vol10 + eventDummy -> next return]
   * AVGO: n=39 -> bias=0.0038, mom5=-0.3657, vol10=0.0449, event=-0.0147
   * MU: n=39 -> bias=0.0406, mom5=-0.5134, vol10=-0.6904, event=-0.0268
   * 005930.KS: n=43 -> bias=0.0151, mom5=-0.7501, vol10=-0.3393, event=-0.0107
   * 000660.KS: n=43 -> bias=0.0462, mom5=-0.2965, vol10=-0.8488, event=-0.0543
   *
   * [롤링 상관, window=20, 기준=AVGO]
   * AVGO vs MU: 최근 상관=0.568
   * AVGO vs 005930.KS: 최근 상관=0.209
   * AVGO vs 000660.KS: 최근 상관=0.149
   *
   * [레짐 태그: 최근 vol10 분위수 기반]
   * AVGO: latest vol10=0.0157 regime=LOW (p33=0.0227, p66=0.0415)
   * MU: latest vol10=0.0350 regime=LOW (p33=0.0352, p66=0.0479)
   * 005930.KS: latest vol10=0.0194 regime=LOW (p33=0.0209, p66=0.0321)
   * 000660.KS: latest vol10=0.0322 regime=LOW (p33=0.0357, p66=0.0481)
   *
   * 이 데이터 어떻게 해석하는지 알려줘.
   *
   * Done: 요약 해석 제공
   * 회귀 결과 (mom5·vol10·event → 다음날 수익률)
   *
   * 공통적으로 mom5 베타가 모두 음수: 최근 5일 수익이 높을수록 다음날 수익이 낮아지는 경향(단기 모멘텀 음→역추세/되돌림 성향).
   * vol10 베타도 대부분 음수: 최근 변동성이 높을수록 다음날 수익이 낮아지는 경향(리스크 확장 구간의 수익률 압박).
   * bias는 모두 양수: 전체 기간 평균적으로는 소폭 우상향 드리프트가 있었다는 의미(평균 수준).
   * event 베타는 소폭 음수: 이벤트 날짜가 있으면 다음날 수익률에 약간의 압박이 걸렸음(크긴 작음).
   * 해석: 단기 과열 후 조정(음의 모멘텀), 변동성 확대 구간에서 추가 하락 가능성을 시사. 방향을 예측할 때 “직전 5일 상승이면 다음날은 쉬어갈 확률↑, 변동성 커지면 조심” 정도로 읽을 수 있음.
   * 롤링 상관 (20일 창, 기준 AVGO)
   *
   * AVGO–MU: 0.57 수준 → 동행성이 중간 이상, 같이 움직일 때가 많음.
   * AVGO–005930.KS: 0.21, AVGO–000660.KS: 0.15 → 약한 상관, 동행성 낮음.
   * 포트폴리오 분산 관점: MU는 AVGO와 겹치는 움직임이 더 크고, 삼성/하이닉스는 상관이 낮아 분산 효과가 더 있음.
   * 레짐 (최근 10일 변동성 기준 분위수)
   *
   * 4개 모두 LOW 레짐: 최근 10일 변동성이 과거 구간 대비 낮은 구간. “조용한 시장” 상태로, 돌발 이벤트가 없으면 추세가 이어지기 쉽지만, 새로운 정보가 나오면 변동성 확대 가능성도 염두.
   * 종합 요약
   *
   * 단기 되돌림 성향: 최근 오른 종목일수록 다음날 되밀릴 가능성 시사.
   * 변동성 확대 주의: 변동성 커질 때 수익률이 눌리는 패턴.
   * 현재는 저변동 레짐: 큰 이벤트 전엔 조용할 수 있으나, 이벤트 발생 시 변동성 점프 위험.
   * 상관 구조: AVGO·MU는 동행성이 높고, 삼성/하이닉스는 상대적으로 분산 효과.
   *
   * 이 데이터를 활용하려면?
   *
   * 단기 트레이딩: 최근 5일 수익이 크게 오른 종목은 익일 롱 진입을 보수적으로, 변동성이 커진 날엔 포지션 축소/헤지 고려.
   * 포트 구성: AVGO와 MU를 같이 들 때는 중복 리스크를 인지, 분산을 원하면 삼성/하이닉스를 섞는 편이 상관 측면에서 유리.
   */


  // 롤링 상관 (기준: 첫 번째 심볼) 동행성 같이 방향으로 움직일 활률
  /**
   * 롤링 상관 (20일 창, 기준 AVGO)
   * AVGO–MU: 0.57 수준 → 동행성이 중간 이상, 같이 움직일 때가 많음.
   * AVGO–005930.KS: 0.21, AVGO–000660.KS: 0.15 → 약한 상관, 동행성 낮음.
   * 포트폴리오 분산 관점: MU는 AVGO와 겹치는 움직임이 더 크고, 삼성/하이닉스는 상관이 낮아 분산 효과가 더 있음.
   */
  if (symbols.length > 1) {
    const base = symbols[0];
    const baseR = returnsBySym.get(base)!;
    const win = 20;
    console.log(`\n[롤링 상관, window=${win}, 기준=${base}]`);
    symbols.slice(1).forEach(sym => {
      const r = returnsBySym.get(sym)!;
      let lastCorr = NaN;
      for (let i = win; i < dates.length; i++) {
        const c = rollingCorr(baseR, r, i, win);
        if (!isNaN(c)) lastCorr = c;
      }
      console.log(` ${base} vs ${sym}: 최근 상관=${isNaN(lastCorr)?'n/a':lastCorr.toFixed(3)}`);
    });
  }

  // 레짐 태깅: 최근 vol10 기준 분위수로 low/mid/high
  /**
   * 레짐 (최근 10일 변동성 기준 분위수)
   * 4개 모두 LOW 레짐: 최근 10일 변동성이 과거 구간 대비 낮은 구간. “조용한 시장” 상태로, 돌발 이벤트가 없으면 추세가 이어지기 쉽지만, 새로운 정보가 나오면 변동성 확대 가능성도 염두.
   */
  console.log('\n[레짐 태그: 최근 vol10 분위수 기반]');
  symbols.forEach(sym => {
    const rets = returnsBySym.get(sym)!;
    const volSeries: number[] = [];
    for (let i = 10; i < rets.length; i++) {
      const v = rollingStd(rets, i, 10);
      if (!isNaN(v)) volSeries.push(v);
    }
    if (volSeries.length === 0) {
      console.log(` ${sym}: vol 데이터 없음`);
      return;
    }
    const sorted = [...volSeries].sort((a,b)=>a-b);
    const pct = (p:number)=>sorted[Math.floor(p*(sorted.length-1))];
    const p33 = pct(0.33); const p66 = pct(0.66);
    const latestVol = volSeries[volSeries.length-1];
    const regime = latestVol < p33 ? 'LOW' : latestVol < p66 ? 'MID' : 'HIGH';
    console.log(` ${sym}: latest vol10=${latestVol.toFixed(4)} regime=${regime} (p33=${p33.toFixed(4)}, p66=${p66.toFixed(4)})`);
  });

  overlayChart.drawOverlayChart({
    dataMap: dateOnlyDataMap,
    eventPoint: events,
    filenameSuffix: '_overlay_chart.png',
    imageHeight: 1000,
    imageWidth: 2000,
    lineWidth: 1,
    averageLineWidth: 2,
    // eventLineWidth: 7,
    eventLabelSize: 15,
    fontSize: 20,
    xAxisLabelSize: 10,
    yAxisLabelSize: 10,
    legendFontSize: 30,
    xAxisWidth: 50,  // X축 영역 폭 (하단)
    yAxisWidth: 50,  // Y축 영역 폭 (좌측)
    showAverage: true,
    // showVolume: true,
    // showObv: true,
    // smoothCurve: true
  });

  console.log(`Chart saved: dist/chart/${chartName}_overlay_chart.png`);
}

main().catch(console.error);
