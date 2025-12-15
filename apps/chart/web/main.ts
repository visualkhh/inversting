type ChartData = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
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
  fillGaps = false
) {
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
    return height - padding - ((value - minVal) / range) * (height - padding * 2);
  };

  // 배경
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // 그리드 (고정 10x10 격자)
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

  // X축 레이블 (첫/마지막 고정)
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

  // Y축 레이블
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 5; i++) {
    const value = 100 - i * 20;
    const y = padding + (i / 5) * (height - padding * 2);
    ctx.fillText(`${value}%`, padding - 10, y);
  }

  // 이벤트 마커 (실선)
  if (showEvents) {
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

  // 범례 (상단, 가로)
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
let showGaps = false;
let mouseX: number | null = null;
let mouseY: number | null = null;
let canvasWidth = 0;
let canvasHeight = 0;

function renderWithCrosshair() {
  if (!currentData) return;
  const dpr = window.devicePixelRatio || 1;
  const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
  const width = Math.max(300, cssW);
  const height = Math.max(200, cssH);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvasWidth = width;
  canvasHeight = height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSimpleOverlayChart(ctx, width, height, currentData.dataMap, currentData.events, showEvents, showCandles, showGaps);
  
  // 크로스헤어 그리기
  if (mouseX !== null && mouseY !== null) {
    drawCrosshair(ctx, width, height, mouseX, mouseY);
  }
}

function drawCrosshair(ctx: CanvasRenderingContext2D, width: number, height: number, x: number, y: number) {
  // 수직선
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

  // 값(%) 표시 (좌측)
  const valuePercent = 100 - ((y - padding) / (height - padding * 2)) * 100;
  const valueStr = `${valuePercent.toFixed(1)}%`;
  
  ctx.fillStyle = '#333333';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(valueStr, padding - 15, y);
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
    toggleGapsEl.checked = showGaps;
    toggleGapsEl.addEventListener('change', () => {
      showGaps = toggleGapsEl.checked;
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
