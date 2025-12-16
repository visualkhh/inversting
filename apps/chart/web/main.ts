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
const canvas = document.getElementById('chart') as HTMLCanvasElement | null;

if (!canvas) {
  throw new Error('Canvas element #chart not found');
}

const ctx = canvas.getContext('2d');
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
  priceChartHeight?: number
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

  const getY = (value: number, minVal: number, maxVal: number): number => {
    const range = maxVal - minVal || 1;
    return actualHeight - padding - ((value - minVal) / range) * (actualHeight - padding * 2);
  };

  // 배경 (Price 영역만) - OBV 활성화시 Price 영역만 만다 높이로
  if (showOBV) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, actualHeight - padding);
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, actualHeight);
  }

  // 그리드와 축은 OBV 활성화 여부에 따라 다르게 처리
  if (showOBV) {
    // OBV 활성화시: 전체 캔버스에 그리드와 Y축
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

    // Y축 (전체 높이로)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.stroke();
  } else {
    // OBV 비활성화시: Price 영역만
    const gridDivisions = 10;
    const gridWidth = width - padding * 2;
    const gridHeight = actualHeight - padding * 2;
    const gridStepX = gridWidth / gridDivisions;
    const gridStepY = gridHeight / gridDivisions;
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridDivisions; i++) {
      const x = padding + gridStepX * i;
      ctx.beginPath();
      ctx.moveTo(x, padding);
      ctx.lineTo(x, actualHeight - padding);
      ctx.stroke();
    }
    for (let i = 0; i <= gridDivisions; i++) {
      const y = padding + gridStepY * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Y축과 X축
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, actualHeight - padding);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding, actualHeight - padding);
    ctx.lineTo(width - padding, actualHeight - padding);
    ctx.stroke();
  }

  // Y축 레이블 (Price)
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) {
    const value = 100 - i * 20;
    const y = padding + (i / 5) * (actualHeight - padding * 2);
    ctx.fillText(`${value}%`, padding - 10, y);
  }
  
  // 'Price' 세로 텍스트
  ctx.save();
  ctx.translate(15, actualHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Price', 0, 0);
  ctx.restore();
  
  // Price와 OBV 구분선 (OBV 활성화시) - actualHeight - padding 위치에
  if (showOBV) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, actualHeight - padding);
    ctx.lineTo(width - padding, actualHeight - padding);
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
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
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
        ctx.lineTo(x, y);
        ctx.stroke();
        if (!fillGaps) {
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    colorIndex++;
  });
  
  // 범례 그리기 (좌측 상단 빈 공간)
  const legendX = padding + 10;
  const legendY = padding - 25;
  const legendLineWidth = 15;
  const legendItemWidth = 80;
  let legendColorIndex = 0;
  
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '11px Arial';
  dataBySymbol.forEach((_, symbol) => {
    const color = colors[legendColorIndex % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legendX + legendColorIndex * legendItemWidth, legendY);
    ctx.lineTo(legendX + legendColorIndex * legendItemWidth + legendLineWidth, legendY);
    ctx.stroke();
    ctx.fillStyle = '#000000';
    ctx.fillText(symbol, legendX + legendColorIndex * legendItemWidth + legendLineWidth + 5, legendY);
    legendColorIndex++;
  });
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
  fillGaps: boolean
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
    return actualHeight - padding + (1 - normalizedValue) * volumeHeight;
  };

  // Volume 영역 그리드 (10x10)
  const gridDivisions = 10;
  const gridWidth = width - padding * 2;
  const gridHeight = volumeHeight;
  const gridStepX = gridWidth / gridDivisions;
  const gridStepY = gridHeight / gridDivisions;
  
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 1;
  
  // 세로 그리드선
  for (let i = 0; i <= gridDivisions; i++) {
    const x = padding + gridStepX * i;
    ctx.beginPath();
    ctx.moveTo(x, actualHeight - padding);
    ctx.lineTo(x, actualHeight - padding + gridHeight);
    ctx.stroke();
  }
  
  // 가로 그리드선
  for (let i = 0; i <= gridDivisions; i++) {
    const y = actualHeight - padding + gridStepY * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // Y축 연결
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, actualHeight - padding);
  ctx.lineTo(padding, actualHeight - padding + gridHeight);
  ctx.stroke();

  // 하단 X축
  ctx.beginPath();
  ctx.moveTo(padding, actualHeight - padding + gridHeight);
  ctx.lineTo(width - padding, actualHeight - padding + gridHeight);
  ctx.stroke();

  // Volume 렌더링 (선 그래프)
  let colorIndex = 0;
  dataMap.forEach((data, symbol) => {
    const volumes = data.map(d => d.volume || 0);
    const maxVolume = Math.max(...volumes, 1);
    const minVolume = 0;

    const volumeColor = colors[colorIndex % colors.length];
    ctx.strokeStyle = volumeColor;
    ctx.lineWidth = 2;
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
        const y = getY(volume, minVolume, maxVolume);
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
            ctx.lineTo(x, y);
          } else {
            // gap이 있으면 점선
            if (hasTimeGap || hasDataGap) {
              // 점선으로 그리기
              ctx.stroke();
              ctx.beginPath();
              ctx.setLineDash([2, 2]);
              ctx.moveTo(getX(prevTime), getY(data[prevValidIndex].volume || 0, minVolume, maxVolume));
              ctx.lineTo(x, y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(x, y);
            } else {
              // 실선으로 그리기
              ctx.lineTo(x, y);
            }
          }
          prevValidIndex = i;
        }
      }
    }
    
    ctx.stroke();
    ctx.setLineDash([]);
    colorIndex++;
  });

  // Y축 레이블 (Volume)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  for (let i = 0; i <= 5; i++) {
    const value = 100 - i * 20;
    const y = actualHeight - padding + (i / 5) * volumeHeight;
    ctx.fillText(`${value}%`, padding - 10, y);
  }

  // 'Volume' 세로 텍스트
  ctx.save();
  ctx.translate(15, actualHeight - padding + volumeHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Volume', 0, 0);
  ctx.restore();
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
  fillGaps: boolean
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
    return actualHeight - padding + (1 - normalizedValue) * obvHeight;
  };

  // OBV 영역 그리드 (10x10)
  const gridDivisions = 10;
  const gridWidth = width - padding * 2;
  const gridHeight = obvHeight;
  const gridStepX = gridWidth / gridDivisions;
  const gridStepY = gridHeight / gridDivisions;
  
  ctx.strokeStyle = '#CCCCCC';
  ctx.lineWidth = 1;
  
  // 세로 그리드선
  for (let i = 0; i <= gridDivisions; i++) {
    const x = padding + gridStepX * i;
    ctx.beginPath();
    ctx.moveTo(x, actualHeight - padding);
    ctx.lineTo(x, actualHeight - padding + gridHeight);
    ctx.stroke();
  }
  
  // 가로 그리드선
  for (let i = 0; i <= gridDivisions; i++) {
    const y = actualHeight - padding + gridStepY * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  // Y축 연결 (Price 영역에서 이어받기)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, actualHeight - padding);
  ctx.lineTo(padding, actualHeight - padding + gridHeight);
  ctx.stroke();

  // 하단 X축
  ctx.beginPath();
  ctx.moveTo(padding, actualHeight - padding + gridHeight);
  ctx.lineTo(width - padding, actualHeight - padding + gridHeight);
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

    const obvColor = colors[colorIndex % colors.length];
    ctx.strokeStyle = obvColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    // 평균 시간 간격 계산 (Price 차트와 동일)
    const avgTimeDiff = timeRange / sortedTimes.length;
    
    let prevValidIndex = -1;
    for (let i = 0; i < obvValues.length; i++) {
      const time = new Date(data[i].timestamp).getTime() / 1000;
      if (time >= minTime && time <= maxTime) {
        const x = getX(time);
        const y = getY(obvValues[i], obvMin, obvMax);
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
            ctx.lineTo(x, y);
          } else {
            // gap이 있으면 점선
            if (hasTimeGap || hasDataGap) {
              // 점선으로 그리기
              ctx.stroke();
              ctx.beginPath();
              ctx.setLineDash([2, 2]);
              ctx.moveTo(getX(prevTime), getY(obvValues[prevValidIndex], obvMin, obvMax));
              ctx.lineTo(x, y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.moveTo(x, y);
            } else {
              // 실선으로 그리기
              ctx.lineTo(x, y);
            }
          }
          prevValidIndex = i;
        }
      }
    }
    
    ctx.stroke();
    ctx.setLineDash([]);
    colorIndex++;
  });

  // Y축 레이블 (OBV) - 100%가 위, 0%가 아래
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.font = '12px Arial';
  for (let i = 0; i <= 5; i++) {
    const value = 100 - i * 20;
    const y = actualHeight - padding + (i / 5) * obvHeight;
    ctx.fillText(`${value}%`, padding - 10, y);
  }
  
  // 'OBV' 세로 텍스트
  ctx.save();
  ctx.translate(15, actualHeight - padding + obvHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('OBV', 0, 0);
  ctx.restore();
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
  dataBySymbol.forEach((_, symbol) => {
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

let currentData: { dataMap: Map<string, ChartData[]>; events: EventMarker[] } | null = null;
let showEvents = false;
let showCandles = false;
let showGaps = true;
let showVolume = false;
let showOBV = false;
let mouseX: number | null = null;
let mouseY: number | null = null;
let canvasWidth = 0;
let canvasHeight = 0;

function renderWithCrosshair() {
  if (!currentData) return;
  const dpr = window.devicePixelRatio || 1;
  const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
  const width = Math.max(300, cssW);
  let totalHeight = Math.max(200, cssH);
  
  // Price/Volume/OBV 레이아웃 계산
  let priceChartHeight: number;
  let volumeChartHeight = 0;
  let obvChartHeight = 0;
  let volumeTopY = 0;
  let obvTopY = 0;
  
  if (showVolume && showOBV) {
    // Price 60%, Volume 20%, OBV 20%
    priceChartHeight = totalHeight * 0.6;
    volumeChartHeight = totalHeight * 0.2;
    obvChartHeight = totalHeight * 0.2;
    volumeTopY = priceChartHeight;
    obvTopY = priceChartHeight + volumeChartHeight;
  } else if (showVolume) {
    // Price 70%, Volume 30%
    priceChartHeight = totalHeight * 0.7;
    volumeChartHeight = totalHeight * 0.3;
    volumeTopY = priceChartHeight;
  } else if (showOBV) {
    // Price 70%, OBV 30%
    priceChartHeight = totalHeight * 0.7;
    obvChartHeight = totalHeight * 0.3;
    obvTopY = priceChartHeight;
  } else {
    // Price만
    priceChartHeight = totalHeight;
  }
  
  canvas.width = width * dpr;
  canvas.height = totalHeight * dpr;
  canvasWidth = width;
  canvasHeight = totalHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  // 시간 포인트 수집
  const allTimePoints = new Set<number>();
  currentData.dataMap.forEach((data) => {
    data.forEach(d => {
      const time = new Date(d.timestamp).getTime() / 1000;
      allTimePoints.add(time);
    });
  });
  const sortedTimes = Array.from(allTimePoints).sort((a, b) => a - b);
  
  // Price 차트 그리기
  drawSimpleOverlayChart(ctx, width, totalHeight, currentData.dataMap, currentData.events, showEvents, showCandles, showGaps, showVolume || showOBV, priceChartHeight);
  
  // Volume 렌더링
  if (showVolume) {
    drawVolumeChart(ctx, width, totalHeight, volumeTopY, volumeTopY, volumeChartHeight, currentData.dataMap, sortedTimes, showGaps);
  }
  
  // OBV 렌더링
  if (showOBV) {
    drawOBVChart(ctx, width, totalHeight, obvTopY, obvTopY, obvChartHeight, currentData.dataMap, sortedTimes, showGaps);
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
  // 수직선 (전체 영역)
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, padding);
  ctx.lineTo(x, height - padding);
  ctx.stroke();

  // 수평선
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 날짜 표시 (하단)
  const timePercent = (x - padding) / (width - padding * 2);
  const allTimes = Array.from(currentData!.dataMap.values())
    .flatMap(data => data.map(d => new Date(d.timestamp).getTime() / 1000))
    .sort((a, b) => a - b);
  
  if (allTimes.length > 0) {
    const minTime = allTimes[0];
    const maxTime = allTimes[allTimes.length - 1];
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
  
  if (y >= padding && y <= priceHeight - padding) {
    // Price 영역
    const valuePercent = 100 - ((y - padding) / (priceHeight - padding * 2)) * 100;
    valueStr = `${valuePercent.toFixed(1)}%`;
  } else if (hasVolume && volumeHeight > 0 && y >= volumeTopY - padding && y <= volumeTopY + volumeHeight - padding) {
    // Volume 영역
    const localY = y - (volumeTopY - padding);
    const valuePercent = 100 - (localY / volumeHeight) * 100;
    valueStr = `${valuePercent.toFixed(1)}%`;
  } else if (hasOBV && obvHeight > 0 && y >= obvTopY - padding && y <= obvTopY + obvHeight - padding) {
    // OBV 영역
    const localY = y - (obvTopY - padding);
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
})();
