import {OverlayStockChart, type EventMarker, type CommonEvents, type XPointEvent, type EventBase, LineType, type TickerData, type ChartKeyData, isChartKeyData, type ShowAverageType, type ShowAverageItem} from './OverlayStockChart';

// 새로운 ChartData 타입 (OverlayStockChart에서 사용)
type ChartData = {
  x: number;
  yOpen?: number | null;
  yHigh?: number | null;
  yLow?: number | null;
  y: number;
};
const statusTextEl = document.getElementById('status-text');
const toggleEventsEl = document.getElementById('toggle-events') as HTMLInputElement | null;
const toggleCandlesEl = document.getElementById('toggle-candles') as HTMLInputElement | null;
const toggleGapsEl = document.getElementById('toggle-gaps') as HTMLInputElement | null;
const toggleVolumeEl = document.getElementById('toggle-volume') as HTMLInputElement | null;
const toggleOBVEl = document.getElementById('toggle-obv') as HTMLInputElement | null;
const lineModeRadios = document.querySelectorAll('input[name="line-mode"]') as NodeListOf<HTMLInputElement>;
const toggleAverageEl = document.getElementById('toggle-average') as HTMLInputElement | null;
const toggleMA5El = document.getElementById('toggle-ma5') as HTMLInputElement | null;
const toggleMA10El = document.getElementById('toggle-ma10') as HTMLInputElement | null;
const toggleMA20El = document.getElementById('toggle-ma20') as HTMLInputElement | null;
const tickerMA5El = document.getElementById('ticker-ma5') as HTMLInputElement | null;
const tickerMA10El = document.getElementById('ticker-ma10') as HTMLInputElement | null;
const tickerMA20El = document.getElementById('ticker-ma20') as HTMLInputElement | null;
const toggleHideValuesEl = document.getElementById('toggle-hide-values') as HTMLInputElement | null;
const toggleDailyGroupEl = document.getElementById('toggle-daily-group') as HTMLInputElement | null;
const toggleHideLinesEl = document.getElementById('toggle-hide-lines') as HTMLInputElement | null;
const toggleShowGridEl = document.getElementById('toggle-show-grid') as HTMLInputElement | null;
const toggleShowPointsEl = document.getElementById('toggle-show-points') as HTMLInputElement | null;
const toggleNormalizeEl = document.getElementById('toggle-normalize') as HTMLInputElement | null;
const rangeMinEl = document.getElementById('range-min') as HTMLInputElement | null;
const rangeMaxEl = document.getElementById('range-max') as HTMLInputElement | null;
const rangeSliderRangeEl = document.getElementById('range-slider-range') as HTMLElement | null;
const rangeValuesEl = document.getElementById('range-values') as HTMLElement | null;
const canvas = document.getElementById('chart') as HTMLCanvasElement | null;

if (!canvas) {
  throw new Error('Canvas element #chart not found');
}

const ctx = canvas.getContext('2d')!;
if (!ctx) {
  throw new Error('Canvas rendering context is not available');
}

function setStatus(text: string) {
  if (statusTextEl) statusTextEl.textContent = text;
}

// 기존 데이터 타입 (파일에서 로드되는 형식)
type OldChartData = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  obv?: number;
};

// 기존 데이터를 새 형식으로 변환
function convertToNewFormat(oldData: OldChartData[]): { [key: string]: ChartKeyData } {
  const result: { [key: string]: ChartKeyData } = {
    price: { 
      datas: []
    },
    volume: { 
      datas: []
    },
    obv: { 
      datas: []
    }
  };
  
  oldData.forEach(d => {
    const timestamp = new Date(d.timestamp).getTime();
    
    // Price 데이터
    if (d.close !== null && d.close !== undefined) {
      result.price.datas.push({
        x: timestamp,
        yOpen: d.open,
        yHigh: d.high,
        yLow: d.low,
        y: d.close
      });
    }
    
    // Volume 데이터
    if (d.volume !== null && d.volume !== undefined) {
      result.volume.datas.push({
        x: timestamp,
        // yOpen: d.volume-(d.volume/6),
        // yHigh: d.volume+(d.volume/6),
        // yLow: d.volume-(d.volume/6),
        y: d.volume
      });
    }
    
    // OBV 데이터
    if (d.obv !== null && d.obv !== undefined) {
      result.obv.datas.push({
        x: timestamp,
        // yOpen: d.obv-(d.obv/6),
        // yHigh: d.obv+(d.obv/6),
        // yLow: d.obv-(d.obv/6),
        y: d.obv
      });
    }
  });
  
  return result;
}

// 일자별 그룹화 함수
function groupDataByDay(dataMap: Map<string, TickerData>): Map<string, TickerData> {
  const groupedMap = new Map<string, TickerData>();
  
  dataMap.forEach((value, symbol) => {
    const groupedData: { [key: string]: ChartKeyData } = {};
    
    // 타입 가드를 사용하여 단일 ChartKeyData인지 확인
    const dataObj: { [key: string]: ChartKeyData } = isChartKeyData(value.data)
      ? { default: value.data } 
      : value.data;
    
    // 각 데이터 타입별로 일자별 그룹화
    Object.keys(dataObj).forEach(dataType => {
      const dailyMap = new Map<number, ChartData>();
      const chartDataObj: ChartKeyData = dataObj[dataType];
      
      chartDataObj.datas.forEach((d: ChartData) => {
        const date = new Date(d.x);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
        const dayKey = dayStart.getTime();
        
        if (!dailyMap.has(dayKey)) {
          dailyMap.set(dayKey, {
            x: dayKey,
            yOpen: d.yOpen,
            yHigh: d.yHigh,
            yLow: d.yLow,
            y: d.y
          });
        } else {
          const existing = dailyMap.get(dayKey)!;
          if (d.yHigh !== undefined && existing.yHigh !== undefined && d.yHigh !== null && existing.yHigh !== null) {
            existing.yHigh = Math.max(existing.yHigh, d.yHigh);
          }
          if (d.yLow !== undefined && existing.yLow !== undefined && d.yLow !== null && existing.yLow !== null) {
            existing.yLow = Math.min(existing.yLow, d.yLow);
          }
          existing.y = d.y; // 마지막 값 사용
          // volume 같은 누적 데이터는 합산
          if (dataType === 'volume') {
            existing.y += d.y;
          }
        }
      });
      
      groupedData[dataType] = { 
        datas: Array.from(dailyMap.values()).sort((a, b) => a.x - b.x),
        events: chartDataObj.events,
        lineMode: chartDataObj.lineMode
      };
    });
    
    groupedMap.set(symbol, { 
      color: value.color, 
      lineMode: value.lineMode,
      movingAverageXwidth: value.movingAverageXwidth, // 티커별 이동평균선 설정 유지
      data: groupedData 
    });
  });
  
  return groupedMap;
}

function makeSampleData(): { dataMap: Map<string, TickerData>; commonEvents: { x?: (XPointEvent & EventBase)[]; chart?: { [key: string]: EventMarker[] } | EventMarker[] } } {
  const symbols = ['AVGO', 'MU', '005930.KS', '000660.KS'];
  const start = new Date('2025-09-01T00:00:00Z').getTime();
  const day = 24 * 60 * 60 * 1000;
  const points = 60;

  const dataMap = new Map<string, TickerData>();
  symbols.forEach((sym, idx) => {
    let price = 100 + idx * 10;
    const priceData: ChartData[] = [];
    const volumeData: ChartData[] = [];
    const obvData: ChartData[] = [];
    let obv = 0;
    
    for (let i = 0; i < points; i++) {
      const noise = (Math.random() - 0.5) * 4;
      const drift = 0.3 * i;
      const close = Math.max(1, price + noise + drift);
      const high = close + Math.random() * 3;
      const low = close - Math.random() * 3;
      const open = (close + low) / 2;
      const volume = Math.floor(Math.random() * 1000000) + 100000;
      const timestamp = start + i * day;
      
      // OBV 계산
      if (i > 0) {
        if (close > price) {
          obv += volume;
        } else if (close < price) {
          obv -= volume;
        }
      }
      
      priceData.push({ x: timestamp, yOpen: open, yHigh: high, yLow: low, y: close });
      volumeData.push({ x: timestamp, y: volume });
      obvData.push({ x: timestamp, y: obv });
      
      price = close;
    }
    
    dataMap.set(sym, { 
      // lineMode: 'line', // 티커별 lineMode 예시
      data: {
        price: { datas: priceData },
        volume: { datas: volumeData },
        obv: { datas: obvData }
      }
    });
  });

  const commonEvents = {
    x: [
      { x: new Date('2025-09-15 09:30:00').getTime(), label: 'Common Event A', color: '#FF0000' },
      { x: new Date('2025-10-15 09:30:00').getTime(), label: 'Common Event B', color: '#0000FF' },
    ],
    chart: {
      price: [
        { x: new Date('2025-11-15 09:30:00').getTime(), label: 'Price Event C', color: '#00AA00' },
        { 
          startX: new Date('2025-09-20 00:00:00').getTime(), 
          endX: new Date('2025-10-05 00:00:00').getTime(), 
          label: 'Earnings Season', 
          color: 'rgba(255, 165, 0, 0.2)' 
        },
      ]
    }
  };

  return { dataMap, commonEvents };
}

async function loadData(): Promise<{ dataMap: Map<string, TickerData>; commonEvents: { x?: (XPointEvent & EventBase)[]; chart?: { [key: string]: EventMarker[] } | EventMarker[] } }> {
  try {
    // 1. 티커 목록 로드
    const tickersResp = await fetch('data/tickers.json');
    if (!tickersResp.ok) throw new Error('No tickers file');
    const tickers: string[] = await tickersResp.json();
    
    if (tickers.length === 0) {
      throw new Error('No tickers found');
    }
    
    setStatus(`Loading ${tickers.length} tickers...`);
    
    // 2. 각 티커별 데이터 및 이벤트 로드
    const map = new Map<string, TickerData>();
    
    const loadPromises = tickers.map(async (ticker) => {
      try {
        // 데이터 로드
        const dataResp = await fetch(`data/${ticker}.json`);
        if (!dataResp.ok) {
          console.warn(`Failed to load ${ticker}.json`);
          return;
        }
        const oldData = await dataResp.json() as OldChartData[];
        const fData = oldData.filter(it => (it.close !== null && it.close !== undefined) || (it.open !== null && it.open !== undefined));
        
        // 새 형식으로 변환
        const newData = convertToNewFormat(fData);
        
        // 티커별 이벤트 로드 (각 chartKey별로)
        for (const chartKey of Object.keys(newData)) {
          try {
            const eventsResp = await fetch(`data/${ticker}_${chartKey}_events.json`);
            if (eventsResp.ok) {
              const rawEvents = await eventsResp.json() as any[];
              // 문자열 timestamp를 숫자로 변환
              newData[chartKey].events = rawEvents.map(event => {
                const converted: any = { ...event };
                // x, startX, endX 등의 timestamp 필드를 숫자로 변환
                if (typeof converted.x === 'string') {
                  converted.x = new Date(converted.x).getTime();
                }
                if (typeof converted.startX === 'string') {
                  converted.startX = new Date(converted.startX).getTime();
                }
                if (typeof converted.endX === 'string') {
                  converted.endX = new Date(converted.endX).getTime();
                }
                // points 배열의 x 값도 변환
                if (converted.points && Array.isArray(converted.points)) {
                  converted.points = converted.points.map((p: any) => ({
                    ...p,
                    x: typeof p.x === 'string' ? new Date(p.x).getTime() : p.x
                  }));
                }
                return converted as EventMarker;
              });
            }
          } catch (err) {
            // 이벤트 파일이 없으면 무시
          }
        }
        
        // chartKey별 lineMode 설정 예시 (obv는 step-to로 설정)
        // if (newData.obv) {
        //   newData.obv.lineMode = 'line';
        //   console.log(`[${ticker}] Setting obv lineMode to 'line'`, newData.obv);
        // }
        
        map.set(ticker, {
          // lineMode: 'step-to', // 티커별 lineMode (선택사항)
          data: newData
        });
      } catch (err) {
        console.warn(`Error loading ${ticker}:`, err);
      }
    });
    
    await Promise.all(loadPromises);
    
    // 3. 데이터에서 실제 존재하는 차트 키 추출
    const chartKeysSet = new Set<string>();
    map.forEach((value) => {
      // 타입 가드를 사용하여 단일 ChartKeyData인지 확인
      const dataObj: { [key: string]: ChartKeyData } = isChartKeyData(value.data)
        ? { default: value.data } 
        : value.data;
      
      Object.keys(dataObj).forEach(key => {
        if (dataObj[key].datas.length > 0) {
          chartKeysSet.add(key);
        }
      });
    });
    const chartKeys = Array.from(chartKeysSet);
    
    // 4. 공통 이벤트 로드
    const commonEvents: { x?: (XPointEvent & EventBase)[]; chart?: { [key: string]: EventMarker[] } | EventMarker[] } = {};
    
    // 4-1. X축 공통 이벤트 로드 (모든 차트에 표시)
    try {
      const xEventsResp = await fetch(`data/x_events.json`);
      if (xEventsResp.ok) {
        const rawEvents = await xEventsResp.json() as any[];
        // 문자열 timestamp를 숫자로 변환
        commonEvents.x = rawEvents.map(event => {
          const converted: any = { ...event };
          if (typeof converted.x === 'string') {
            converted.x = new Date(converted.x).getTime();
          }
          return converted as XPointEvent & EventBase;
        });
        console.log(`Loaded ${commonEvents.x.length} common X events`);
      }
    } catch (err) {
      console.warn(`No x_events.json file`);
    }
    
    // 4-2. 차트별 공통 이벤트 로드 (price_events.json, volume_events.json, obv_events.json)
    const chartEventsMap: { [key: string]: EventMarker[] } = {};
    for (const chartKey of chartKeys) {
      try {
        const eventsResp = await fetch(`data/${chartKey}_events.json`);
        if (eventsResp.ok) {
          const rawEvents = await eventsResp.json() as any[];
          // 문자열 timestamp를 숫자로 변환
          chartEventsMap[chartKey] = rawEvents.map(event => {
            const converted: any = { ...event };
            if (typeof converted.x === 'string') {
              converted.x = new Date(converted.x).getTime();
            }
            if (typeof converted.startX === 'string') {
              converted.startX = new Date(converted.startX).getTime();
            }
            if (typeof converted.endX === 'string') {
              converted.endX = new Date(converted.endX).getTime();
            }
            if (converted.points && Array.isArray(converted.points)) {
              converted.points = converted.points.map((p: any) => ({
                ...p,
                x: typeof p.x === 'string' ? new Date(p.x).getTime() : p.x
              }));
            }
            return converted as EventMarker;
          });
          console.log(`Loaded ${chartEventsMap[chartKey].length} common events for ${chartKey}`);
        }
      } catch (err) {
        console.warn(`No ${chartKey}_events.json file`);
      }
    }
    if (Object.keys(chartEventsMap).length > 0) {
      commonEvents.chart = chartEventsMap;
    }
    
    const totalXEvents = commonEvents.x?.length || 0;
    const totalChartEvents = Array.isArray(commonEvents.chart) 
      ? commonEvents.chart.length 
      : Object.values(commonEvents.chart || {}).reduce((sum, events) => sum + events.length, 0);
    setStatus(`Loaded ${map.size} tickers, ${totalXEvents} common X events, ${totalChartEvents} chart events`);
    return { dataMap: map, commonEvents };
  } catch (err) {
    setStatus('Using sample data (place data files to override)');
    return makeSampleData();
  }
}

let currentData: { dataMap: Map<string, TickerData>; commonEvents: { x?: (XPointEvent & EventBase)[]; chart?: { [key: string]: EventMarker[] } | EventMarker[] } } | null = null;
let originalDataMap: Map<string, TickerData> | null = null; // 원본 데이터 저장
let overlayChart: OverlayStockChart | null = null;
let showEvents = false;
let showCandles = false;
let showGaps = true;
let visibleChartKeys = ['price', 'volume', 'obv']; // 표시할 차트 키들
let lineMode: LineType = 'line-smooth';
let showAverage: ShowAverageType = [];
let hideValues = false;
let dailyGroup = false;
let hideLines = false;
let showGrid = false;
let showPoints = false;
let normalize = false;
let enabledTickers = new Set<string>();
let visibleTickers = new Set<string>();
let rangeMin = 0;
let rangeMax = 100;

(async function bootstrap() {
  currentData = await loadData();
  
  // 원본 데이터 저장 (dailyGroup 토글용)
  originalDataMap = new Map(currentData.dataMap);
  
  // 모든 티커를 기본적으로 활성화 및 표시
  currentData.dataMap.forEach((_, symbol) => {
    enabledTickers.add(symbol);
    visibleTickers.add(symbol);
  });
  
  if (!currentData) {
    setStatus('Failed to load data');
    return;
  }

  // OverlayStockChart 초기화
  overlayChart = new OverlayStockChart(
    canvas, 
    currentData.dataMap,
    {
      commonEvents: currentData.commonEvents,
      initialState: {
        enabledTickers,
        visibleTickers,
        showEvents,
        showCandles,
        showGaps,
        visibleChartKeys,
        lineMode,
        showAverage,
        hideValues,
        hideLines,
        showGrid,
        showPoints,
        normalize,
        rangeMin,
        rangeMax
      },
      config: {
        paddingLeft: 100,
        paddingRight: 100,
        // paddingTop: 100,
        // paddingBottom: 40,
        xFormat: (xValue: number, index, total) => {
          if (index !==0 && index !== total-1 && index % Math.ceil(total / 2) !== 0) {
            return '';
          }
          const date = new Date(xValue);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        },
        yFormat: (yValue: number, index, total) => {
          if (index !==0 && index !== total-1 && index % Math.ceil(total / 2) !== 0) {
            return '';
          }
            return yValue.toLocaleString(undefined, {maximumFractionDigits: 2});
        //   if (overlayChart?.getState()?.normalize) {
        //     return yValue.toLocaleString(undefined, {maximumFractionDigits: 2});
        //   } else {
        //     return {font:'6px Arial', value: yValue.toLocaleString(undefined, {maximumFractionDigits: 2})};
        //   }
        },
        // tooltipLabelFormat: (chartKey: string) => {
        //   return 'zzzzz'
        // },
        crosshairYFormat: (yValue: number, chartKey: string) => {
          return yValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
        },
        crosshairXFormat: (xValue: number) => {
          const date = new Date(xValue);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const seconds = String(date.getSeconds()).padStart(2, '0');
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        },
        labelFormat: (chartKey: string) => {
          const labels: { [key: string]: string } = {
            price: 'Price',
            volume: 'Volume',
            obv: 'OBV'
          };
          return labels[chartKey] || chartKey;
        }
      }
    }
  );
  
  setStatus('Ready');

  // 티커 토글 버튼 생성
  const tickerListEl = document.getElementById('ticker-list');
  const toggleAllTickersEl = document.getElementById('toggle-all-tickers') as HTMLInputElement | null;
  
  if (tickerListEl) {
    // 각 티커별 토글 버튼 생성
    currentData.dataMap.forEach((_, symbol) => {
      const label = document.createElement('label');
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = true;
      checkbox.id = `toggle-ticker-${symbol}`;
      
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          enabledTickers.add(symbol);
          visibleTickers.add(symbol);
        } else {
          enabledTickers.delete(symbol);
          visibleTickers.delete(symbol);
        }
        
        if (toggleAllTickersEl && currentData) {
          toggleAllTickersEl.checked = enabledTickers.size === currentData.dataMap.size;
        }
        
        overlayChart?.updateState({ enabledTickers, visibleTickers });
      });
      
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(symbol));
      tickerListEl.appendChild(label);
    });
    
    // 전체 토글 이벤트
    if (toggleAllTickersEl) {
      toggleAllTickersEl.addEventListener('change', () => {
        if (!currentData) return;
        const isChecked = toggleAllTickersEl.checked;
        
        if (isChecked) {
          currentData.dataMap.forEach((_, symbol) => {
            enabledTickers.add(symbol);
            visibleTickers.add(symbol);
            const checkbox = document.getElementById(`toggle-ticker-${symbol}`) as HTMLInputElement;
            if (checkbox) checkbox.checked = true;
          });
        } else {
          enabledTickers.clear();
          visibleTickers.clear();
          currentData.dataMap.forEach((_, symbol) => {
            const checkbox = document.getElementById(`toggle-ticker-${symbol}`) as HTMLInputElement;
            if (checkbox) checkbox.checked = false;
          });
        }
        
        overlayChart?.updateState({ enabledTickers, visibleTickers });
      });
    }
  }

  if (toggleEventsEl) {
    toggleEventsEl.checked = showEvents;
    toggleEventsEl.addEventListener('change', () => {
      showEvents = toggleEventsEl.checked;
      overlayChart?.updateState({ showEvents });
    });
  }

  if (toggleCandlesEl) {
    toggleCandlesEl.checked = showCandles;
    toggleCandlesEl.addEventListener('change', () => {
      showCandles = toggleCandlesEl.checked;
      overlayChart?.updateState({ showCandles });
    });
  }

  if (toggleGapsEl) {
    toggleGapsEl.checked = !showGaps;
    toggleGapsEl.addEventListener('change', () => {
      showGaps = !toggleGapsEl.checked;
      overlayChart?.updateState({ showGaps });
    });
  }

  if (toggleVolumeEl) {
    toggleVolumeEl.checked = visibleChartKeys.includes('volume');
    toggleVolumeEl.addEventListener('change', () => {
      if (toggleVolumeEl.checked) {
        if (!visibleChartKeys.includes('volume')) {
          visibleChartKeys.push('volume');
        }
      } else {
        visibleChartKeys = visibleChartKeys.filter(k => k !== 'volume');
      }
      overlayChart?.updateState({ visibleChartKeys: [...visibleChartKeys] });
    });
  }

  if (toggleOBVEl) {
    toggleOBVEl.checked = visibleChartKeys.includes('obv');
    toggleOBVEl.addEventListener('change', () => {
      if (toggleOBVEl.checked) {
        if (!visibleChartKeys.includes('obv')) {
          visibleChartKeys.push('obv');
        }
      } else {
        visibleChartKeys = visibleChartKeys.filter(k => k !== 'obv');
      }
      overlayChart?.updateState({ visibleChartKeys: [...visibleChartKeys] });
    });
  }

  if (lineModeRadios.length > 0) {
    lineModeRadios.forEach(radio => {
      if (radio.value === lineMode) {
        radio.checked = true;
      }
      radio.addEventListener('change', () => {
        if (radio.checked) {
          lineMode = radio.value as 'line' | 'line-smooth' | 'line-smooth-open' | 'line-smooth-high' | 'line-smooth-low' | 'line-smooth-middle' | 'step-to' | 'step-from' | 'step-center';
          overlayChart?.updateState({ lineMode });
        }
      });
    });
  }

  if (toggleAverageEl) {
    toggleAverageEl.checked = showAverage.some(avg => avg.type === 'average');
    toggleAverageEl.addEventListener('change', () => {
      // 전체 평균선 토글
      if (toggleAverageEl.checked) {
        // 전체 평균선 추가
        if (!showAverage.some(avg => avg.type === 'average')) {
          showAverage.push({ type: 'average', label: 'Average', color: '#FF0000', visible: true });
        }
      } else {
        // 전체 평균선 제거
        showAverage = showAverage.filter(avg => avg.type !== 'average');
      }
      overlayChart?.updateState({ showAverage: [...showAverage] });
    });
  }

  if (toggleMA5El) {
    toggleMA5El.checked = showAverage.some(avg => avg.type === 'moving' && avg.xWidth === 60*1000*60*24*5);
    toggleMA5El.addEventListener('change', () => {
      // 5일 이동평균선 토글
      if (toggleMA5El.checked) {
        if (!showAverage.some(avg => avg.type === 'moving' && avg.xWidth === 60*1000*60*24*5)) {
          showAverage.push({ type: 'moving', xWidth: 60*1000*60*24*5, label: 'MA5', color: '#0000FF', visible: true });
        }
      } else {
        showAverage = showAverage.filter(avg => !(avg.type === 'moving' && avg.xWidth === 60*1000*60*24*5));
      }
      overlayChart?.updateState({ showAverage: [...showAverage] });
    });
  }

  if (toggleMA10El) {
    toggleMA10El.checked = showAverage.some(avg => avg.type === 'moving' && avg.xWidth === 60*1000*60*24*10);
    toggleMA10El.addEventListener('change', () => {
      // 10일 이동평균선 토글
      if (toggleMA10El.checked) {
        if (!showAverage.some(avg => avg.type === 'moving' && avg.xWidth === 60*1000*60*24*10)) {
          showAverage.push({ type: 'moving', xWidth: 60*1000*60*24*10, label: 'MA10', color: '#00AA00', visible: true });
        }
      } else {
        showAverage = showAverage.filter(avg => !(avg.type === 'moving' && avg.xWidth === 60*1000*60*24*10));
      }
      overlayChart?.updateState({ showAverage: [...showAverage] });
    });
  }

  if (toggleMA20El) {
    toggleMA20El.checked = showAverage.some(avg => avg.type === 'moving' && avg.xWidth === 60*1000*60*24*20);
    toggleMA20El.addEventListener('change', () => {
      // 20일 이동평균선 토글
      if (toggleMA20El.checked) {
        if (!showAverage.some(avg => avg.type === 'moving' && avg.xWidth === 60*1000*60*24*20)) {
          showAverage.push({ type: 'moving', xWidth: 60*1000*60*24*20, label: 'MA20', color: '#FF00FF', visible: true });
        }
      } else {
        showAverage = showAverage.filter(avg => !(avg.type === 'moving' && avg.xWidth === 60*1000*60*24*20));
      }
      overlayChart?.updateState({ showAverage: [...showAverage] });
    });
  }

  // 티커별 이동평균선 핸들러
  const updateTickerMovingAverages = () => {
    if (!originalDataMap) {
      console.log('[updateTickerMovingAverages] originalDataMap이 없습니다');
      return;
    }
    
    const xWidths: number[] = [];
    if (tickerMA5El?.checked) xWidths.push(60*1000*60*24*5);
    if (tickerMA10El?.checked) xWidths.push(60*1000*60*24*10);
    if (tickerMA20El?.checked) xWidths.push(60*1000*60*24*20);
    
    console.log('[updateTickerMovingAverages] xWidths:', xWidths);
    
    // 모든 티커에 movingAverageXwidth 설정
    const updatedDataMap = new Map<string, TickerData>();
    originalDataMap.forEach((tickerData, symbol) => {
      // 깊은 복사를 위해 새 객체 생성
      const newTickerData: TickerData = {
        ...tickerData,
        movingAverageXwidth: xWidths.length > 0 ? xWidths : undefined
      };
      updatedDataMap.set(symbol, newTickerData);
      console.log(`[updateTickerMovingAverages] ${symbol}:`, newTickerData.movingAverageXwidth);
    });
    
    // dailyGroup이 활성화되어 있으면 그룹화 적용
    const finalDataMap = dailyGroup ? groupDataByDay(updatedDataMap) : updatedDataMap;
    
    overlayChart?.setData(finalDataMap, currentData?.commonEvents || {});
    overlayChart?.render();
  };

  if (tickerMA5El) {
    tickerMA5El.addEventListener('change', updateTickerMovingAverages);
  }

  if (tickerMA10El) {
    tickerMA10El.addEventListener('change', updateTickerMovingAverages);
  }

  if (tickerMA20El) {
    tickerMA20El.addEventListener('change', updateTickerMovingAverages);
  }

  if (toggleHideValuesEl) {
    toggleHideValuesEl.checked = hideValues;
    toggleHideValuesEl.addEventListener('change', () => {
      hideValues = toggleHideValuesEl.checked;
      overlayChart?.updateState({ hideValues });
    });
  }

  if (toggleDailyGroupEl) {
    toggleDailyGroupEl.checked = dailyGroup;
    toggleDailyGroupEl.addEventListener('change', () => {
      dailyGroup = toggleDailyGroupEl.checked;
      
      if (!originalDataMap) return;
      
      // dailyGroup이 활성화되면 데이터를 그룹화하고, 비활성화되면 원본 데이터 사용
      const dataToUse = dailyGroup ? groupDataByDay(originalDataMap) : new Map(originalDataMap);
      
      // 차트에 새 데이터 설정
      overlayChart?.setData(dataToUse, currentData?.commonEvents || {});
      overlayChart?.render();
    });
  }

  if (toggleHideLinesEl) {
    toggleHideLinesEl.checked = hideLines;
    toggleHideLinesEl.addEventListener('change', () => {
      hideLines = toggleHideLinesEl.checked;
      overlayChart?.updateState({ hideLines });
    });
  }

  if (toggleShowGridEl) {
    toggleShowGridEl.checked = showGrid;
    toggleShowGridEl.addEventListener('change', () => {
      showGrid = toggleShowGridEl.checked;
      overlayChart?.updateState({ showGrid });
    });
  }

  if (toggleShowPointsEl) {
    toggleShowPointsEl.checked = showPoints;
    toggleShowPointsEl.addEventListener('change', () => {
      showPoints = toggleShowPointsEl.checked;
      overlayChart?.updateState({ showPoints });
    });
  }

  if (toggleNormalizeEl) {
    toggleNormalizeEl.checked = normalize;
    toggleNormalizeEl.addEventListener('change', () => {
      normalize = toggleNormalizeEl.checked;
      overlayChart?.updateState({ normalize });
    });
  }

  // Range slider 이벤트 설정
  function updateRangeSlider() {
    if (rangeSliderRangeEl) {
      rangeSliderRangeEl.style.left = `${rangeMin}%`;
      rangeSliderRangeEl.style.width = `${rangeMax - rangeMin}%`;
    }
    if (rangeValuesEl) {
      rangeValuesEl.textContent = `${rangeMin}% ~ ${rangeMax}%`;
    }
  }

  if (rangeMinEl && rangeMaxEl) {
    rangeMinEl.addEventListener('input', () => {
      let val = parseInt(rangeMinEl.value, 10);
      if (val > rangeMax - 1) {
        val = rangeMax - 1;
        rangeMinEl.value = String(val);
      }
      rangeMin = val;
      updateRangeSlider();
      overlayChart?.updateState({ rangeMin });
    });

    rangeMaxEl.addEventListener('input', () => {
      let val = parseInt(rangeMaxEl.value, 10);
      if (val < rangeMin + 1) {
        val = rangeMin + 1;
        rangeMaxEl.value = String(val);
      }
      rangeMax = val;
      updateRangeSlider();
      overlayChart?.updateState({ rangeMax });
    });

    updateRangeSlider();
  }

  overlayChart.render();
})();
