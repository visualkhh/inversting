type ChartData = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

interface EventMarker {
  timestamp: string;
  label: string;
  color?: string;
}

const colors = ['#0000FF', '#FF0000', '#00AA00', '#FF00FF'];
const padding = 50;

const statusTextEl = document.getElementById('status-text');
const toggleEventsEl = document.getElementById('toggle-events') as HTMLInputElement | null;
const toggleCandlesEl = document.getElementById('toggle-candles') as HTMLInputElement | null;
const toggleGapsEl = document.getElementById('toggle-gaps') as HTMLInputElement | null;
const toggleVolumeEl = document.getElementById('toggle-volume') as HTMLInputElement | null;
const toggleOBVEl = document.getElementById('toggle-obv') as HTMLInputElement | null;
const smoothModeRadios = document.querySelectorAll('input[name="smooth-mode"]') as NodeListOf<HTMLInputElement>;
const toggleAverageEl = document.getElementById('toggle-average') as HTMLInputElement | null;
const toggleHideValuesEl = document.getElementById('toggle-hide-values') as HTMLInputElement | null;
const toggleDailyGroupEl = document.getElementById('toggle-daily-group') as HTMLInputElement | null;
const toggleHideLinesEl = document.getElementById('toggle-hide-lines') as HTMLInputElement | null;
const toggleShowGridEl = document.getElementById('toggle-show-grid') as HTMLInputElement | null;
const toggleShowPointsEl = document.getElementById('toggle-show-points') as HTMLInputElement | null;
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

function calculateOBV(data: ChartData[]): number[] {
  const obv: number[] = [];
  let cumulative = 0;
  
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const volume = d.volume || 0;
    
    if (i === 0) {
      cumulative = volume;
    } else {
      const prev = data[i - 1];
      if (d.close > prev.close) {
        cumulative += volume;
      } else if (d.close < prev.close) {
        cumulative -= volume;
      }
    }
    obv.push(cumulative);
  }
  
  return obv;
}

function makeSampleData(): { dataMap: Map<string, ChartData[]>; events: EventMarker[] } {
  const symbols = ['AVGO', 'MU', '005930.KS', '000660.KS'];
  const start = new Date('2025-09-01T00:00:00Z').getTime();
  const day = 24 * 60 * 60 * 1000;
  const points = 60;

  const dataMap = new Map<string, ChartData[]>();
  symbols.forEach((sym, idx) => {
    let price = 100 + idx * 10;
    const arr: ChartData[] = [];
    for (let i = 0; i < points; i++) {
      const noise = (Math.random() - 0.5) * 4;
      const drift = 0.3 * i;
      const close = Math.max(1, price + noise + drift);
      const high = close + Math.random() * 3;
      const low = close - Math.random() * 3;
      const open = (close + low) / 2;
      const ts = new Date(start + i * day).toISOString().replace('T', ' ').replace('Z', '');
      arr.push({ timestamp: ts, open, high, low, close });
      price = close;
    }
    dataMap.set(sym, arr);
  });

  const events: EventMarker[] = [
    { timestamp: '2025-09-15 09:30:00', label: 'Event A', color: '#FF0000' },
    { timestamp: '2025-10-15 09:30:00', label: 'Event B', color: '#0000FF' },
    { timestamp: '2025-11-15 09:30:00', label: 'Event C', color: '#00AA00' },
  ];

  return { dataMap, events };
}

async function loadData(): Promise<{ dataMap: Map<string, ChartData[]>; events: EventMarker[] }> {
  try {
    const resp = await fetch('data/chart-data.json');
    if (!resp.ok) throw new Error('No data file');
    const json = await resp.json();
    // Expecting shape { dataMap: Record<string, ChartData[]>, events?: EventMarker[] }
    const map = new Map<string, ChartData[]>();
    Object.keys(json.dataMap || {}).forEach(key => {
      map.set(key, json.dataMap[key]);
    });
    const events: EventMarker[] = json.events || [];
    setStatus('Loaded chart-data.json');
    return { dataMap: map, events };
  } catch (err) {
    setStatus('Using sample data (place data/chart-data.json to override)');
    return makeSampleData();
  }
}

function drawSimpleOverlayChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dataMap: Map<string, ChartData[]>,
  events: EventMarker[] = [],
  showEvents = true,
  showCandles = true,
  fillGaps = false,
  showOBV = false,
  priceChartHeight?: number,
  smoothMode: 'none' | 'smooth' | 'open' = 'none',
  showAverage = false,
  hideValues = false,
  hideLines = false,
  displayMinTime?: number,
  displayMaxTime?: number
) {
  const actualHeight = priceChartHeight || height;
  const allTimePoints = new Set<number>();
  const dataBySymbol = new Map<string, { time: number; open: number; high: number; low: number; close: number }[]>();

  dataMap.forEach((data, symbol) => {
    const points: { time: number; open: number; high: number; low: number; close: number }[] = [];
    data.forEach(d => {
      const time = new Date(d.timestamp).getTime() / 1000;
      allTimePoints.add(time); // keep all timestamps for timeline
      if (d.close && d.close > 0) {
        points.push({
          time,
          open: d.open ?? 0,
          high: d.high ?? d.close,
          low: d.low ?? d.close,
          close: d.close
        });
      }
    });
    dataBySymbol.set(symbol, points);
  });

  const sortedTimes = Array.from(allTimePoints).sort((a, b) => a - b);
  if (sortedTimes.length === 0) return;

  // displayMinTime/displayMaxTime이 전달되면 해당 범위로 X축 고정
  const minTime = displayMinTime ?? sortedTimes[0];
  const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const minMaxBySymbol = new Map<string, { min: number; max: number }>();
  dataBySymbol.forEach((points, symbol) => {
    const closes = points.map(p => p.close);
    if (closes.length > 0) {
      minMaxBySymbol.set(symbol, {
        min: Math.min(...closes),
        max: Math.max(...closes)
      });
    }
  });

  const getX = (time: number): number => {
    return padding + ((time - minTime) / timeRange) * (width - padding * 2);
  };

  // Price 그래프 영역: 상단 padding ~ actualHeight (하단 padding 없음)
  const graphTop = padding;
  const graphBottom = actualHeight;
  const graphHeight = graphBottom - graphTop;

  // Y축 범위 적용: 정규화된 값(0-1)에서 yRangeMin~yRangeMax 범위만 표시
  const getY = (value: number, minVal: number, maxVal: number): number => {
    const range = maxVal - minVal || 1;
    const normalizedValue = (value - minVal) / range;
    return graphBottom - normalizedValue * graphHeight;
  };

  // 배경 (Price 영역만)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, actualHeight);

  // Price 영역 그리드 (10x10) - graphHeight 기준
  const gridDivisions = 10;
  const gridWidth = width - padding * 2;
  const gridHeight = graphBottom - graphTop;
  const gridStepX = gridWidth / gridDivisions;
  const gridStepY = gridHeight / gridDivisions;
  
  if (showGrid) {
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    
    // 세로 그리드선
    for (let i = 0; i <= gridDivisions; i++) {
      const x = padding + gridStepX * i;
      ctx.beginPath();
      ctx.moveTo(x, graphTop);
      ctx.lineTo(x, graphBottom);
      ctx.stroke();
    }
    
    // 가로 그리드선
    for (let i = 0; i <= gridDivisions; i++) {
      const y = graphTop + gridStepY * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
  }

  // Y축 (항상 그리기)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, graphTop);
  ctx.lineTo(padding, graphBottom);
  ctx.stroke();
  
  // X축 (Volume/OBV가 없을 때만 그리기)
  if (!showOBV) {
    ctx.beginPath();
    ctx.moveTo(padding, graphBottom);
    ctx.lineTo(width - padding, graphBottom);
    ctx.stroke();
  }

  // Y축 레이블 (Price)
  if (!hideValues) {
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 5; i++) {
      const value = 100 - i * 20;
      const y = graphTop + (i / 5) * graphHeight;
      ctx.fillText(`${value}%`, padding - 10, y);
    }
  }
  
  // 'Price' 세로 텍스트 (항상 표시)
  ctx.save();
  // Price 영역의 실제 중간 위치 계산
  const priceLabelY = (graphTop + graphBottom) / 2;
  ctx.translate(8, priceLabelY);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Price', 0, 0);
  ctx.restore();

  // Price와 OBV 구분선 (OBV 활성화시) - graphBottom 위치에
  if (showOBV) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, graphBottom);
    ctx.lineTo(width - padding, graphBottom);
    ctx.stroke();
  }

  // 심볼별 렌더링
  let colorIndex = 0;
  dataBySymbol.forEach((points, symbol) => {
    const color = colors[colorIndex % colors.length];
    const minMax = minMaxBySymbol.get(symbol)!;
    const sortedPoints = points.sort((a, b) => a.time - b.time);
    if (sortedPoints.length === 0) {
      colorIndex++;
      return;
    }
    
    // 숨겨진 티커는 그래프 그리지 않음
    if (!visibleTickers.has(symbol)) {
      colorIndex++;
      return;
    }

    // 각 포인트 캔들 (투명)
    if (showCandles) {
      sortedPoints.forEach(point => {
        const x = getX(point.time);
        const yHigh = getY(point.high, minMax.min, minMax.max);
        const yLow = getY(point.low, minMax.min, minMax.max);
        const yOpen = getY(point.open, minMax.min, minMax.max);
        const yClose = getY(point.close, minMax.min, minMax.max);

        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        const candleWidth = 3;
        const isUp = point.close >= point.open;
        if (isUp) {
          ctx.strokeStyle = color;
          ctx.fillStyle = '#FFFFFF';
        } else {
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
        }
        const rectY = Math.min(yOpen, yClose);
        const rectHeight = Math.abs(yOpen - yClose) || 1;
        ctx.fillRect(x - candleWidth / 2, rectY, candleWidth, rectHeight);
        ctx.strokeRect(x - candleWidth / 2, rectY, candleWidth, rectHeight);
        ctx.globalAlpha = 1;
      });
    }

    // 라인 연결
    if (!hideLines) {
      // 클리핑 영역 설정 (Y축 레이블 영역 제외)
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding, graphTop, width - padding * 2, graphHeight);
      ctx.clip();
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const lineFirstX = getX(sortedPoints[0].time);
      const lineFirstY = getY(sortedPoints[0].close, minMax.min, minMax.max);
      ctx.moveTo(lineFirstX, lineFirstY);

    for (let i = 1; i < sortedPoints.length; i++) {
      const point = sortedPoints[i];
      const prevPoint = sortedPoints[i - 1];
      const x = getX(point.time);
      const y = getY(point.close, minMax.min, minMax.max);
      const timeDiff = point.time - prevPoint.time;
      const avgTimeDiff = timeRange / sortedTimes.length;

      if (timeDiff > avgTimeDiff * 2) {
        ctx.stroke();
        if (!fillGaps) {
          ctx.setLineDash([5, 5]);
        }
        ctx.beginPath();
        const prevX = getX(prevPoint.time);
        const prevY = getY(prevPoint.close, minMax.min, minMax.max);
        ctx.moveTo(prevX, prevY);
        
        if (smoothMode !== 'none') {
          const cp1x = prevX + (x - prevX) / 3;
          const cp1y = prevY;
          const cp2x = prevX + (x - prevX) * 2 / 3;
          // smoothMode === 'open'이면 현재 포인트의 open 값을 제어점으로 활용
          let cp2y: number;
          if (smoothMode === 'open' && point.open && point.open > 0) {
            cp2y = getY(point.open, minMax.min, minMax.max);
          } else {
            cp2y = y;
          }
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        } else {
          ctx.lineTo(x, y);
        }
        
        ctx.stroke();
        if (!fillGaps) {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else {
        if (smoothMode !== 'none' && i > 0) {
          const prevX = getX(prevPoint.time);
          const prevY = getY(prevPoint.close, minMax.min, minMax.max);
          
          const cp1x = prevX + (x - prevX) / 3;
          const cp1y = prevY;
          const cp2x = prevX + (x - prevX) * 2 / 3;
          // smoothMode === 'open'이면 현재 포인트의 open 값을 제어점으로 활용
          let cp2y: number;
          if (smoothMode === 'open' && point.open && point.open > 0) {
            cp2y = getY(point.open, minMax.min, minMax.max);
          } else {
            cp2y = y;
          }
          
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
      ctx.stroke();
      ctx.restore(); // 클리핑 해제
    }

    colorIndex++;
  });
  
  // 범례 그리기 (좌측 상단 빈 공간) - 클릭 가능
  const legendX = padding + 10;
  const legendY = padding - 25;
  const legendLineWidth = 15;
  const legendItemWidth = 80;
  const legendHeight = 16;
  let legendColorIndex = 0;
  legendItems = []; // 범례 클릭 영역 초기화
  
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '11px Arial';
  dataBySymbol.forEach((_, symbol) => {
    const color = colors[legendColorIndex % colors.length];
    const isVisible = visibleTickers.has(symbol);
    const itemX = legendX + legendColorIndex * legendItemWidth;
    
    // 클릭 영역 저장
    legendItems.push({
      symbol,
      x: itemX - 5,
      y: legendY - legendHeight / 2,
      width: legendItemWidth - 5,
      height: legendHeight
    });
    
    // 숨겨진 티커는 회색으로 표시
    ctx.globalAlpha = isVisible ? 1.0 : 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(itemX, legendY);
    ctx.lineTo(itemX + legendLineWidth, legendY);
    ctx.stroke();
    ctx.fillStyle = isVisible ? '#000000' : '#999999';
    ctx.fillText(symbol, itemX + legendLineWidth + 5, legendY);
    ctx.globalAlpha = 1.0;
    legendColorIndex++;
  });
  
  // 평균선 그리기 (모든 티커의 평균 - 정규화된 좌표계에서)
  if (showAverage && dataBySymbol.size > 0) {
    // 각 시점에서 모든 티커의 정규화된 Y 좌표를 평균내기
    const avgPoints: { time: number; avgY: number }[] = [];
    
    sortedTimes.forEach(time => {
      const yValues: number[] = [];
      
      dataBySymbol.forEach((sortedPoints, symbol) => {
        const minMax = minMaxBySymbol.get(symbol);
        if (!minMax) return;
        
        // 해당 시점의 값 찾기 또는 보간
        let closeValue: number | null = null;
        
        // 정확한 시점 찾기
        const exactPoint = sortedPoints.find(p => p.time === time);
        if (exactPoint) {
          closeValue = exactPoint.close;
        } else {
          // 보간: 이전과 이후 값 찾기
          let prevPoint = null;
          let nextPoint = null;
          
          for (let i = 0; i < sortedPoints.length; i++) {
            if (sortedPoints[i].time < time) {
              prevPoint = sortedPoints[i];
            } else if (sortedPoints[i].time > time) {
              nextPoint = sortedPoints[i];
              break;
            }
          }
          
          if (prevPoint && nextPoint) {
            // 선형 보간
            const ratio = (time - prevPoint.time) / (nextPoint.time - prevPoint.time);
            closeValue = prevPoint.close + (nextPoint.close - prevPoint.close) * ratio;
          } else if (prevPoint) {
            closeValue = prevPoint.close;
          } else if (nextPoint) {
            closeValue = nextPoint.close;
          }
        }
        
        if (closeValue !== null) {
          // 이 티커의 정규화된 Y 좌표 계산 (0-100% 범위)
          const yCoord = getY(closeValue, minMax.min, minMax.max);
          yValues.push(yCoord);
        }
      });
      
      if (yValues.length > 0) {
        // Y 좌표의 평균
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        avgPoints.push({ time, avgY });
      }
    });
    
    // 평균선 그리기
    if (avgPoints.length > 0) {
      ctx.strokeStyle = '#000000'; // 검정색
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]); // 촘촘한 점선
      ctx.globalAlpha = 1.0;
      
      ctx.beginPath();
      avgPoints.forEach((point, i) => {
        const x = getX(point.time);
        const y = point.avgY; // 이미 계산된 Y 좌표 사용
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else if (smoothMode !== 'none' && i > 0) {
          const prevPoint = avgPoints[i - 1];
          const prevX = getX(prevPoint.time);
          const prevY = prevPoint.avgY;
          const cp1x = prevX + (x - prevX) / 3;
          const cp1y = prevY;
          const cp2x = prevX + (x - prevX) * 2 / 3;
          const cp2y = y;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }
  }
}

function drawVolumeChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  actualHeight: number,
  volumeTopY: number,
  volumeHeight: number,
  dataMap: Map<string, ChartData[]>,
  sortedTimes: number[],
  fillGaps: boolean,
  useSmooth = false,
  showAverage = false,
  hideValues = false,
  hideLines = false,
  displayMinTime?: number,
  displayMaxTime?: number
) {
  if (!ctx || sortedTimes.length === 0) return;

  // displayMinTime/displayMaxTime이 전달되면 해당 범위로 X축 고정
  const minTime = displayMinTime ?? sortedTimes[0];
  const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const getX = (time: number): number => {
    return padding + ((time - minTime) / timeRange) * (width - padding * 2);
  };

  const getY = (value: number, minVal: number, maxVal: number): number => {
    const range = maxVal - minVal || 1;
    const normalizedValue = (value - minVal) / range;
    return volumeTopY + (1 - normalizedValue) * volumeHeight;
  };

  // 배경 (Volume 영역)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, volumeTopY, width, volumeHeight);

  // Volume 영역 그리드 (10x10)
  const gridDivisions = 10;
  const gridWidth = width - padding * 2;
  const gridHeight = volumeHeight;
  const gridStepX = gridWidth / gridDivisions;
  const gridStepY = gridHeight / gridDivisions;
  
  if (showGrid) {
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    
    // 세로 그리드선
    for (let i = 0; i <= gridDivisions; i++) {
      const x = padding + gridStepX * i;
      ctx.beginPath();
      ctx.moveTo(x, volumeTopY);
      ctx.lineTo(x, volumeTopY + gridHeight);
      ctx.stroke();
    }
    
    // 가로 그리드선
    for (let i = 0; i <= gridDivisions; i++) {
      const y = volumeTopY + gridStepY * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
  }

  // Y축 연결
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, volumeTopY);
  ctx.lineTo(padding, volumeTopY + gridHeight);
  ctx.stroke();

  // 하단 X축
  ctx.beginPath();
  ctx.moveTo(padding, volumeTopY + gridHeight);
  ctx.lineTo(width - padding, volumeTopY + gridHeight);
  ctx.stroke();

  // 각 티커별 볼륨 min/max 계산 (각 티커가 자신의 스케일 사용)
  const volumeMinMaxBySymbol = new Map<string, { min: number; max: number }>();
  dataMap.forEach((data, symbol) => {
    const volumes = data.map(d => d.volume || 0).filter(v => v > 0);
    if (volumes.length > 0) {
      volumeMinMaxBySymbol.set(symbol, {
        min: Math.min(...volumes),
        max: Math.max(...volumes)
      });
    }
  });

  // Volume 렌더링 (선 그래프)
  let colorIndex = 0;
  dataMap.forEach((data, symbol) => {
    const volumeColor = colors[colorIndex % colors.length];
    const minMax = volumeMinMaxBySymbol.get(symbol);
    if (!minMax) {
      colorIndex++;
      return;
    }
    
    // 숨겨진 티커는 그래프 그리지 않음
    if (!visibleTickers.has(symbol)) {
      colorIndex++;
      return;
    }
    
    if (!hideLines) {
      // 클리핑 영역 설정 (Y축 레이블 영역 제외)
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding, volumeTopY, width - padding * 2, volumeHeight);
      ctx.clip();
      
      ctx.strokeStyle = volumeColor;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      // 평균 시간 간격 계산 (Price 차트와 동일)
      const avgTimeDiff = timeRange / sortedTimes.length;
      
      let prevValidIndex = -1;
    for (let i = 0; i < data.length; i++) {
      const time = new Date(data[i].timestamp).getTime() / 1000;
      // 모든 데이터 포인트를 그림 (앞뒤 추가 포인트 포함)
        const volume = data[i].volume || 0;
        const x = getX(time);
        const y = getY(volume, minMax.min, minMax.max);
        const hasData = volume > 0;
        
        if (prevValidIndex === -1) {
          // 첫 포인트
          ctx.beginPath();
          ctx.moveTo(x, y);
          prevValidIndex = i;
        } else {
          const prevTime = new Date(data[prevValidIndex].timestamp).getTime() / 1000;
          const timeDiff = time - prevTime;
          const prevVolume = data[prevValidIndex].volume || 0;
          const prevHasData = prevVolume > 0;
          
          // gap 감지: 시간 간격이 평균의 2배 이상이거나 volume이 0인 경우
          const hasTimeGap = timeDiff > avgTimeDiff * 2;
          const hasDataGap = !hasData || !prevHasData;
          
          // fillGaps가 true면 모두 실선, false면 gap 있으면 점선
          if (fillGaps) {
            // 빈곳채우기: 모두 실선
            if (useSmooth && prevValidIndex >= 0) {
              const prevTime = new Date(data[prevValidIndex].timestamp).getTime() / 1000;
              const prevX = getX(prevTime);
              const prevY = getY(data[prevValidIndex].volume || 0, minMax.min, minMax.max);
              const cp1x = prevX + (x - prevX) / 3;
              const cp1y = prevY;
              const cp2x = prevX + (x - prevX) * 2 / 3;
              const cp2y = y;
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
            } else {
              ctx.lineTo(x, y);
            }
          } else {
            // gap이 있으면 점선
            if (hasTimeGap || hasDataGap) {
              // 점선으로 그리기
              ctx.stroke();
              ctx.beginPath();
              ctx.setLineDash([5, 5]);
              const prevX = getX(prevTime);
              const prevY = getY(data[prevValidIndex].volume || 0, minMax.min, minMax.max);
              ctx.moveTo(prevX, prevY);
              
              if (useSmooth) {
                const cp1x = prevX + (x - prevX) / 3;
                const cp1y = prevY;
                const cp2x = prevX + (x - prevX) * 2 / 3;
                const cp2y = y;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
              } else {
                ctx.lineTo(x, y);
              }
              
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(x, y);
            } else {
              // 실선으로 그리기
              if (useSmooth && prevValidIndex >= 0) {
                const prevTime = new Date(data[prevValidIndex].timestamp).getTime() / 1000;
                const prevX = getX(prevTime);
                const prevY = getY(data[prevValidIndex].volume || 0, minMax.min, minMax.max);
                const cp1x = prevX + (x - prevX) / 3;
                const cp1y = prevY;
                const cp2x = prevX + (x - prevX) * 2 / 3;
                const cp2y = y;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
          }
          prevValidIndex = i;
        }
    }
      
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore(); // 클리핑 해제
    }
    colorIndex++;
  });

  // Y축 레이블 (Volume)
  if (!hideValues) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    for (let i = 0; i <= 5; i++) {
      const value = 100 - i * 20;
      const y = volumeTopY + (i / 5) * volumeHeight;
      ctx.fillText(`${value}%`, padding - 10, y);
    }
  }

  // 'Volume' 세로 텍스트
  ctx.save();
  ctx.translate(8, volumeTopY + volumeHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Volume', 0, 0);
  ctx.restore();
  
  // 평균선 그리기 (모든 티커의 평균 - 정규화된 좌표계에서) - Volume용
  if (showAverage && dataMap.size > 0) {
    // 각 티커별 min/max 계산
    const minMaxBySymbol = new Map<string, { min: number; max: number }>();
    dataMap.forEach((data, symbol) => {
      const volumes = data.map(d => d.volume || 0).filter(v => v > 0);
      if (volumes.length > 0) {
        minMaxBySymbol.set(symbol, {
          min: 0,
          max: Math.max(...volumes)
        });
      }
    });
    
    // 각 시점에서 모든 티커의 정규화된 Y 좌표를 평균내기
    const avgPoints: { time: number; avgY: number }[] = [];
    
    sortedTimes.forEach(time => {
      const yValues: number[] = [];
      
      dataMap.forEach((data, symbol) => {
        const minMax = minMaxBySymbol.get(symbol);
        if (!minMax) return;
        
        // 해당 시점의 값 찾기 또는 보간
        let volumeValue: number | null = null;
        
        const exactData = data.find(d => new Date(d.timestamp).getTime() / 1000 === time);
        if (exactData && exactData.volume) {
          volumeValue = exactData.volume;
        } else {
          let prevData = null;
          let nextData = null;
          
          for (let i = 0; i < data.length; i++) {
            const t = new Date(data[i].timestamp).getTime() / 1000;
            if (t < time) {
              prevData = data[i];
            } else if (t > time) {
              nextData = data[i];
              break;
            }
          }
          
          if (prevData && nextData && prevData.volume && nextData.volume) {
            const prevTime = new Date(prevData.timestamp).getTime() / 1000;
            const nextTime = new Date(nextData.timestamp).getTime() / 1000;
            const ratio = (time - prevTime) / (nextTime - prevTime);
            volumeValue = prevData.volume + (nextData.volume - prevData.volume) * ratio;
          } else if (prevData && prevData.volume) {
            volumeValue = prevData.volume;
          } else if (nextData && nextData.volume) {
            volumeValue = nextData.volume;
          }
        }
        
        if (volumeValue !== null && volumeValue > 0) {
          // 이 티커의 정규화된 Y 좌표 계산
          const yCoord = getY(volumeValue, minMax.min, minMax.max);
          yValues.push(yCoord);
        }
      });
      
      if (yValues.length > 0) {
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        avgPoints.push({ time, avgY });
      }
    });
    
    if (avgPoints.length > 0) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.globalAlpha = 1.0;
      
      ctx.beginPath();
      avgPoints.forEach((point, i) => {
        const x = getX(point.time);
        const y = point.avgY;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else if (useSmooth && i > 0) {
          const prevPoint = avgPoints[i - 1];
          const prevX = getX(prevPoint.time);
          const prevY = prevPoint.avgY;
          const cp1x = prevX + (x - prevX) / 3;
          const cp1y = prevY;
          const cp2x = prevX + (x - prevX) * 2 / 3;
          const cp2y = y;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }
  }
}

function drawOBVChart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  actualHeight: number,
  obvTopY: number,
  obvHeight: number,
  dataMap: Map<string, ChartData[]>,
  sortedTimes: number[],
  fillGaps: boolean,
  useSmooth = false,
  showAverage = false,
  hideValues = false,
  hideLines = false,
  displayMinTime?: number,
  displayMaxTime?: number
) {
  if (!ctx || sortedTimes.length === 0) return;

  // displayMinTime/displayMaxTime이 전달되면 해당 범위로 X축 고정
  const minTime = displayMinTime ?? sortedTimes[0];
  const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const getX = (time: number): number => {
    return padding + ((time - minTime) / timeRange) * (width - padding * 2);
  };

  const getY = (value: number, minVal: number, maxVal: number): number => {
    const range = maxVal - minVal || 1;
    const normalizedValue = (value - minVal) / range;
    return obvTopY + (1 - normalizedValue) * obvHeight;
  };

  // 배경 (OBV 영역)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, obvTopY, width, obvHeight);

  // OBV 영역 그리드 (10x10)
  const gridDivisions = 10;
  const gridWidth = width - padding * 2;
  const gridHeight = obvHeight;
  const gridStepX = gridWidth / gridDivisions;
  const gridStepY = gridHeight / gridDivisions;
  
  if (showGrid) {
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    
    // 세로 그리드선
    for (let i = 0; i <= gridDivisions; i++) {
      const x = padding + gridStepX * i;
      ctx.beginPath();
      ctx.moveTo(x, obvTopY);
      ctx.lineTo(x, obvTopY + gridHeight);
      ctx.stroke();
    }
    
    // 가로 그리드선
    for (let i = 0; i <= gridDivisions; i++) {
      const y = obvTopY + gridStepY * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
  }

  // Y축 연결 (Price 영역에서 이어받기)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, obvTopY);
  ctx.lineTo(padding, obvTopY + gridHeight);
  ctx.stroke();

  // 하단 X축
  ctx.beginPath();
  ctx.moveTo(padding, obvTopY + gridHeight);
  ctx.lineTo(width - padding, obvTopY + gridHeight);
  ctx.stroke();

  // 각 티커별 OBV min/max 계산 (각 티커가 자신의 스케일 사용)
  const obvMinMaxBySymbol = new Map<string, { min: number; max: number; values: number[] }>();
  dataMap.forEach((data, symbol) => {
    const obvValues = calculateOBV(data);
    if (obvValues.length > 0) {
      obvMinMaxBySymbol.set(symbol, {
        min: Math.min(...obvValues),
        max: Math.max(...obvValues),
        values: obvValues
      });
    }
  });

  // OBV 렌더링
  let colorIndex = 0;
  dataMap.forEach((data, symbol) => {
    const obvData = obvMinMaxBySymbol.get(symbol);
    
    if (!obvData) {
      colorIndex++;
      return;
    }
    
    // 숨겨진 티커는 그래프 그리지 않음
    if (!visibleTickers.has(symbol)) {
      colorIndex++;
      return;
    }

    const obvValues = obvData.values;
    const minMax = { min: obvData.min, max: obvData.max };
    const obvColor = colors[colorIndex % colors.length];
    
    if (!hideLines) {
      // 클리핑 영역 설정 (Y축 레이블 영역 제외)
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding, obvTopY, width - padding * 2, obvHeight);
      ctx.clip();
      
      ctx.strokeStyle = obvColor;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      // 평균 시간 간격 계산 (Price 차트와 동일)
      const avgTimeDiff = timeRange / sortedTimes.length;
      
      let prevValidIndex = -1;
    for (let i = 0; i < obvValues.length; i++) {
      const time = new Date(data[i].timestamp).getTime() / 1000;
      // 모든 데이터 포인트를 그림 (앞뒤 추가 포인트 포함)
        const x = getX(time);
        const y = getY(obvValues[i], minMax.min, minMax.max);
        const volume = data[i].volume || 0;
        
        // volume이 0이면 데이터 없음으로 간주
        const hasData = volume > 0;
        
        if (prevValidIndex === -1) {
          // 첫 포인트
          ctx.beginPath();
          ctx.moveTo(x, y);
          prevValidIndex = i;
        } else {
          const prevTime = new Date(data[prevValidIndex].timestamp).getTime() / 1000;
          const timeDiff = time - prevTime;
          const prevVolume = data[prevValidIndex].volume || 0;
          const prevHasData = prevVolume > 0;
          
          // gap 감지: 시간 간격이 평균의 2배 이상이거나 volume이 0인 경우
          const hasTimeGap = timeDiff > avgTimeDiff * 2;
          const hasDataGap = !hasData || !prevHasData;
          
          // fillGaps가 true면 모두 실선, false면 gap 있으면 점선
          if (fillGaps) {
            // 빈곳채우기: 모두 실선
            if (useSmooth && prevValidIndex >= 0) {
              const prevTime = new Date(data[prevValidIndex].timestamp).getTime() / 1000;
              const prevX = getX(prevTime);
              const prevY = getY(obvValues[prevValidIndex], minMax.min, minMax.max);
              const cp1x = prevX + (x - prevX) / 3;
              const cp1y = prevY;
              const cp2x = prevX + (x - prevX) * 2 / 3;
              const cp2y = y;
              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
            } else {
              ctx.lineTo(x, y);
            }
          } else {
            // gap이 있으면 점선
            if (hasTimeGap || hasDataGap) {
              // 점선으로 그리기
              ctx.stroke();
              ctx.beginPath();
              ctx.setLineDash([5, 5]);
              const prevX = getX(prevTime);
              const prevY = getY(obvValues[prevValidIndex], minMax.min, minMax.max);
              ctx.moveTo(prevX, prevY);
              
              if (useSmooth) {
                const cp1x = prevX + (x - prevX) / 3;
                const cp1y = prevY;
                const cp2x = prevX + (x - prevX) * 2 / 3;
                const cp2y = y;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
              } else {
                ctx.lineTo(x, y);
              }
              
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(x, y);
            } else {
              // 실선으로 그리기
              if (useSmooth && prevValidIndex >= 0) {
                const prevTime = new Date(data[prevValidIndex].timestamp).getTime() / 1000;
                const prevX = getX(prevTime);
                const prevY = getY(obvValues[prevValidIndex], minMax.min, minMax.max);
                const cp1x = prevX + (x - prevX) / 3;
                const cp1y = prevY;
                const cp2x = prevX + (x - prevX) * 2 / 3;
                const cp2y = y;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
              } else {
                ctx.lineTo(x, y);
              }
            }
          }
          prevValidIndex = i;
        }
    }
      
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore(); // 클리핑 해제
    }
    colorIndex++;
  });

  // Y축 레이블 (OBV) - 100%가 위, 0%가 아래
  if (!hideValues) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    for (let i = 0; i <= 5; i++) {
      const value = 100 - i * 20;
      const y = obvTopY + (i / 5) * obvHeight;
      ctx.fillText(`${value}%`, padding - 10, y);
    }
  }
  
  // 'OBV' 세로 텍스트
  ctx.save();
  ctx.translate(8, obvTopY + obvHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('OBV', 0, 0);
  ctx.restore();
  
  // 평균선 그리기 (모든 티커의 평균 - 정규화된 좌표계에서)
  if (showAverage && dataMap.size > 0) {
    // 각 티커의 OBV 계산 및 min/max
    const obvBySymbol = new Map<string, { time: number; obv: number }[]>();
    const minMaxBySymbol = new Map<string, { min: number; max: number }>();
    
    dataMap.forEach((data, symbol) => {
      const obvValues = calculateOBV(data);
      const points: { time: number; obv: number }[] = [];
      data.forEach((d, i) => {
        const time = new Date(d.timestamp).getTime() / 1000;
        points.push({ time, obv: obvValues[i] });
      });
      obvBySymbol.set(symbol, points);
      
      if (obvValues.length > 0) {
        minMaxBySymbol.set(symbol, {
          min: Math.min(...obvValues),
          max: Math.max(...obvValues)
        });
      }
    });
    
    // 각 시점에서 모든 티커의 정규화된 Y 좌표를 평균내기
    const avgPoints: { time: number; avgY: number }[] = [];
    
    sortedTimes.forEach(time => {
      const yValues: number[] = [];
      
      obvBySymbol.forEach((points, symbol) => {
        const minMax = minMaxBySymbol.get(symbol);
        if (!minMax) return;
        
        // 해당 시점의 값 찾기 또는 보간
        let obvValue: number | null = null;
        
        const exactPoint = points.find(p => p.time === time);
        if (exactPoint) {
          obvValue = exactPoint.obv;
        } else {
          let prevPoint = null;
          let nextPoint = null;
          
          for (let i = 0; i < points.length; i++) {
            if (points[i].time < time) {
              prevPoint = points[i];
            } else if (points[i].time > time) {
              nextPoint = points[i];
              break;
            }
          }
          
          if (prevPoint && nextPoint) {
            const ratio = (time - prevPoint.time) / (nextPoint.time - prevPoint.time);
            obvValue = prevPoint.obv + (nextPoint.obv - prevPoint.obv) * ratio;
          } else if (prevPoint) {
            obvValue = prevPoint.obv;
          } else if (nextPoint) {
            obvValue = nextPoint.obv;
          }
        }
        
        if (obvValue !== null) {
          // 이 티커의 정규화된 Y 좌표 계산
          const yCoord = getY(obvValue, minMax.min, minMax.max);
          yValues.push(yCoord);
        }
      });
      
      if (yValues.length > 0) {
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        avgPoints.push({ time, avgY });
      }
    });
    
    if (avgPoints.length > 0) {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.globalAlpha = 1.0;
      
      ctx.beginPath();
      avgPoints.forEach((point, i) => {
        const x = getX(point.time);
        const y = point.avgY;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else if (useSmooth && i > 0) {
          const prevPoint = avgPoints[i - 1];
          const prevX = getX(prevPoint.time);
          const prevY = prevPoint.avgY;
          const cp1x = prevX + (x - prevX) / 3;
          const cp1y = prevY;
          const cp2x = prevX + (x - prevX) * 2 / 3;
          const cp2y = y;
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }
  }
}

function drawEventMarkers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  events: EventMarker[],
  sortedTimes: number[],
  chartBottom: number
) {
  if (!ctx || sortedTimes.length === 0 || events.length === 0) return;

  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const getX = (time: number): number => {
    return padding + ((time - minTime) / timeRange) * (width - padding * 2);
  };

  // 이벤트 마커 (전체 차트 영역에 걸쳐)
  events.forEach(event => {
    const eventTime = new Date(event.timestamp).getTime() / 1000;
    if (eventTime >= minTime && eventTime <= maxTime) {
      const x = getX(eventTime);
      const eventColor = event.color || '#FF6600';
      ctx.strokeStyle = eventColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, chartBottom);  // 차트 하단까지 그리기
      ctx.stroke();

      ctx.save();
      ctx.translate(x, padding - 10);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = eventColor;
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(event.label, 0, 0);
      ctx.restore();
    }
  });
}

function drawXAxisLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sortedTimes: number[]
) {
  if (!ctx || sortedTimes.length === 0) return;

  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const getX = (time: number): number => {
    return padding + ((time - minTime) / timeRange) * (width - padding * 2);
  };

  // X축 레이블
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  const firstTime = sortedTimes[0];
  const firstX = getX(firstTime);
  const firstDate = new Date(firstTime * 1000);
  ctx.fillText(`${firstDate.getMonth() + 1}/${firstDate.getDate()}`, firstX, height - padding + 20);

  ctx.textAlign = 'center';
  for (let i = 0; i < sortedTimes.length; i += Math.max(1, Math.floor(sortedTimes.length / 10))) {
    if (i === 0 || i === sortedTimes.length - 1) continue;
    const time = sortedTimes[i];
    const x = getX(time);
    const date = new Date(time * 1000);
    ctx.fillText(`${date.getMonth() + 1}/${date.getDate()}`, x, height - padding + 20);
  }

  const lastTime = sortedTimes[sortedTimes.length - 1];
  const lastX = getX(lastTime);
  const lastDate = new Date(lastTime * 1000);
  ctx.textAlign = 'right';
  ctx.fillText(`${lastDate.getMonth() + 1}/${lastDate.getDate()}`, lastX, height - padding + 20);
}

function drawOBVChartOld(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dataMap: Map<string, ChartData[]>,
  sortedTimes: number[]
) {
  if (!ctx || sortedTimes.length === 0) return;

  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const getX = (time: number): number => {
    return padding + ((time - minTime) / timeRange) * (width - padding * 2);
  };

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 그리드
  const gridDivisions = 10;
  const gridWidth = width - padding * 2;
  const gridHeight = height - padding * 2;
  const gridStepX = gridWidth / gridDivisions;
  const gridStepY = gridHeight / gridDivisions;
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridDivisions; i++) {
    const x = padding + gridStepX * i;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }
  for (let i = 0; i <= gridDivisions; i++) {
    const y = padding + gridStepY * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // 축
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();

  // OBV 렌더링
  let colorIndex = 0;
  dataMap.forEach((data, symbol) => {
    const obvValues = calculateOBV(data);
    
    if (obvValues.length === 0) {
      colorIndex++;
      return;
    }

    const obvMin = Math.min(...obvValues);
    const obvMax = Math.max(...obvValues);
    const obvRange = obvMax - obvMin || 1;

    const obvGetY = (value: number): number => {
      return height - padding - ((value - obvMin) / obvRange) * (height - padding * 2);
    };

    const obvColor = colors[colorIndex % colors.length];
    ctx.strokeStyle = obvColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    let firstPoint = true;
    for (let i = 0; i < obvValues.length; i++) {
      const time = new Date(data[i].timestamp).getTime() / 1000;
      if (time >= minTime && time <= maxTime) {
        const x = getX(time);
        const y = obvGetY(obvValues[i]);
        if (firstPoint) {
          ctx.moveTo(x, y);
          firstPoint = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }

    ctx.stroke();
    colorIndex++;
  });

  // Y축 레이블
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  for (let i = 0; i <= 5; i++) {
    const y = padding + (i / 5) * (height - padding * 2);
    ctx.fillText(`${(i * 20)}%`, padding - 10, y);
  }
  const legendY = 15;
  const legendItemWidth = 120;
  const legendLineWidth = 20;
  let itemX = padding + 10;
  colorIndex = 0;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '11px Arial';
  dataMap.forEach((_, symbol) => {
    const color = colors[colorIndex % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(itemX, legendY);
    ctx.lineTo(itemX + legendLineWidth, legendY);
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.fillText(symbol, itemX + legendLineWidth + 5, legendY);
    itemX += legendItemWidth;
    colorIndex++;
  });
}

// 날짜별로 데이터 그룹화 (시간을 00:00:00으로 통일)
function groupDataByDay(dataMap: Map<string, ChartData[]>): Map<string, ChartData[]> {
  const groupedMap = new Map<string, ChartData[]>();
  
  dataMap.forEach((data, symbol) => {
    const dailyMap = new Map<string, ChartData>();
    
    data.forEach(d => {
      // 날짜 부분만 추출 (YYYY-MM-DD)
      const dateOnly = d.timestamp.split(' ')[0];
      const dayKey = `${dateOnly} 00:00:00`;
      
      // 해당 날짜의 데이터가 없거나, 현재 데이터가 더 최신이면 업데이트
      if (!dailyMap.has(dayKey)) {
        dailyMap.set(dayKey, {
          timestamp: dayKey,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume
        });
      } else {
        // 같은 날짜의 데이터를 병합 (high는 최대, low는 최소, close는 마지막, volume은 합산)
        const existing = dailyMap.get(dayKey)!;
        existing.high = Math.max(existing.high, d.high);
        existing.low = Math.min(existing.low, d.low);
        existing.close = d.close; // 마지막 값 사용
        if (existing.volume !== undefined && d.volume !== undefined) {
          existing.volume += d.volume;
        }
      }
    });
    
    // Map을 배열로 변환하여 시간순 정렬
    const groupedData = Array.from(dailyMap.values()).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    groupedMap.set(symbol, groupedData);
  });
  
  return groupedMap;
}

let currentData: { dataMap: Map<string, ChartData[]>; events: EventMarker[] } | null = null;
let currentSortedTimes: number[] = [];
let showEvents = false;
let showCandles = false;
let showGaps = true;
let showVolume = false;
let showOBV = false;
let smoothMode: 'none' | 'smooth' | 'open' = 'none';  // 곱선 모드: 직선, 부드럽게, 시가반영
let showAverage = false;
let hideValues = false;
let dailyGroup = false;
let hideLines = false;
let showGrid = false;  // 기본값 false (그리드 숨김)
let showPoints = false;
let enabledTickers = new Set<string>();  // 상단 체크박스 - 데이터 필터링
let visibleTickers = new Set<string>();  // 범례 클릭 - 그래프 표시/숨김
let mouseX: number | null = null;
let mouseY: number | null = null;
let canvasWidth = 0;
let canvasHeight = 0;
let rangeMin = 0;  // X축 0-100%
let rangeMax = 100; // X축 0-100%
let legendItems: { symbol: string; x: number; y: number; width: number; height: number }[] = [];
let dataPoints: { symbol: string; x: number; y: number; value: number; time: number; chartType: string }[] = [];
let hoveredPoint: { symbol: string; x: number; y: number; value: number; time: number; chartType: string } | null = null;

// 줌/패닝 관련 변수
let zoomStart = 0;    // 줌 시작 위치 (0-100%)
let zoomEnd = 100;    // 줌 끝 위치 (0-100%)
let isDragging = false;
let dragStartX: number | null = null;
let dragCurrentX: number | null = null;
let isPanning = false;
let panStartX: number | null = null;
let zoomButtons: { type: string; x: number; y: number; width: number; height: number }[] = [];

function renderWithCrosshair() {
  if (!currentData || !canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
  const width = Math.max(300, cssW);
  let totalHeight = Math.max(200, cssH);
  
  // Price/Volume/OBV 레이아웃 계산 - padding 제외한 실제 그래프 영역을 균등 분할
  let priceChartHeight: number;
  let volumeChartHeight = 0;
  let obvChartHeight = 0;
  let volumeTopY = 0;
  let obvTopY = 0;
  
  // 표시할 차트 개수 계산
  let chartCount = 1; // Price는 항상 표시
  if (showVolume) chartCount++;
  if (showOBV) chartCount++;
  
  // x축 label 영역 확보 (40px)
  const xAxisLabelHeight = 40;
  
  // 전체 그래프 가용 영역 (상단 padding + 하단 x축 label 영역 제외)
  const availableHeight = totalHeight - padding - xAxisLabelHeight;
  
  // 가용 영역을 차트 개수로 균등 분할 (각 차트의 순수 높이)
  const heightPerChart = availableHeight / chartCount;
  
  if (showVolume && showOBV) {
    // Price, Volume, OBV 각 1/3
    priceChartHeight = padding + heightPerChart;  // 상단 padding + 순수 높이
    volumeChartHeight = heightPerChart;           // 순수 높이
    obvChartHeight = heightPerChart;              // 순수 높이
    volumeTopY = priceChartHeight;                // Price 끝나는 지점
    obvTopY = volumeTopY + volumeChartHeight;     // Volume 끝나는 지점
  } else if (showVolume) {
    // Price, Volume 각 1/2
    priceChartHeight = padding + heightPerChart;
    volumeChartHeight = heightPerChart;
    volumeTopY = priceChartHeight;
  } else if (showOBV) {
    // Price, OBV 각 1/2
    priceChartHeight = padding + heightPerChart;
    obvChartHeight = heightPerChart;
    obvTopY = priceChartHeight;
  } else {
    // Price만 100% (x축 label 영역 제외)
    priceChartHeight = totalHeight - xAxisLabelHeight;
  }
  
  canvas.width = width * dpr;
  canvas.height = totalHeight * dpr;
  canvasWidth = width;
  canvasHeight = totalHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  // 활성화된 티커만 필터링
  let filteredDataMap = new Map<string, ChartData[]>();
  currentData.dataMap.forEach((data, symbol) => {
    if (enabledTickers.has(symbol)) {
      filteredDataMap.set(symbol, data);
    }
  });
  
  // 일자별 그룹 적용
  if (dailyGroup) {
    filteredDataMap = groupDataByDay(filteredDataMap);
  }
  
  // X축 범위 필터링 적용 (rangeSlider와 zoom 모두 적용)
  // 시간 기반으로 필터링 (티커별로 타임스탬프가 다를 수 있으므로)
  
  // 먼저 전체 시간 범위 계산
  let globalMinTime = Infinity;
  let globalMaxTime = -Infinity;
  filteredDataMap.forEach((data) => {
    data.forEach(d => {
      const time = new Date(d.timestamp).getTime() / 1000;
      if (time < globalMinTime) globalMinTime = time;
      if (time > globalMaxTime) globalMaxTime = time;
    });
  });
  const globalTimeRange = globalMaxTime - globalMinTime || 1;
  
  // rangeSlider로 시간 범위 계산
  let targetMinTime = globalMinTime;
  let targetMaxTime = globalMaxTime;
  
  if (rangeMin > 0 || rangeMax < 100) {
    targetMinTime = globalMinTime + globalTimeRange * rangeMin / 100;
    targetMaxTime = globalMinTime + globalTimeRange * rangeMax / 100;
  }
  
  // zoom 범위 적용 (range 범위 내에서)
  if (zoomStart > 0 || zoomEnd < 100) {
    const rangeTimeSpan = targetMaxTime - targetMinTime;
    const zoomMinTime = targetMinTime + rangeTimeSpan * zoomStart / 100;
    const zoomMaxTime = targetMinTime + rangeTimeSpan * zoomEnd / 100;
    targetMinTime = zoomMinTime;
    targetMaxTime = zoomMaxTime;
  }
  
  // 시간 기반으로 각 티커 필터링 (앞뒤 1개씩 더 포함)
  let baseFilteredMap = filteredDataMap;
  if (rangeMin > 0 || rangeMax < 100 || zoomStart > 0 || zoomEnd < 100) {
    const timeFilteredMap = new Map<string, ChartData[]>();
    filteredDataMap.forEach((data, symbol) => {
      if (data.length === 0) {
        timeFilteredMap.set(symbol, []);
        return;
      }
      
      // 시간 범위에 해당하는 인덱스 찾기
      let startIdx = -1;
      let endIdx = -1;
      for (let i = 0; i < data.length; i++) {
        const time = new Date(data[i].timestamp).getTime() / 1000;
        if (time >= targetMinTime && startIdx === -1) {
          startIdx = i;
        }
        if (time <= targetMaxTime) {
          endIdx = i;
        }
      }
      
      if (startIdx === -1 || endIdx === -1) {
        // 범위에 데이터가 없으면 빈 배열
        timeFilteredMap.set(symbol, []);
        return;
      }
      
      // 앞뒤로 1개씩 더 포함
      const actualStartIdx = Math.max(0, startIdx - 1);
      const actualEndIdx = Math.min(data.length - 1, endIdx + 1);
      timeFilteredMap.set(symbol, data.slice(actualStartIdx, actualEndIdx + 1));
    });
    filteredDataMap = timeFilteredMap;
  }
  
  // 시간 포인트 수집
  const allTimePoints = new Set<number>();
  filteredDataMap.forEach((data) => {
    data.forEach(d => {
      const time = new Date(d.timestamp).getTime() / 1000;
      allTimePoints.add(time);
    });
  });
  const sortedTimes = Array.from(allTimePoints).sort((a, b) => a - b);
  currentSortedTimes = sortedTimes; // 전역 변수에 저장
  
  // 화면에 표시할 시간 범위 (앞뒤 추가 포인트 제외)
  const displayMinTime = targetMinTime;
  const displayMaxTime = targetMaxTime;
  
  // Price 차트 그리기
  drawSimpleOverlayChart(ctx, width, totalHeight, filteredDataMap, currentData.events, showEvents, showCandles, showGaps, showVolume || showOBV, priceChartHeight, smoothMode, showAverage, hideValues, hideLines, displayMinTime, displayMaxTime);
  
  // Volume 렌더링
  if (showVolume) {
    drawVolumeChart(ctx, width, totalHeight, volumeTopY, volumeTopY, volumeChartHeight, filteredDataMap, sortedTimes, showGaps, smoothMode !== 'none', showAverage, hideValues, hideLines, displayMinTime, displayMaxTime);
  }
  
  // OBV 렌더링
  if (showOBV) {
    drawOBVChart(ctx, width, totalHeight, obvTopY, obvTopY, obvChartHeight, filteredDataMap, sortedTimes, showGaps, smoothMode !== 'none', showAverage, hideValues, hideLines, displayMinTime, displayMaxTime);
  }

  // 차트 간 구분선 그리기
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  if (showVolume) {
    ctx.beginPath();
    ctx.moveTo(padding, volumeTopY);
    ctx.lineTo(width - padding, volumeTopY);
    ctx.stroke();
  }
  if (showOBV) {
    ctx.beginPath();
    ctx.moveTo(padding, obvTopY);
    ctx.lineTo(width - padding, obvTopY);
    ctx.stroke();
  }

  // 이벤트 마커 (전체 패널에 걸쳐)
  if (showEvents) {
    // 차트 영역의 실제 하단 계산
    let chartBottom = priceChartHeight;
    if (showVolume && volumeChartHeight > 0) {
      chartBottom = volumeTopY + volumeChartHeight;
    }
    if (showOBV && obvChartHeight > 0) {
      chartBottom = obvTopY + obvChartHeight;
    }
    drawEventMarkers(ctx, width, totalHeight, currentData.events, sortedTimes, chartBottom);
  }

  // X축 레이블 (항상 표시)
  drawXAxisLabels(ctx, width, totalHeight, sortedTimes);

  // 포인트 그리기 (showPoints가 켜져있을 때)
  if (showPoints) {
    dataPoints = []; // 초기화
    drawDataPoints(ctx, width, filteredDataMap, sortedTimes, priceChartHeight, volumeTopY, volumeChartHeight, obvTopY, obvChartHeight, showVolume, showOBV, displayMinTime, displayMaxTime);
  } else {
    dataPoints = [];
  }

  // 호버된 포인트 툴팁 표시
  if (showPoints && hoveredPoint) {
    drawPointTooltip(ctx, hoveredPoint);
  }

  // 줌 버튼 그리기 (우측 상단)
  drawZoomButtons(ctx, width);

  // 드래그 선택 영역 그리기
  if (isDragging && dragStartX !== null && dragCurrentX !== null) {
    const selectionLeft = Math.min(dragStartX, dragCurrentX);
    const selectionWidth = Math.abs(dragCurrentX - dragStartX);
    
    // 차트 영역의 실제 하단 계산
    let chartBottom = priceChartHeight;
    if (showVolume && volumeChartHeight > 0) {
      chartBottom = volumeTopY + volumeChartHeight;
    }
    if (showOBV && obvChartHeight > 0) {
      chartBottom = obvTopY + obvChartHeight;
    }
    
    ctx.fillStyle = 'rgba(74, 144, 217, 0.2)';
    ctx.fillRect(selectionLeft, padding, selectionWidth, chartBottom - padding);
    
    ctx.strokeStyle = '#4a90d9';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(selectionLeft, padding, selectionWidth, chartBottom - padding);
    ctx.setLineDash([]);
  }

  // 크로스헤어 그리기 (전체 영역) - 드래그 중이 아닐 때만
  if (mouseX !== null && mouseY !== null && !isDragging && !isPanning) {
    drawCrosshair(ctx, width, totalHeight, mouseX, mouseY, priceChartHeight, volumeTopY, volumeChartHeight, obvTopY, obvChartHeight, showVolume, showOBV);
  }
}

function drawZoomButtons(ctx: CanvasRenderingContext2D, width: number) {
  const buttonSize = 24;
  const buttonGap = 6;
  const startX = width - padding - (buttonSize * 3 + buttonGap * 2);
  const startY = padding + 5;
  
  zoomButtons = [];
  
  const buttons = [
    { type: 'zoomIn', label: '+' },
    { type: 'zoomOut', label: '−' },
    { type: 'reset', label: '↺' }
  ];
  
  buttons.forEach((btn, i) => {
    const x = startX + i * (buttonSize + buttonGap);
    const y = startY;
    
    // 버튼 배경
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, buttonSize, buttonSize, 4);
    ctx.fill();
    ctx.stroke();
    
    // 버튼 텍스트
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, x + buttonSize / 2, y + buttonSize / 2);
    
    zoomButtons.push({ type: btn.type, x, y, width: buttonSize, height: buttonSize });
  });
  
  // 현재 줌 상태 표시 (확대 중일 때만)
  if (zoomStart > 0 || zoomEnd < 100) {
    ctx.font = '10px Arial';
    ctx.fillStyle = '#666';
    ctx.textAlign = 'left';
    ctx.fillText(`${zoomStart.toFixed(0)}%-${zoomEnd.toFixed(0)}%`, startX, startY + buttonSize + 12);
  }
}

function drawDataPoints(
  ctx: CanvasRenderingContext2D,
  width: number,
  dataMap: Map<string, ChartData[]>,
  sortedTimes: number[],
  priceHeight: number,
  volumeTopY: number,
  volumeHeight: number,
  obvTopY: number,
  obvHeight: number,
  hasVolume: boolean,
  hasOBV: boolean,
  displayMinTime?: number,
  displayMaxTime?: number
) {
  if (sortedTimes.length === 0) return;

  // displayMinTime/displayMaxTime이 전달되면 해당 범위로 X축 고정
  const minTime = displayMinTime ?? sortedTimes[0];
  const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const getX = (time: number): number => {
    return padding + ((time - minTime) / timeRange) * (width - padding * 2);
  };

  // Price 영역
  const graphTop = padding;
  const graphBottom = priceHeight;
  const graphHeight = graphBottom - graphTop;

  // 각 티커별 min/max 계산
  const minMaxBySymbol = new Map<string, { min: number; max: number }>();
  const volumeMinMaxBySymbol = new Map<string, { min: number; max: number }>();
  const obvMinMaxBySymbol = new Map<string, { min: number; max: number; values: number[] }>();

  dataMap.forEach((data, symbol) => {
    // Price min/max
    const closes = data.map(d => d.close).filter(c => c > 0);
    if (closes.length > 0) {
      minMaxBySymbol.set(symbol, { min: Math.min(...closes), max: Math.max(...closes) });
    }
    // Volume min/max
    const volumes = data.map(d => d.volume || 0).filter(v => v > 0);
    if (volumes.length > 0) {
      volumeMinMaxBySymbol.set(symbol, { min: Math.min(...volumes), max: Math.max(...volumes) });
    }
    // OBV min/max
    const obvValues = calculateOBV(data);
    if (obvValues.length > 0) {
      obvMinMaxBySymbol.set(symbol, { min: Math.min(...obvValues), max: Math.max(...obvValues), values: obvValues });
    }
  });

  let colorIndex = 0;
  const pointRadius = 2;
  const clipLeft = padding;
  const clipRight = width - padding;

  dataMap.forEach((data, symbol) => {
    if (!visibleTickers.has(symbol)) {
      colorIndex++;
      return;
    }

    const color = colors[colorIndex % colors.length];
    const priceMinMax = minMaxBySymbol.get(symbol);
    const volumeMinMax = volumeMinMaxBySymbol.get(symbol);
    const obvData = obvMinMaxBySymbol.get(symbol);

    // Price 포인트
    if (priceMinMax) {
      data.forEach(d => {
        if (!d.close || d.close <= 0) return;
        const time = new Date(d.timestamp).getTime() / 1000;
        if (time < minTime || time > maxTime) return;

        const x = getX(time);
        // 클리핑 영역 체크
        if (x < clipLeft || x > clipRight) return;
        
        const normalizedValue = (d.close - priceMinMax.min) / (priceMinMax.max - priceMinMax.min || 1);
        const y = graphTop + (1 - normalizedValue) * graphHeight;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fill();

        dataPoints.push({ symbol, x, y, value: d.close, time, chartType: 'Price' });
      });
    }

    // Volume 포인트
    if (hasVolume && volumeHeight > 0 && volumeMinMax) {
      data.forEach(d => {
        const volume = d.volume || 0;
        if (volume <= 0) return;
        const time = new Date(d.timestamp).getTime() / 1000;
        if (time < minTime || time > maxTime) return;

        const x = getX(time);
        // 클리핑 영역 체크
        if (x < clipLeft || x > clipRight) return;
        
        const normalizedValue = (volume - volumeMinMax.min) / (volumeMinMax.max - volumeMinMax.min || 1);
        const y = volumeTopY + (1 - normalizedValue) * volumeHeight;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fill();

        dataPoints.push({ symbol, x, y, value: volume, time, chartType: 'Volume' });
      });
    }

    // OBV 포인트
    if (hasOBV && obvHeight > 0 && obvData) {
      const obvValues = obvData.values;
      data.forEach((d, i) => {
        if (i >= obvValues.length) return;
        const time = new Date(d.timestamp).getTime() / 1000;
        if (time < minTime || time > maxTime) return;

        const x = getX(time);
        // 클리핑 영역 체크
        if (x < clipLeft || x > clipRight) return;
        
        const normalizedValue = (obvValues[i] - obvData.min) / (obvData.max - obvData.min || 1);
        const y = obvTopY + (1 - normalizedValue) * obvHeight;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
        ctx.fill();

        dataPoints.push({ symbol, x, y, value: obvValues[i], time, chartType: 'OBV' });
      });
    }

    colorIndex++;
  });
}

function drawPointTooltip(
  ctx: CanvasRenderingContext2D,
  point: { symbol: string; x: number; y: number; value: number; time: number; chartType: string }
) {
  const date = new Date(point.time * 1000);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  
  let valueStr: string;
  if (point.chartType === 'Volume' || point.chartType === 'OBV') {
    valueStr = point.value.toLocaleString();
  } else {
    valueStr = point.value.toFixed(2);
  }
  
  const text = `${point.symbol} (${point.chartType}): ${valueStr}`;
  const subText = dateStr;
  
  ctx.font = 'bold 11px Arial';
  const textWidth = Math.max(ctx.measureText(text).width, ctx.measureText(subText).width);
  const tooltipWidth = textWidth + 16;
  const tooltipHeight = 36;
  
  // 툴팁 위치 (포인트 우상단, 화면 밖으로 나가면 조정)
  let tooltipX = point.x + 10;
  let tooltipY = point.y - tooltipHeight - 5;
  
  if (tooltipX + tooltipWidth > canvasWidth - padding) {
    tooltipX = point.x - tooltipWidth - 10;
  }
  if (tooltipY < padding) {
    tooltipY = point.y + 10;
  }
  
  // 툴팁 배경
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.beginPath();
  ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4);
  ctx.fill();
  
  // 툴팁 텍스트
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, tooltipX + 8, tooltipY + 6);
  ctx.font = '10px Arial';
  ctx.fillStyle = '#AAAAAA';
  ctx.fillText(subText, tooltipX + 8, tooltipY + 20);
}

function drawCrosshair(
  ctx: CanvasRenderingContext2D, 
  width: number, 
  height: number, 
  x: number, 
  y: number, 
  priceHeight: number,
  volumeTopY: number,
  volumeHeight: number,
  obvTopY: number,
  obvHeight: number,
  hasVolume: boolean,
  hasOBV: boolean
) {
  // 그래프 영역 내부인지 확인 (X축: padding ~ width-padding)
  if (x < padding || x > width - padding) return;
  
  // Y축 영역 확인 - 차트 영역 내부인지
  const xAxisLabelHeight = 40;
  const bottomLimit = height - xAxisLabelHeight;
  let isInChartArea = false;
  
  // Price 영역
  if (y >= padding && y <= priceHeight) {
    isInChartArea = true;
  }
  // Volume 영역
  if (hasVolume && volumeHeight > 0 && y >= volumeTopY && y <= volumeTopY + volumeHeight) {
    isInChartArea = true;
  }
  // OBV 영역
  if (hasOBV && obvHeight > 0 && y >= obvTopY && y <= obvTopY + obvHeight) {
    isInChartArea = true;
  }
  
  if (!isInChartArea) return;
  
  // 차트 영역의 실제 하단 계산
  let chartBottom = priceHeight;
  if (hasVolume && volumeHeight > 0) {
    chartBottom = volumeTopY + volumeHeight;
  }
  if (hasOBV && obvHeight > 0) {
    chartBottom = obvTopY + obvHeight;
  }
  
  // 수직선 (차트 영역만)
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, padding);
  ctx.lineTo(x, chartBottom);
  ctx.stroke();

  // 수평선
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 날짜 표시 (하단) - 현재 표시 중인 데이터의 시간 사용
  const timePercent = (x - padding) / (width - padding * 2);
  
  if (currentSortedTimes.length > 0) {
    const minTime = currentSortedTimes[0];
    const maxTime = currentSortedTimes[currentSortedTimes.length - 1];
    const timeRange = maxTime - minTime || 1;
    const currentTime = minTime + timePercent * timeRange;
    const date = new Date(currentTime * 1000);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(dateStr, x, height - padding + 35);
  }

  // 값(%) 표시 (좌측) - 영역별로 구분
  let valueStr = '';
  
  // Price 영역: padding ~ priceHeight (하단 padding 없음)
  if (y >= padding && y <= priceHeight) {
    // Price 영역
    const graphHeight = priceHeight - padding;
    const valuePercent = 100 - ((y - padding) / graphHeight) * 100;
    valueStr = `${valuePercent.toFixed(1)}%`;
  } else if (hasVolume && volumeHeight > 0 && y >= volumeTopY && y <= volumeTopY + volumeHeight) {
    // Volume 영역
    const localY = y - volumeTopY;
    const valuePercent = 100 - (localY / volumeHeight) * 100;
    valueStr = `${valuePercent.toFixed(1)}%`;
  } else if (hasOBV && obvHeight > 0 && y >= obvTopY && y <= obvTopY + obvHeight) {
    // OBV 영역
    const localY = y - obvTopY;
    const valuePercent = 100 - (localY / obvHeight) * 100;
    valueStr = `${valuePercent.toFixed(1)}%`;
  }
  
  if (valueStr) {
    ctx.fillStyle = '#333333';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(valueStr, padding - 15, y);
  }
}

function render() {
  renderWithCrosshair();
}

(async function bootstrap() {
  currentData = await loadData();
  setStatus('Ready');

  // 티커 토글 버튼 생성
  const tickerListEl = document.getElementById('ticker-list');
  const toggleAllTickersEl = document.getElementById('toggle-all-tickers') as HTMLInputElement | null;
  
  if (currentData && tickerListEl) {
    // 모든 티커를 기본적으로 활성화 및 표시
    currentData.dataMap.forEach((_, symbol) => {
      enabledTickers.add(symbol);
      visibleTickers.add(symbol);  // 범례 토글용도 기본 표시
    });
    
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
          visibleTickers.add(symbol);  // 데이터 활성화 시 표시도 켜짐
        } else {
          enabledTickers.delete(symbol);
          visibleTickers.delete(symbol);  // 데이터 비활성화 시 표시도 끔
        }
        
        // 전체 토글 상태 업데이트
        if (toggleAllTickersEl) {
          toggleAllTickersEl.checked = enabledTickers.size === currentData!.dataMap.size;
        }
        
        render();
      });
      
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(symbol));
      tickerListEl.appendChild(label);
    });
    
    // 전체 토글 이벤트
    if (toggleAllTickersEl) {
      toggleAllTickersEl.addEventListener('change', () => {
        const isChecked = toggleAllTickersEl.checked;
        
        if (isChecked) {
          // 모두 활성화
          currentData!.dataMap.forEach((_, symbol) => {
            enabledTickers.add(symbol);
            visibleTickers.add(symbol);  // 표시도 켜짐
            const checkbox = document.getElementById(`toggle-ticker-${symbol}`) as HTMLInputElement;
            if (checkbox) checkbox.checked = true;
          });
        } else {
          // 모두 비활성화
          enabledTickers.clear();
          visibleTickers.clear();  // 표시도 끔
          currentData!.dataMap.forEach((_, symbol) => {
            const checkbox = document.getElementById(`toggle-ticker-${symbol}`) as HTMLInputElement;
            if (checkbox) checkbox.checked = false;
          });
        }
        
        render();
      });
    }
  }

  if (toggleEventsEl) {
    toggleEventsEl.checked = showEvents;
    toggleEventsEl.addEventListener('change', () => {
      showEvents = toggleEventsEl.checked;
      render();
    });
  }

  if (toggleCandlesEl) {
    toggleCandlesEl.checked = showCandles;
    toggleCandlesEl.addEventListener('change', () => {
      showCandles = toggleCandlesEl.checked;
      render();
    });
  }

  if (toggleGapsEl) {
    toggleGapsEl.checked = !showGaps;
    toggleGapsEl.addEventListener('change', () => {
      showGaps = !toggleGapsEl.checked;
      render();
    });
  }

  if (toggleVolumeEl) {
    toggleVolumeEl.checked = showVolume;
    toggleVolumeEl.addEventListener('change', () => {
      showVolume = toggleVolumeEl.checked;
      render();
    });
  }

  if (toggleOBVEl) {
    toggleOBVEl.checked = showOBV;
    toggleOBVEl.addEventListener('change', () => {
      showOBV = toggleOBVEl.checked;
      render();
    });
  }

  // 곡선 모드 라디오 버튼
  if (smoothModeRadios.length > 0) {
    smoothModeRadios.forEach(radio => {
      if (radio.value === smoothMode) {
        radio.checked = true;
      }
      radio.addEventListener('change', () => {
        if (radio.checked) {
          smoothMode = radio.value as 'none' | 'smooth' | 'open';
          render();
        }
      });
    });
  }

  if (toggleAverageEl) {
    toggleAverageEl.checked = showAverage;
    toggleAverageEl.addEventListener('change', () => {
      showAverage = toggleAverageEl.checked;
      render();
    });
  }

  if (toggleHideValuesEl) {
    toggleHideValuesEl.checked = hideValues;
    toggleHideValuesEl.addEventListener('change', () => {
      hideValues = toggleHideValuesEl.checked;
      render();
    });
  }

  if (toggleDailyGroupEl) {
    toggleDailyGroupEl.checked = dailyGroup;
    toggleDailyGroupEl.addEventListener('change', () => {
      dailyGroup = toggleDailyGroupEl.checked;
      render();
    });
  }

  if (toggleHideLinesEl) {
    toggleHideLinesEl.checked = hideLines;
    toggleHideLinesEl.addEventListener('change', () => {
      hideLines = toggleHideLinesEl.checked;
      render();
    });
  }

  if (toggleShowGridEl) {
    toggleShowGridEl.checked = showGrid;
    toggleShowGridEl.addEventListener('change', () => {
      showGrid = toggleShowGridEl.checked;
      render();
    });
  }

  if (toggleShowPointsEl) {
    toggleShowPointsEl.checked = showPoints;
    toggleShowPointsEl.addEventListener('change', () => {
      showPoints = toggleShowPointsEl.checked;
      if (!showPoints) {
        hoveredPoint = null;
      }
      render();
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
      render();
    });

    rangeMaxEl.addEventListener('input', () => {
      let val = parseInt(rangeMaxEl.value, 10);
      if (val < rangeMin + 1) {
        val = rangeMin + 1;
        rangeMaxEl.value = String(val);
      }
      rangeMax = val;
      updateRangeSlider();
      render();
    });

    updateRangeSlider();
  }

  render();
  window.addEventListener('resize', render);

  // 그래프 영역인지 확인하는 함수
  function isInChartArea(x: number, y: number): boolean {
    return x >= padding && x <= canvasWidth - padding && y >= padding;
  }

  // 줌 인 함수
  function zoomIn() {
    const range = zoomEnd - zoomStart;
    if (range <= 10) return; // 최소 10% 범위
    const center = (zoomStart + zoomEnd) / 2;
    const newRange = range * 0.7;
    zoomStart = Math.max(0, center - newRange / 2);
    zoomEnd = Math.min(100, center + newRange / 2);
    render();
  }

  // 줌 아웃 함수
  function zoomOut() {
    const range = zoomEnd - zoomStart;
    if (range >= 100) return;
    const center = (zoomStart + zoomEnd) / 2;
    const newRange = Math.min(100, range * 1.4);
    zoomStart = Math.max(0, center - newRange / 2);
    zoomEnd = Math.min(100, center + newRange / 2);
    // 경계 조정
    if (zoomStart < 0) {
      zoomEnd -= zoomStart;
      zoomStart = 0;
    }
    if (zoomEnd > 100) {
      zoomStart -= (zoomEnd - 100);
      zoomEnd = 100;
    }
    render();
  }

  // 줌 리셋 함수
  function zoomReset() {
    zoomStart = 0;
    zoomEnd = 100;
    render();
  }

  // 마우스 인터렉션
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    
    // 드래그 선택 중
    if (isDragging && dragStartX !== null) {
      dragCurrentX = Math.max(padding, Math.min(canvasWidth - padding, mouseX));
      render();
      return;
    }
    
    // 패닝 중
    if (isPanning && panStartX !== null) {
      const dx = mouseX - panStartX;
      const pixelRange = canvasWidth - padding * 2;
      const percentDelta = (dx / pixelRange) * (zoomEnd - zoomStart);
      
      let newStart = zoomStart - percentDelta;
      let newEnd = zoomEnd - percentDelta;
      
      // 경계 체크
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > 100) {
        newStart -= (newEnd - 100);
        newEnd = 100;
      }
      
      zoomStart = Math.max(0, newStart);
      zoomEnd = Math.min(100, newEnd);
      panStartX = mouseX;
      render();
      return;
    }
    
    // 포인트 호버 감지
    if (showPoints && dataPoints.length > 0) {
      const hoverRadius = 6; // 호버 감지 반경
      let foundPoint = null;
      for (const point of dataPoints) {
        const dx = mouseX - point.x;
        const dy = mouseY - point.y;
        if (Math.sqrt(dx * dx + dy * dy) <= hoverRadius) {
          foundPoint = point;
          break;
        }
      }
      hoveredPoint = foundPoint;
    }
    
    // 커서 변경
    let cursor = 'crosshair';
    
    // 줌 버튼 위
    for (const btn of zoomButtons) {
      if (mouseX >= btn.x && mouseX <= btn.x + btn.width &&
          mouseY >= btn.y && mouseY <= btn.y + btn.height) {
        cursor = 'pointer';
        break;
      }
    }
    
    // 범례 위
    for (const item of legendItems) {
      if (mouseX >= item.x && mouseX <= item.x + item.width &&
          mouseY >= item.y && mouseY <= item.y + item.height) {
        cursor = 'pointer';
        break;
      }
    }
    
    // 확대 중이면서 차트 영역이면 grab 커서
    if ((zoomStart > 0 || zoomEnd < 100) && isInChartArea(mouseX, mouseY) && cursor === 'crosshair') {
      cursor = 'grab';
    }
    
    canvas.style.cursor = cursor;
    render();
  });

  canvas.addEventListener('mouseleave', () => {
    mouseX = null;
    mouseY = null;
    hoveredPoint = null;
    isDragging = false;
    dragStartX = null;
    dragCurrentX = null;
    isPanning = false;
    panStartX = null;
    render();
  });

  // 마우스 다운 - 드래그 시작
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 줌 버튼 클릭 확인
    for (const btn of zoomButtons) {
      if (x >= btn.x && x <= btn.x + btn.width &&
          y >= btn.y && y <= btn.y + btn.height) {
        return; // 버튼 클릭은 click 이벤트에서 처리
      }
    }
    
    // 범례 클릭 확인
    for (const item of legendItems) {
      if (x >= item.x && x <= item.x + item.width &&
          y >= item.y && y <= item.y + item.height) {
        return; // 범례 클릭은 click 이벤트에서 처리
      }
    }
    
    // 차트 영역에서 드래그 시작
    if (isInChartArea(x, y)) {
      // 확대 중이면 패닝
      if (zoomStart > 0 || zoomEnd < 100) {
        isPanning = true;
        panStartX = x;
        canvas.style.cursor = 'grabbing';
      } else {
        // 확대 안된 상태면 드래그 선택
        isDragging = true;
        dragStartX = x;
        dragCurrentX = x;
      }
    }
  });

  // 마우스 업 - 드래그 종료
  canvas.addEventListener('mouseup', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // 드래그 선택 종료 → 줌 적용
    if (isDragging && dragStartX !== null && dragCurrentX !== null) {
      const startX = Math.min(dragStartX, dragCurrentX);
      const endX = Math.max(dragStartX, dragCurrentX);
      const selectionWidth = endX - startX;
      
      // 최소 드래그 거리 (10px 이상일 때만 줌)
      if (selectionWidth > 10) {
        const chartWidth = canvasWidth - padding * 2;
        const startPercent = ((startX - padding) / chartWidth) * 100;
        const endPercent = ((endX - padding) / chartWidth) * 100;
        
        // 현재 줌 범위 내에서의 상대적 위치로 변환
        const currentRange = zoomEnd - zoomStart;
        zoomStart = zoomStart + (startPercent / 100) * currentRange;
        zoomEnd = zoomStart + ((endPercent - startPercent) / 100) * currentRange;
        
        // 경계 체크
        zoomStart = Math.max(0, zoomStart);
        zoomEnd = Math.min(100, zoomEnd);
      }
      
      isDragging = false;
      dragStartX = null;
      dragCurrentX = null;
      render();
      return;
    }
    
    // 패닝 종료
    if (isPanning) {
      isPanning = false;
      panStartX = null;
      canvas.style.cursor = 'grab';
      render();
    }
  });

  // 클릭 이벤트 - 줌 버튼, 범례, 포인트
  canvas.addEventListener('click', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // 줌 버튼 클릭 확인
    for (const btn of zoomButtons) {
      if (clickX >= btn.x && clickX <= btn.x + btn.width &&
          clickY >= btn.y && clickY <= btn.y + btn.height) {
        if (btn.type === 'zoomIn') zoomIn();
        else if (btn.type === 'zoomOut') zoomOut();
        else if (btn.type === 'reset') zoomReset();
        return;
      }
    }
    
    // 포인트 클릭 감지 (모바일 터치)
    if (showPoints && dataPoints.length > 0) {
      const clickRadius = 12; // 클릭 감지 반경 (터치 친화적)
      for (const point of dataPoints) {
        const dx = clickX - point.x;
        const dy = clickY - point.y;
        if (Math.sqrt(dx * dx + dy * dy) <= clickRadius) {
          hoveredPoint = hoveredPoint === point ? null : point; // 토글
          render();
          return;
        }
      }
    }
    
    // 범례 영역 클릭 확인
    for (const item of legendItems) {
      if (clickX >= item.x && clickX <= item.x + item.width &&
          clickY >= item.y && clickY <= item.y + item.height) {
        // 그래프 표시/숨김 토글 (데이터는 유지)
        if (visibleTickers.has(item.symbol)) {
          visibleTickers.delete(item.symbol);
        } else {
          visibleTickers.add(item.symbol);
        }
        
        render();
        break;
      }
    }
  });

  // 휠로 줌
  canvas.addEventListener('wheel', (e: WheelEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (isInChartArea(x, y)) {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }
  }, { passive: false });

  // ===== 모바일 터치 이벤트 =====
  let touchStartX: number | null = null;
  let touchStartY: number | null = null;
  let lastPinchDistance: number | null = null;
  let isTouchDragging = false;
  let isTouchPanning = false;

  // 두 터치 포인트 사이의 거리 계산
  function getPinchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // 터치 시작
  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // 두 손가락 터치 = 핀치 줌 준비
    if (e.touches.length === 2) {
      lastPinchDistance = getPinchDistance(e.touches);
      isTouchDragging = false;
      isTouchPanning = false;
      return;
    }

    // 줌 버튼 터치 확인
    for (const btn of zoomButtons) {
      if (x >= btn.x && x <= btn.x + btn.width &&
          y >= btn.y && y <= btn.y + btn.height) {
        // 버튼 터치는 touchend에서 처리
        return;
      }
    }

    // 차트 영역 터치
    if (isInChartArea(x, y)) {
      touchStartX = x;
      touchStartY = y;
      
      // 확대 중이면 패닝, 아니면 드래그 선택
      if (zoomStart > 0 || zoomEnd < 100) {
        isTouchPanning = true;
        panStartX = x;
      } else {
        isTouchDragging = true;
        dragStartX = x;
        dragCurrentX = x;
      }
    }
  }, { passive: true });

  // 터치 이동
  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    const rect = canvas.getBoundingClientRect();

    // 핀치 줌
    if (e.touches.length === 2 && lastPinchDistance !== null) {
      e.preventDefault();
      const newDistance = getPinchDistance(e.touches);
      const delta = newDistance - lastPinchDistance;
      
      if (Math.abs(delta) > 10) { // 최소 변화량
        if (delta > 0) {
          zoomIn();
        } else {
          zoomOut();
        }
        lastPinchDistance = newDistance;
      }
      return;
    }

    if (e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // 드래그 선택 중
    if (isTouchDragging && dragStartX !== null) {
      e.preventDefault();
      dragCurrentX = Math.max(padding, Math.min(canvasWidth - padding, x));
      isDragging = true; // 렌더링용
      render();
      return;
    }

    // 패닝 중
    if (isTouchPanning && panStartX !== null) {
      e.preventDefault();
      const dx = x - panStartX;
      const pixelRange = canvasWidth - padding * 2;
      const percentDelta = (dx / pixelRange) * (zoomEnd - zoomStart);
      
      let newStart = zoomStart - percentDelta;
      let newEnd = zoomEnd - percentDelta;
      
      // 경계 체크
      if (newStart < 0) {
        newEnd -= newStart;
        newStart = 0;
      }
      if (newEnd > 100) {
        newStart -= (newEnd - 100);
        newEnd = 100;
      }
      
      zoomStart = Math.max(0, newStart);
      zoomEnd = Math.min(100, newEnd);
      panStartX = x;
      render();
      return;
    }
  }, { passive: false });

  // 터치 종료
  canvas.addEventListener('touchend', (e: TouchEvent) => {
    const rect = canvas.getBoundingClientRect();

    // 핀치 줌 종료
    if (lastPinchDistance !== null) {
      lastPinchDistance = null;
      return;
    }

    // 드래그 선택 종료 → 줌 적용
    if (isTouchDragging && dragStartX !== null && dragCurrentX !== null) {
      const startX = Math.min(dragStartX, dragCurrentX);
      const endX = Math.max(dragStartX, dragCurrentX);
      const selectionWidth = endX - startX;
      
      // 최소 드래그 거리 (20px 이상일 때만 줌 - 터치는 좀 더 여유있게)
      if (selectionWidth > 20) {
        const chartWidth = canvasWidth - padding * 2;
        const startPercent = ((startX - padding) / chartWidth) * 100;
        const endPercent = ((endX - padding) / chartWidth) * 100;
        
        // 현재 줌 범위 내에서의 상대적 위치로 변환
        const currentRange = zoomEnd - zoomStart;
        zoomStart = zoomStart + (startPercent / 100) * currentRange;
        zoomEnd = zoomStart + ((endPercent - startPercent) / 100) * currentRange;
        
        // 경계 체크
        zoomStart = Math.max(0, zoomStart);
        zoomEnd = Math.min(100, zoomEnd);
      } else if (selectionWidth < 10 && touchStartX !== null && touchStartY !== null) {
        // 짧은 터치 = 탭으로 처리 (줌 버튼, 범례, 포인트 클릭)
        const tapX = touchStartX;
        const tapY = touchStartY;
        
        // 줌 버튼 탭 확인
        for (const btn of zoomButtons) {
          if (tapX >= btn.x && tapX <= btn.x + btn.width &&
              tapY >= btn.y && tapY <= btn.y + btn.height) {
            if (btn.type === 'zoomIn') zoomIn();
            else if (btn.type === 'zoomOut') zoomOut();
            else if (btn.type === 'reset') zoomReset();
            break;
          }
        }
        
        // 포인트 탭 확인
        if (showPoints && dataPoints.length > 0) {
          const tapRadius = 20; // 터치 친화적 반경
          for (const point of dataPoints) {
            const dx = tapX - point.x;
            const dy = tapY - point.y;
            if (Math.sqrt(dx * dx + dy * dy) <= tapRadius) {
              hoveredPoint = hoveredPoint === point ? null : point;
              break;
            }
          }
        }
        
        // 범례 탭 확인
        for (const item of legendItems) {
          if (tapX >= item.x && tapX <= item.x + item.width &&
              tapY >= item.y && tapY <= item.y + item.height) {
            if (visibleTickers.has(item.symbol)) {
              visibleTickers.delete(item.symbol);
            } else {
              visibleTickers.add(item.symbol);
            }
            break;
          }
        }
      }
      
      isTouchDragging = false;
      isDragging = false;
      dragStartX = null;
      dragCurrentX = null;
      render();
      return;
    }

    // 패닝 종료
    if (isTouchPanning) {
      isTouchPanning = false;
      panStartX = null;
      render();
    }

    touchStartX = null;
    touchStartY = null;
  }, { passive: true });

  // 터치 취소
  canvas.addEventListener('touchcancel', () => {
    isTouchDragging = false;
    isTouchPanning = false;
    isDragging = false;
    dragStartX = null;
    dragCurrentX = null;
    panStartX = null;
    touchStartX = null;
    touchStartY = null;
    lastPinchDistance = null;
    render();
  }, { passive: true });
})();
