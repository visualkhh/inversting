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
const toggleSmoothEl = document.getElementById('toggle-smooth') as HTMLInputElement | null;
const toggleAverageEl = document.getElementById('toggle-average') as HTMLInputElement | null;
const toggleHideValuesEl = document.getElementById('toggle-hide-values') as HTMLInputElement | null;
const toggleDailyGroupEl = document.getElementById('toggle-daily-group') as HTMLInputElement | null;
const toggleHideLinesEl = document.getElementById('toggle-hide-lines') as HTMLInputElement | null;
const toggleHideGridEl = document.getElementById('toggle-hide-grid') as HTMLInputElement | null;
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
  useSmooth = false,
  showAverage = false,
  hideValues = false,
  hideLines = false
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

  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const minMaxBySymbol = new Map<string, { min: number; max: number }>();
  dataBySymbol.forEach((points, symbol) => {
    const closes = points.map(p => p.close);
    minMaxBySymbol.set(symbol, {
      min: Math.min(...closes),
      max: Math.max(...closes)
    });
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
  
  if (!hideGrid) {
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
        if (!fillGaps) {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else {
        if (useSmooth && i > 0) {
          // Catmull-Rom 스플라인 근사
          const prevX = getX(prevPoint.time);
          const prevY = getY(prevPoint.close, minMax.min, minMax.max);
          
          // 제어점 계산: 이전과 현재 점의 1/3 지점
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
      ctx.stroke();
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
  hideLines = false
) {
  if (!ctx || sortedTimes.length === 0) return;

  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
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
  
  if (!hideGrid) {
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
      ctx.strokeStyle = volumeColor;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      // 평균 시간 간격 계산 (Price 차트와 동일)
      const avgTimeDiff = timeRange / sortedTimes.length;
      
      let prevValidIndex = -1;
    for (let i = 0; i < data.length; i++) {
      const time = new Date(data[i].timestamp).getTime() / 1000;
      if (time >= minTime && time <= maxTime) {
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
    }
      
      ctx.stroke();
      ctx.setLineDash([]);
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
  hideLines = false
) {
  if (!ctx || sortedTimes.length === 0) return;

  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
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
  
  if (!hideGrid) {
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
      ctx.strokeStyle = obvColor;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      // 평균 시간 간격 계산 (Price 차트와 동일)
      const avgTimeDiff = timeRange / sortedTimes.length;
      
      let prevValidIndex = -1;
    for (let i = 0; i < obvValues.length; i++) {
      const time = new Date(data[i].timestamp).getTime() / 1000;
      if (time >= minTime && time <= maxTime) {
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
    }
      
      ctx.stroke();
      ctx.setLineDash([]);
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
  sortedTimes: number[]
) {
  if (!ctx || sortedTimes.length === 0 || events.length === 0) return;

  const minTime = sortedTimes[0];
  const maxTime = sortedTimes[sortedTimes.length - 1];
  const timeRange = maxTime - minTime || 1;

  const getX = (time: number): number => {
    return padding + ((time - minTime) / timeRange) * (width - padding * 2);
  };

  // 이벤트 마커 (전체 높이에 걸쳐)
  events.forEach(event => {
    const eventTime = new Date(event.timestamp).getTime() / 1000;
    if (eventTime >= minTime && eventTime <= maxTime) {
      const x = getX(eventTime);
      const eventColor = event.color || '#FF6600';
      ctx.strokeStyle = eventColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, height - padding);
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
let showSmooth = false;
let showAverage = false;
let hideValues = false;
let dailyGroup = false;
let hideLines = false;
let hideGrid = false;
let enabledTickers = new Set<string>();  // 상단 체크박스 - 데이터 필터링
let visibleTickers = new Set<string>();  // 범례 클릭 - 그래프 표시/숨김
let mouseX: number | null = null;
let mouseY: number | null = null;
let canvasWidth = 0;
let canvasHeight = 0;
let rangeMin = 0;  // X축 0-100%
let rangeMax = 100; // X축 0-100%
let legendItems: { symbol: string; x: number; y: number; width: number; height: number }[] = [];

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
  
  // X축 범위 필터링 적용
  if (rangeMin > 0 || rangeMax < 100) {
    const rangeFilteredMap = new Map<string, ChartData[]>();
    filteredDataMap.forEach((data, symbol) => {
      if (data.length === 0) {
        rangeFilteredMap.set(symbol, []);
        return;
      }
      const startIdx = Math.floor((data.length - 1) * rangeMin / 100);
      const endIdx = Math.ceil((data.length - 1) * rangeMax / 100);
      rangeFilteredMap.set(symbol, data.slice(startIdx, endIdx + 1));
    });
    filteredDataMap = rangeFilteredMap;
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
  
  // Price 차트 그리기
  drawSimpleOverlayChart(ctx, width, totalHeight, filteredDataMap, currentData.events, showEvents, showCandles, showGaps, showVolume || showOBV, priceChartHeight, showSmooth, showAverage, hideValues, hideLines);
  
  // Volume 렌더링
  if (showVolume) {
    drawVolumeChart(ctx, width, totalHeight, volumeTopY, volumeTopY, volumeChartHeight, filteredDataMap, sortedTimes, showGaps, showSmooth, showAverage, hideValues, hideLines);
  }
  
  // OBV 렌더링
  if (showOBV) {
    drawOBVChart(ctx, width, totalHeight, obvTopY, obvTopY, obvChartHeight, filteredDataMap, sortedTimes, showGaps, showSmooth, showAverage, hideValues, hideLines);
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
    drawEventMarkers(ctx, width, totalHeight, currentData.events, sortedTimes);
  }

  // X축 레이블 (항상 표시)
  drawXAxisLabels(ctx, width, totalHeight, sortedTimes);

  // 크로스헤어 그리기 (전체 영역)
  if (mouseX !== null && mouseY !== null) {
    drawCrosshair(ctx, width, totalHeight, mouseX, mouseY, priceChartHeight, volumeTopY, volumeChartHeight, obvTopY, obvChartHeight, showVolume, showOBV);
  }
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

  if (toggleSmoothEl) {
    toggleSmoothEl.checked = showSmooth;
    toggleSmoothEl.addEventListener('change', () => {
      showSmooth = toggleSmoothEl.checked;
      render();
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

  if (toggleHideGridEl) {
    toggleHideGridEl.checked = hideGrid;
    toggleHideGridEl.addEventListener('change', () => {
      hideGrid = toggleHideGridEl.checked;
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

  // 마우스 인터렉션
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    render();
  });

  canvas.addEventListener('mouseleave', () => {
    mouseX = null;
    mouseY = null;
    render();
  });

  // 범례 클릭으로 티커 표시/숨김 토글 (데이터 필터링 X, 그래프만 숨김)
  canvas.addEventListener('click', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
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

  // 범례 위에 마우스 올리면 커서 변경
  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const hoverX = e.clientX - rect.left;
    const hoverY = e.clientY - rect.top;
    
    let isOverLegend = false;
    for (const item of legendItems) {
      if (hoverX >= item.x && hoverX <= item.x + item.width &&
          hoverY >= item.y && hoverY <= item.y + item.height) {
        isOverLegend = true;
        break;
      }
    }
    
    canvas.style.cursor = isOverLegend ? 'pointer' : 'crosshair';
  });
})();
