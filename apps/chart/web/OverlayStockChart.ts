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

interface ChartOptions {
  showEvents?: boolean;
  showCandles?: boolean;
  fillGaps?: boolean;
  showVolume?: boolean;
  showOBV?: boolean;
  smoothMode?: 'none' | 'smooth' | 'open' | 'high' | 'low' | 'middle';
  showAverage?: boolean;
  hideValues?: boolean;
  hideLines?: boolean;
  showGrid?: boolean;
  displayMinTime?: number;
  displayMaxTime?: number;
}

interface RenderState {
  enabledTickers: Set<string>;
  visibleTickers: Set<string>;
  showEvents: boolean;
  showCandles: boolean;
  showGaps: boolean;
  showVolume: boolean;
  showOBV: boolean;
  smoothMode: 'none' | 'smooth' | 'open' | 'high' | 'low' | 'middle';
  showAverage: boolean;
  hideValues: boolean;
  dailyGroup: boolean;
  hideLines: boolean;
  showGrid: boolean;
  showPoints: boolean;
  rangeMin: number;
  rangeMax: number;
}

export class OverlayStockChart {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private width: number;
  private height: number;
  private padding = 50;
  private colors = ['#0000FF', '#FF0000', '#00AA00', '#FF00FF'];
  private chartMargin = 0.1;
  private dataMap: Map<string, ChartData[]>;
  private events: EventMarker[];
  
  // 내부 상태
  private state: RenderState;
  private mouseX: number | null = null;
  private mouseY: number | null = null;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private legendItems: { symbol: string; x: number; y: number; width: number; height: number }[] = [];
  private dataPoints: { symbol: string; x: number; y: number; value: number; time: number; chartType: string }[] = [];
  private hoveredPoint: { symbol: string; x: number; y: number; value: number; time: number; chartType: string } | null = null;
  private zoomStart = 0;
  private zoomEnd = 100;
  private isDragging = false;
  private dragStartX: number | null = null;
  private dragCurrentX: number | null = null;
  private isPanning = false;
  private panStartX: number | null = null;
  private zoomButtons: { type: string; x: number; y: number; width: number; height: number }[] = [];
  private sortedTimes: number[] = [];
  
  // 터치 관련
  private touchStartX: number | null = null;
  private touchStartY: number | null = null;
  private lastPinchDistance: number | null = null;
  private isTouchDragging = false;
  private isTouchPanning = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    dataMap: Map<string, ChartData[]>,
    events: EventMarker[] = [],
    initialState: RenderState
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = 0;
    this.height = 0;
    this.dataMap = dataMap;
    this.events = events;
    this.state = initialState;
    
    this.setupEventListeners();
    this.setupResizeObserver();
  }

  destroy() {
    // 리소스 정리
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  private setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.render();
    });
    this.resizeObserver.observe(this.canvas);
  }

  setData(dataMap: Map<string, ChartData[]>, events: EventMarker[] = []) {
    this.dataMap = dataMap;
    this.events = events;
  }

  updateState(partialState: Partial<RenderState>) {
    this.state = { ...this.state, ...partialState };
    this.render();
  }

  getState(): RenderState {
    return { ...this.state };
  }

  getSortedTimes(): number[] {
    return this.sortedTimes;
  }

  private calculateOBV(data: ChartData[]): number[] {
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

  private getX(time: number, minTime: number, maxTime: number): number {
    const timeRange = maxTime - minTime || 1;
    return this.padding + ((time - minTime) / timeRange) * (this.width - this.padding * 2);
  }

  private getY(value: number, minVal: number, maxVal: number, topY: number, height: number): number {
    const range = maxVal - minVal || 1;
    const normalizedValue = (value - minVal) / range;
    const scaledValue = this.chartMargin + normalizedValue * (1 - this.chartMargin * 2);
    return topY + (1 - scaledValue) * height;
  }

  drawPrice(
    visibleTickers: Set<string>,
    priceHeight: number,
    options: ChartOptions = {}
  ) {
    const {
      showCandles = false,
      fillGaps = false,
      smoothMode = 'none',
      showAverage = false,
      hideValues = false,
      hideLines = false,
      showGrid = false,
      displayMinTime,
      displayMaxTime
    } = options;

    // 데이터 준비
    const allTimePoints = new Set<number>();
    const dataBySymbol = new Map<string, { time: number; open: number; high: number; low: number; close: number }[]>();

    this.dataMap.forEach((data, symbol) => {
      const points: { time: number; open: number; high: number; low: number; close: number }[] = [];
      data.forEach(d => {
        const time = new Date(d.timestamp).getTime() / 1000;
        allTimePoints.add(time);
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

    const graphTop = this.padding;
    const graphBottom = priceHeight;
    const graphHeight = graphBottom - graphTop;

    // 배경
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.width, priceHeight);

    // 그리드
    if (showGrid) {
      this.drawGrid(graphTop, graphHeight);
    }

    // Y축
    this.drawYAxis(graphTop, graphBottom);

    // Y축 레이블
    if (!hideValues) {
      this.drawYAxisLabels(graphTop, graphHeight, graphBottom);
    }

    // 'Price' 세로 텍스트
    this.drawYAxisTitle('Price', graphTop, graphBottom);

    // 심볼별 렌더링
    let colorIndex = 0;
    dataBySymbol.forEach((points, symbol) => {
      if (!visibleTickers.has(symbol)) {
        colorIndex++;
        return;
      }

      const color = this.colors[colorIndex % this.colors.length];
      const minMax = minMaxBySymbol.get(symbol)!;
      const sortedPoints = points.sort((a, b) => a.time - b.time);

      // 캔들
      if (showCandles) {
        this.drawCandles(sortedPoints, minMax, color, minTime, maxTime, graphTop, graphHeight);
      }

      // 라인
      if (!hideLines) {
        this.drawLine(sortedPoints, minMax, color, minTime, maxTime, timeRange, sortedTimes.length, graphTop, graphHeight, fillGaps, smoothMode);
      }

      colorIndex++;
    });

    // 평균선
    if (showAverage && dataBySymbol.size > 0) {
      this.drawAverageLine(dataBySymbol, minMaxBySymbol, sortedTimes, minTime, maxTime, graphTop, graphHeight, smoothMode);
    }

    return { dataBySymbol, minMaxBySymbol, sortedTimes };
  }

  private drawGrid(topY: number, height: number) {
    const gridDivisions = 10;
    const gridWidth = this.width - this.padding * 2;
    const gridStepX = gridWidth / gridDivisions;
    const gridStepY = height / gridDivisions;
    
    this.ctx.strokeStyle = '#CCCCCC';
    this.ctx.lineWidth = 1;
    
    for (let i = 0; i <= gridDivisions; i++) {
      const x = this.padding + gridStepX * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, topY);
      this.ctx.lineTo(x, topY + height);
      this.ctx.stroke();
    }
    
    for (let i = 0; i <= gridDivisions; i++) {
      const y = topY + gridStepY * i;
      this.ctx.beginPath();
      this.ctx.moveTo(this.padding, y);
      this.ctx.lineTo(this.width - this.padding, y);
      this.ctx.stroke();
    }
  }

  private drawYAxis(topY: number, bottomY: number) {
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, topY);
    this.ctx.lineTo(this.padding, bottomY);
    this.ctx.stroke();
  }

  private drawYAxisLabels(topY: number, height: number, bottomY: number) {
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Arial';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    
    for (let i = 0; i <= 5; i++) {
      const value = 100 - i * 20;
      const normalizedValue = value / 100;
      const scaledValue = this.chartMargin + normalizedValue * (1 - this.chartMargin * 2);
      const y = bottomY - scaledValue * height;
      this.ctx.fillText(`${value}%`, this.padding - 5, y);
      
      this.ctx.beginPath();
      this.ctx.moveTo(this.padding - 5, y);
      this.ctx.lineTo(this.padding, y);
      this.ctx.stroke();
    }
  }

  private drawYAxisTitle(title: string, topY: number, bottomY: number) {
    this.ctx.save();
    const labelY = (topY + bottomY) / 2;
    this.ctx.translate(8, labelY);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillStyle = '#000000';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(title, 0, 0);
    this.ctx.restore();
  }

  private drawCandles(
    points: { time: number; open: number; high: number; low: number; close: number }[],
    minMax: { min: number; max: number },
    color: string,
    minTime: number,
    maxTime: number,
    topY: number,
    height: number
  ) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(this.padding, topY, this.width - this.padding * 2, height);
    this.ctx.clip();
    
    points.forEach(point => {
      const x = this.getX(point.time, minTime, maxTime);
      const yHigh = this.getY(point.high, minMax.min, minMax.max, topY, height);
      const yLow = this.getY(point.low, minMax.min, minMax.max, topY, height);
      const yOpen = this.getY(point.open, minMax.min, minMax.max, topY, height);
      const yClose = this.getY(point.close, minMax.min, minMax.max, topY, height);

      this.ctx.globalAlpha = 0.3;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, yHigh);
      this.ctx.lineTo(x, yLow);
      this.ctx.stroke();

      const candleWidth = 3;
      const isUp = point.close >= point.open;
      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = isUp ? '#FFFFFF' : color;
      
      const rectY = Math.min(yOpen, yClose);
      const rectHeight = Math.abs(yOpen - yClose) || 1;
      this.ctx.fillRect(x - candleWidth / 2, rectY, candleWidth, rectHeight);
      this.ctx.strokeRect(x - candleWidth / 2, rectY, candleWidth, rectHeight);
      this.ctx.globalAlpha = 1;
    });
    
    this.ctx.restore();
  }

  private drawLine(
    points: { time: number; open: number; high: number; low: number; close: number }[],
    minMax: { min: number; max: number },
    color: string,
    minTime: number,
    maxTime: number,
    timeRange: number,
    totalPoints: number,
    topY: number,
    height: number,
    fillGaps: boolean,
    smoothMode: string
  ) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(this.padding, topY, this.width - this.padding * 2, height);
    this.ctx.clip();
    
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    
    const firstX = this.getX(points[0].time, minTime, maxTime);
    const firstY = this.getY(points[0].close, minMax.min, minMax.max, topY, height);
    this.ctx.moveTo(firstX, firstY);

    const avgTimeDiff = timeRange / totalPoints;

    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      const prevPoint = points[i - 1];
      const x = this.getX(point.time, minTime, maxTime);
      const y = this.getY(point.close, minMax.min, minMax.max, topY, height);
      const timeDiff = point.time - prevPoint.time;

      if (timeDiff > avgTimeDiff * 2) {
        this.ctx.stroke();
        if (!fillGaps) {
          this.ctx.setLineDash([5, 5]);
        }
        this.ctx.beginPath();
        const prevX = this.getX(prevPoint.time, minTime, maxTime);
        const prevY = this.getY(prevPoint.close, minMax.min, minMax.max, topY, height);
        this.ctx.moveTo(prevX, prevY);
        
        if (smoothMode !== 'none') {
          this.drawBezierCurve(prevX, prevY, x, y, point, minMax, topY, height, smoothMode);
        } else {
          this.ctx.lineTo(x, y);
        }
        
        this.ctx.stroke();
        if (!fillGaps) {
          this.ctx.setLineDash([]);
        }
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
      } else {
        if (smoothMode !== 'none') {
          const prevX = this.getX(prevPoint.time, minTime, maxTime);
          const prevY = this.getY(prevPoint.close, minMax.min, minMax.max, topY, height);
          this.drawBezierCurve(prevX, prevY, x, y, point, minMax, topY, height, smoothMode);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
    }
    
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawBezierCurve(
    prevX: number,
    prevY: number,
    x: number,
    y: number,
    point: { open: number; high: number; low: number; close: number },
    minMax: { min: number; max: number },
    topY: number,
    height: number,
    smoothMode: string
  ) {
    const cp1x = prevX + (x - prevX) / 3;
    const cp1y = prevY;
    const cp2x = prevX + (x - prevX) * 2 / 3;
    let cp2y: number;
    
    if (smoothMode === 'open' && point.open && point.open > 0) {
      cp2y = this.getY(point.open, minMax.min, minMax.max, topY, height);
    } else if (smoothMode === 'high' && point.high && point.high > 0) {
      cp2y = this.getY(point.high, minMax.min, minMax.max, topY, height);
    } else if (smoothMode === 'low' && point.low && point.low > 0) {
      cp2y = this.getY(point.low, minMax.min, minMax.max, topY, height);
    } else if (smoothMode === 'middle' && point.high && point.low) {
      cp2y = this.getY((point.high + point.low) / 2, minMax.min, minMax.max, topY, height);
    } else {
      cp2y = y;
    }
    
    this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
  }

  private drawAverageLine(
    dataBySymbol: Map<string, { time: number; close: number }[]>,
    minMaxBySymbol: Map<string, { min: number; max: number }>,
    sortedTimes: number[],
    minTime: number,
    maxTime: number,
    topY: number,
    height: number,
    smoothMode: string
  ) {
    const avgPoints: { time: number; avgY: number }[] = [];
    
    sortedTimes.forEach(time => {
      const yValues: number[] = [];
      
      dataBySymbol.forEach((sortedPoints, symbol) => {
        const minMax = minMaxBySymbol.get(symbol);
        if (!minMax) return;
        
        let closeValue: number | null = null;
        const exactPoint = sortedPoints.find(p => p.time === time);
        
        if (exactPoint) {
          closeValue = exactPoint.close;
        } else {
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
            const ratio = (time - prevPoint.time) / (nextPoint.time - prevPoint.time);
            closeValue = prevPoint.close + (nextPoint.close - prevPoint.close) * ratio;
          } else if (prevPoint) {
            closeValue = prevPoint.close;
          } else if (nextPoint) {
            closeValue = nextPoint.close;
          }
        }
        
        if (closeValue !== null) {
          const yCoord = this.getY(closeValue, minMax.min, minMax.max, topY, height);
          yValues.push(yCoord);
        }
      });
      
      if (yValues.length > 0) {
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        avgPoints.push({ time, avgY });
      }
    });
    
    if (avgPoints.length > 0) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(this.padding, topY, this.width - this.padding * 2, height);
      this.ctx.clip();
      
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([3, 2]);
      this.ctx.globalAlpha = 1.0;
      
      this.ctx.beginPath();
      avgPoints.forEach((point, i) => {
        const x = this.getX(point.time, minTime, maxTime);
        const y = point.avgY;
        
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else if (smoothMode !== 'none' && i > 0) {
          const prevPoint = avgPoints[i - 1];
          const prevX = this.getX(prevPoint.time, minTime, maxTime);
          const prevY = prevPoint.avgY;
          const cp1x = prevX + (x - prevX) / 3;
          const cp1y = prevY;
          const cp2x = prevX + (x - prevX) * 2 / 3;
          const cp2y = y;
          this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      });
      this.ctx.stroke();
      
      this.ctx.setLineDash([]);
      this.ctx.globalAlpha = 1.0;
      this.ctx.restore();
    }
  }

  drawVolume(
    visibleTickers: Set<string>,
    volumeTopY: number,
    volumeHeight: number,
    sortedTimes: number[],
    options: ChartOptions = {}
  ) {
    const {
      fillGaps = false,
      smoothMode = 'none',
      showAverage = false,
      hideValues = false,
      hideLines = false,
      showGrid = false,
      displayMinTime,
      displayMaxTime
    } = options;

    if (sortedTimes.length === 0) return;

    const minTime = displayMinTime ?? sortedTimes[0];
    const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
    const timeRange = maxTime - minTime || 1;

    // 배경
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, volumeTopY, this.width, volumeHeight);

    // 그리드
    if (showGrid) {
      this.drawGrid(volumeTopY, volumeHeight);
    }

    // Y축
    this.drawYAxis(volumeTopY, volumeTopY + volumeHeight);

    // 하단 X축
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, volumeTopY + volumeHeight);
    this.ctx.lineTo(this.width - this.padding, volumeTopY + volumeHeight);
    this.ctx.stroke();

    // 각 티커별 볼륨 min/max 계산
    const volumeMinMaxBySymbol = new Map<string, { min: number; max: number }>();
    this.dataMap.forEach((data, symbol) => {
      const volumes = data.map(d => d.volume || 0).filter(v => v > 0);
      if (volumes.length > 0) {
        volumeMinMaxBySymbol.set(symbol, {
          min: Math.min(...volumes),
          max: Math.max(...volumes)
        });
      }
    });

    // Volume 렌더링
    let colorIndex = 0;
    this.dataMap.forEach((data, symbol) => {
      const minMax = volumeMinMaxBySymbol.get(symbol);
      if (!minMax || !visibleTickers.has(symbol)) {
        colorIndex++;
        return;
      }

      if (!hideLines) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(this.padding, volumeTopY, this.width - this.padding * 2, volumeHeight);
        this.ctx.clip();

        this.ctx.strokeStyle = this.colors[colorIndex % this.colors.length];
        this.ctx.lineWidth = 1;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        const avgTimeDiff = timeRange / sortedTimes.length;
        let prevValidIndex = -1;

        for (let i = 0; i < data.length; i++) {
          const time = new Date(data[i].timestamp).getTime() / 1000;
          const volume = data[i].volume || 0;
          const x = this.getX(time, minTime, maxTime);
          const y = this.getY(volume, minMax.min, minMax.max, volumeTopY, volumeHeight);
          const hasData = volume > 0;

          if (prevValidIndex === -1) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            prevValidIndex = i;
          } else {
            const prevTime = new Date(data[prevValidIndex].timestamp).getTime() / 1000;
            const timeDiff = time - prevTime;
            const prevVolume = data[prevValidIndex].volume || 0;
            const hasTimeGap = timeDiff > avgTimeDiff * 2;
            const hasDataGap = !hasData || prevVolume <= 0;

            if (fillGaps) {
              if (smoothMode !== 'none') {
                const prevX = this.getX(prevTime, minTime, maxTime);
                const prevY = this.getY(prevVolume, minMax.min, minMax.max, volumeTopY, volumeHeight);
                const cp1x = prevX + (x - prevX) / 3;
                const cp1y = prevY;
                const cp2x = prevX + (x - prevX) * 2 / 3;
                const cp2y = y;
                this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
              } else {
                this.ctx.lineTo(x, y);
              }
            } else {
              if (hasTimeGap || hasDataGap) {
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.setLineDash([5, 5]);
                const prevX = this.getX(prevTime, minTime, maxTime);
                const prevY = this.getY(prevVolume, minMax.min, minMax.max, volumeTopY, volumeHeight);
                this.ctx.moveTo(prevX, prevY);

                if (smoothMode !== 'none') {
                  const cp1x = prevX + (x - prevX) / 3;
                  const cp1y = prevY;
                  const cp2x = prevX + (x - prevX) * 2 / 3;
                  const cp2y = y;
                  this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
                } else {
                  this.ctx.lineTo(x, y);
                }

                this.ctx.stroke();
                this.ctx.setLineDash([]);
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
              } else {
                if (smoothMode !== 'none') {
                  const prevX = this.getX(prevTime, minTime, maxTime);
                  const prevY = this.getY(prevVolume, minMax.min, minMax.max, volumeTopY, volumeHeight);
                  const cp1x = prevX + (x - prevX) / 3;
                  const cp1y = prevY;
                  const cp2x = prevX + (x - prevX) * 2 / 3;
                  const cp2y = y;
                  this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
                } else {
                  this.ctx.lineTo(x, y);
                }
              }
            }
            prevValidIndex = i;
          }
        }

        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }
      colorIndex++;
    });

    // Y축 레이블
    if (!hideValues) {
      this.drawYAxisLabels(volumeTopY, volumeHeight, volumeTopY + volumeHeight);
    }

    // 'Volume' 세로 텍스트
    this.drawYAxisTitle('Volume', volumeTopY, volumeTopY + volumeHeight);

    // 평균선
    if (showAverage && this.dataMap.size > 0) {
      this.drawVolumeAverageLine(volumeMinMaxBySymbol, sortedTimes, minTime, maxTime, volumeTopY, volumeHeight, smoothMode);
    }
  }

  private drawVolumeAverageLine(
    minMaxBySymbol: Map<string, { min: number; max: number }>,
    sortedTimes: number[],
    minTime: number,
    maxTime: number,
    topY: number,
    height: number,
    smoothMode: string
  ) {
    const avgPoints: { time: number; avgY: number }[] = [];

    sortedTimes.forEach(time => {
      const yValues: number[] = [];

      this.dataMap.forEach((data, symbol) => {
        const minMax = minMaxBySymbol.get(symbol);
        if (!minMax) return;

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
          const yCoord = this.getY(volumeValue, minMax.min, minMax.max, topY, height);
          yValues.push(yCoord);
        }
      });

      if (yValues.length > 0) {
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        avgPoints.push({ time, avgY });
      }
    });

    if (avgPoints.length > 0) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(this.padding, topY, this.width - this.padding * 2, height);
      this.ctx.clip();

      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([3, 2]);
      this.ctx.globalAlpha = 1.0;

      this.ctx.beginPath();
      avgPoints.forEach((point, i) => {
        const x = this.getX(point.time, minTime, maxTime);
        const y = point.avgY;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else if (smoothMode !== 'none' && i > 0) {
          const prevPoint = avgPoints[i - 1];
          const prevX = this.getX(prevPoint.time, minTime, maxTime);
          const prevY = prevPoint.avgY;
          const cp1x = prevX + (x - prevX) / 3;
          const cp1y = prevY;
          const cp2x = prevX + (x - prevX) * 2 / 3;
          const cp2y = y;
          this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      });
      this.ctx.stroke();

      this.ctx.setLineDash([]);
      this.ctx.globalAlpha = 1.0;
      this.ctx.restore();
    }
  }

  drawOBV(
    visibleTickers: Set<string>,
    obvTopY: number,
    obvHeight: number,
    sortedTimes: number[],
    options: ChartOptions = {}
  ) {
    const {
      fillGaps = false,
      smoothMode = 'none',
      showAverage = false,
      hideValues = false,
      hideLines = false,
      showGrid = false,
      displayMinTime,
      displayMaxTime
    } = options;

    if (sortedTimes.length === 0) return;

    const minTime = displayMinTime ?? sortedTimes[0];
    const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
    const timeRange = maxTime - minTime || 1;

    // 배경
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, obvTopY, this.width, obvHeight);

    // 그리드
    if (showGrid) {
      this.drawGrid(obvTopY, obvHeight);
    }

    // Y축
    this.drawYAxis(obvTopY, obvTopY + obvHeight);

    // 하단 X축
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, obvTopY + obvHeight);
    this.ctx.lineTo(this.width - this.padding, obvTopY + obvHeight);
    this.ctx.stroke();

    // 각 티커별 OBV min/max 계산
    const obvMinMaxBySymbol = new Map<string, { min: number; max: number; values: number[] }>();
    this.dataMap.forEach((data, symbol) => {
      const obvValues = this.calculateOBV(data);
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
    this.dataMap.forEach((data, symbol) => {
      const obvData = obvMinMaxBySymbol.get(symbol);
      if (!obvData || !visibleTickers.has(symbol)) {
        colorIndex++;
        return;
      }

      const obvValues = obvData.values;
      const minMax = { min: obvData.min, max: obvData.max };

      if (!hideLines) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(this.padding, obvTopY, this.width - this.padding * 2, obvHeight);
        this.ctx.clip();

        this.ctx.strokeStyle = this.colors[colorIndex % this.colors.length];
        this.ctx.lineWidth = 1;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        const avgTimeDiff = timeRange / sortedTimes.length;
        let prevValidIndex = -1;

        for (let i = 0; i < obvValues.length; i++) {
          const time = new Date(data[i].timestamp).getTime() / 1000;
          const x = this.getX(time, minTime, maxTime);
          const y = this.getY(obvValues[i], minMax.min, minMax.max, obvTopY, obvHeight);
          const volume = data[i].volume || 0;
          const hasData = volume > 0;

          if (prevValidIndex === -1) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            prevValidIndex = i;
          } else {
            const prevTime = new Date(data[prevValidIndex].timestamp).getTime() / 1000;
            const timeDiff = time - prevTime;
            const prevVolume = data[prevValidIndex].volume || 0;
            const hasTimeGap = timeDiff > avgTimeDiff * 2;
            const hasDataGap = !hasData || prevVolume <= 0;

            if (fillGaps) {
              if (smoothMode !== 'none') {
                const prevX = this.getX(prevTime, minTime, maxTime);
                const prevY = this.getY(obvValues[prevValidIndex], minMax.min, minMax.max, obvTopY, obvHeight);
                const cp1x = prevX + (x - prevX) / 3;
                const cp1y = prevY;
                const cp2x = prevX + (x - prevX) * 2 / 3;
                const cp2y = y;
                this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
              } else {
                this.ctx.lineTo(x, y);
              }
            } else {
              if (hasTimeGap || hasDataGap) {
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.setLineDash([5, 5]);
                const prevX = this.getX(prevTime, minTime, maxTime);
                const prevY = this.getY(obvValues[prevValidIndex], minMax.min, minMax.max, obvTopY, obvHeight);
                this.ctx.moveTo(prevX, prevY);

                if (smoothMode !== 'none') {
                  const cp1x = prevX + (x - prevX) / 3;
                  const cp1y = prevY;
                  const cp2x = prevX + (x - prevX) * 2 / 3;
                  const cp2y = y;
                  this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
                } else {
                  this.ctx.lineTo(x, y);
                }

                this.ctx.stroke();
                this.ctx.setLineDash([]);
                this.ctx.beginPath();
                this.ctx.moveTo(x, y);
              } else {
                if (smoothMode !== 'none') {
                  const prevX = this.getX(prevTime, minTime, maxTime);
                  const prevY = this.getY(obvValues[prevValidIndex], minMax.min, minMax.max, obvTopY, obvHeight);
                  const cp1x = prevX + (x - prevX) / 3;
                  const cp1y = prevY;
                  const cp2x = prevX + (x - prevX) * 2 / 3;
                  const cp2y = y;
                  this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
                } else {
                  this.ctx.lineTo(x, y);
                }
              }
            }
            prevValidIndex = i;
          }
        }

        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }
      colorIndex++;
    });

    // Y축 레이블
    if (!hideValues) {
      this.drawYAxisLabels(obvTopY, obvHeight, obvTopY + obvHeight);
    }

    // 'OBV' 세로 텍스트
    this.drawYAxisTitle('OBV', obvTopY, obvTopY + obvHeight);

    // 평균선
    if (showAverage && this.dataMap.size > 0) {
      this.drawOBVAverageLine(obvMinMaxBySymbol, sortedTimes, minTime, maxTime, obvTopY, obvHeight, smoothMode);
    }
  }

  private drawOBVAverageLine(
    obvMinMaxBySymbol: Map<string, { min: number; max: number; values: number[] }>,
    sortedTimes: number[],
    minTime: number,
    maxTime: number,
    topY: number,
    height: number,
    smoothMode: string
  ) {
    const obvBySymbol = new Map<string, { time: number; obv: number }[]>();
    const minMaxBySymbol = new Map<string, { min: number; max: number }>();

    this.dataMap.forEach((data, symbol) => {
      const obvData = obvMinMaxBySymbol.get(symbol);
      if (!obvData) return;

      const points: { time: number; obv: number }[] = [];
      data.forEach((d, i) => {
        const time = new Date(d.timestamp).getTime() / 1000;
        points.push({ time, obv: obvData.values[i] });
      });
      obvBySymbol.set(symbol, points);
      minMaxBySymbol.set(symbol, { min: obvData.min, max: obvData.max });
    });

    const avgPoints: { time: number; avgY: number }[] = [];

    sortedTimes.forEach(time => {
      const yValues: number[] = [];

      obvBySymbol.forEach((points, symbol) => {
        const minMax = minMaxBySymbol.get(symbol);
        if (!minMax) return;

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
          const yCoord = this.getY(obvValue, minMax.min, minMax.max, topY, height);
          yValues.push(yCoord);
        }
      });

      if (yValues.length > 0) {
        const avgY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        avgPoints.push({ time, avgY });
      }
    });

    if (avgPoints.length > 0) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(this.padding, topY, this.width - this.padding * 2, height);
      this.ctx.clip();

      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([3, 2]);
      this.ctx.globalAlpha = 1.0;

      this.ctx.beginPath();
      avgPoints.forEach((point, i) => {
        const x = this.getX(point.time, minTime, maxTime);
        const y = point.avgY;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else if (smoothMode !== 'none' && i > 0) {
          const prevPoint = avgPoints[i - 1];
          const prevX = this.getX(prevPoint.time, minTime, maxTime);
          const prevY = prevPoint.avgY;
          const cp1x = prevX + (x - prevX) / 3;
          const cp1y = prevY;
          const cp2x = prevX + (x - prevX) * 2 / 3;
          const cp2y = y;
          this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      });
      this.ctx.stroke();

      this.ctx.setLineDash([]);
      this.ctx.globalAlpha = 1.0;
      this.ctx.restore();
    }
  }

  drawLegend(
    dataBySymbol: Map<string, any>,
    visibleTickers: Set<string>,
    legendItems: { symbol: string; x: number; y: number; width: number; height: number }[]
  ): { symbol: string; x: number; y: number; width: number; height: number }[] {
    const legendX = this.padding + 10;
    const legendY = this.padding - 25;
    const legendLineWidth = 15;
    const legendItemWidth = 80;
    const legendHeight = 16;
    let legendColorIndex = 0;
    const newLegendItems: { symbol: string; x: number; y: number; width: number; height: number }[] = [];
    
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = '11px Arial';
    
    dataBySymbol.forEach((_, symbol) => {
      const color = this.colors[legendColorIndex % this.colors.length];
      const isVisible = visibleTickers.has(symbol);
      const itemX = legendX + legendColorIndex * legendItemWidth;
      
      newLegendItems.push({
        symbol,
        x: itemX - 5,
        y: legendY - legendHeight / 2,
        width: legendItemWidth - 5,
        height: legendHeight
      });
      
      this.ctx.globalAlpha = isVisible ? 1.0 : 0.3;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(itemX, legendY);
      this.ctx.lineTo(itemX + legendLineWidth, legendY);
      this.ctx.stroke();
      this.ctx.fillStyle = isVisible ? '#000000' : '#999999';
      this.ctx.fillText(symbol, itemX + legendLineWidth + 5, legendY);
      this.ctx.globalAlpha = 1.0;
      legendColorIndex++;
    });
    
    return newLegendItems;
  }

  drawChartDividers(volumeTopY: number, obvTopY: number, showVolume: boolean, showOBV: boolean) {
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    
    if (showVolume) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.padding, volumeTopY);
      this.ctx.lineTo(this.width - this.padding, volumeTopY);
      this.ctx.stroke();
    }
    
    if (showOBV) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.padding, obvTopY);
      this.ctx.lineTo(this.width - this.padding, obvTopY);
      this.ctx.stroke();
    }
  }

  drawEventMarkers(
    sortedTimes: number[],
    chartBottom: number,
    showEvents: boolean,
    displayMinTime?: number,
    displayMaxTime?: number
  ) {
    if (!showEvents || sortedTimes.length === 0 || this.events.length === 0) return;

    const minTime = displayMinTime ?? sortedTimes[0];
    const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];

    this.events.forEach(event => {
      const eventTime = new Date(event.timestamp).getTime() / 1000;
      if (eventTime >= minTime && eventTime <= maxTime) {
        const x = this.getX(eventTime, minTime, maxTime);
        const eventColor = event.color || '#FF6600';
        
        this.ctx.strokeStyle = eventColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x, this.padding);
        this.ctx.lineTo(x, chartBottom);
        this.ctx.stroke();

        this.ctx.save();
        this.ctx.translate(x, this.padding + 10);
        this.ctx.rotate(Math.PI / 4);
        this.ctx.fillStyle = eventColor;
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(event.label, 5, 0);
        this.ctx.restore();
      }
    });
  }

  drawXAxisLabels(
    sortedTimes: number[],
    chartBottom: number,
    displayMinTime?: number,
    displayMaxTime?: number
  ) {
    if (sortedTimes.length === 0) return;

    const minTime = displayMinTime ?? sortedTimes[0];
    const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];

    const baselineY = chartBottom;
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, baselineY);
    this.ctx.lineTo(this.width - this.padding, baselineY);
    this.ctx.stroke();

    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Arial';
    
    const tickYStart = baselineY;
    const tickYEnd = baselineY + 6;
    const labelY = baselineY + 13;
    
    const visibleTimes = sortedTimes.filter(t => t >= minTime && t <= maxTime);
    if (visibleTimes.length === 0) return;
    
    const dayStartTimes: number[] = [];
    const seenDays = new Set<string>();
    
    visibleTimes.forEach(time => {
      const date = new Date(time * 1000);
      const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!seenDays.has(dayKey)) {
        seenDays.add(dayKey);
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
        const dayStartTime = dayStart.getTime() / 1000;
        if (dayStartTime >= minTime && dayStartTime <= maxTime) {
          dayStartTimes.push(dayStartTime);
        }
      }
    });
    
    const maxLabels = 12;
    const step = Math.max(1, Math.ceil(dayStartTimes.length / maxLabels));
    
    this.ctx.textAlign = 'center';
    for (let i = 0; i < dayStartTimes.length; i += step) {
      const time = dayStartTimes[i];
      const x = this.getX(time, minTime, maxTime);
      
      if (x < this.padding || x > this.width - this.padding) continue;
      
      const date = new Date(time * 1000);
      this.ctx.fillText(`${date.getMonth() + 1}/${date.getDate()}`, x, labelY);
      this.ctx.beginPath();
      this.ctx.moveTo(x, tickYStart);
      this.ctx.lineTo(x, tickYEnd);
      this.ctx.stroke();
    }
  }

  drawZoomButtons(zoomStart: number, zoomEnd: number): { type: string; x: number; y: number; width: number; height: number }[] {
    const buttonSize = 24;
    const buttonGap = 6;
    const startX = this.width - this.padding - (buttonSize * 3 + buttonGap * 2);
    const startY = this.padding + 5;
    
    const zoomButtons: { type: string; x: number; y: number; width: number; height: number }[] = [];
    
    const buttons = [
      { type: 'zoomIn', label: '+' },
      { type: 'zoomOut', label: '−' },
      { type: 'reset', label: '↺' }
    ];
    
    buttons.forEach((btn, i) => {
      const x = startX + i * (buttonSize + buttonGap);
      const y = startY;
      
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      this.ctx.strokeStyle = '#999';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, buttonSize, buttonSize, 4);
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.fillStyle = '#333';
      this.ctx.font = 'bold 16px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(btn.label, x + buttonSize / 2, y + buttonSize / 2);
      
      zoomButtons.push({ type: btn.type, x, y, width: buttonSize, height: buttonSize });
    });
    
    if (zoomStart > 0 || zoomEnd < 100) {
      this.ctx.font = '10px Arial';
      this.ctx.fillStyle = '#666';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`${zoomStart.toFixed(0)}%-${zoomEnd.toFixed(0)}%`, startX, startY + buttonSize + 12);
    }
    
    return zoomButtons;
  }

  drawDragSelection(
    isDragging: boolean,
    dragStartX: number | null,
    dragCurrentX: number | null,
    chartBottom: number
  ) {
    if (!isDragging || dragStartX === null || dragCurrentX === null) return;
    
    const selectionLeft = Math.min(dragStartX, dragCurrentX);
    const selectionWidth = Math.abs(dragCurrentX - dragStartX);
    
    this.ctx.fillStyle = 'rgba(74, 144, 217, 0.2)';
    this.ctx.fillRect(selectionLeft, this.padding, selectionWidth, chartBottom - this.padding);
    
    this.ctx.strokeStyle = '#4a90d9';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeRect(selectionLeft, this.padding, selectionWidth, chartBottom - this.padding);
    this.ctx.setLineDash([]);
  }

  drawCrosshair(
    mouseX: number,
    mouseY: number,
    priceHeight: number,
    volumeTopY: number,
    volumeHeight: number,
    obvTopY: number,
    obvHeight: number,
    hasVolume: boolean,
    hasOBV: boolean,
    sortedTimes: number[],
    displayMinTime?: number,
    displayMaxTime?: number
  ) {
    if (mouseX < this.padding || mouseX > this.width - this.padding) return;
    
    const xAxisLabelHeight = 40;
    let isInChartArea = false;
    
    if (mouseY >= this.padding && mouseY <= priceHeight) isInChartArea = true;
    if (hasVolume && volumeHeight > 0 && mouseY >= volumeTopY && mouseY <= volumeTopY + volumeHeight) isInChartArea = true;
    if (hasOBV && obvHeight > 0 && mouseY >= obvTopY && mouseY <= obvTopY + obvHeight) isInChartArea = true;
    
    if (!isInChartArea) return;
    
    let chartBottom = priceHeight;
    if (hasVolume && volumeHeight > 0) chartBottom = volumeTopY + volumeHeight;
    if (hasOBV && obvHeight > 0) chartBottom = obvTopY + obvHeight;
    
    this.ctx.strokeStyle = '#666666';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(mouseX, this.padding);
    this.ctx.lineTo(mouseX, chartBottom);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, mouseY);
    this.ctx.lineTo(this.width - this.padding, mouseY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    const timePercent = (mouseX - this.padding) / (this.width - this.padding * 2);
    
    if (sortedTimes.length > 0) {
      const minTime = displayMinTime ?? sortedTimes[0];
      const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
      const timeRange = maxTime - minTime || 1;
      const currentTime = minTime + timePercent * timeRange;
      const date = new Date(currentTime * 1000);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      
      this.ctx.fillStyle = '#333333';
      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(dateStr, mouseX, this.height - this.padding + 35);
    }

    let valueStr = '';
    
    if (mouseY >= this.padding && mouseY <= priceHeight) {
      const graphHeight = priceHeight - this.padding;
      const scaledValue = (priceHeight - mouseY) / graphHeight;
      const normalizedValue = (scaledValue - this.chartMargin) / (1 - this.chartMargin * 2);
      const valuePercent = normalizedValue * 100;
      valueStr = `${valuePercent.toFixed(1)}%`;
    } else if (hasVolume && volumeHeight > 0 && mouseY >= volumeTopY && mouseY <= volumeTopY + volumeHeight) {
      const scaledValue = 1 - (mouseY - volumeTopY) / volumeHeight;
      const normalizedValue = (scaledValue - this.chartMargin) / (1 - this.chartMargin * 2);
      const valuePercent = normalizedValue * 100;
      valueStr = `${valuePercent.toFixed(1)}%`;
    } else if (hasOBV && obvHeight > 0 && mouseY >= obvTopY && mouseY <= obvTopY + obvHeight) {
      const scaledValue = 1 - (mouseY - obvTopY) / obvHeight;
      const normalizedValue = (scaledValue - this.chartMargin) / (1 - this.chartMargin * 2);
      const valuePercent = normalizedValue * 100;
      valueStr = `${valuePercent.toFixed(1)}%`;
    }
    
    if (valueStr) {
      this.ctx.fillStyle = '#333333';
      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(valueStr, this.width - this.padding + 5, mouseY);
    }
  }

  drawDataPoints(
    visibleTickers: Set<string>,
    priceHeight: number,
    volumeTopY: number,
    volumeHeight: number,
    obvTopY: number,
    obvHeight: number,
    hasVolume: boolean,
    hasOBV: boolean,
    sortedTimes: number[],
    displayMinTime?: number,
    displayMaxTime?: number
  ): { symbol: string; x: number; y: number; value: number; time: number; chartType: string }[] {
    const dataPoints: { symbol: string; x: number; y: number; value: number; time: number; chartType: string }[] = [];
    
    if (sortedTimes.length === 0) return dataPoints;

    const minTime = displayMinTime ?? sortedTimes[0];
    const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];

    const graphTop = this.padding;
    const graphBottom = priceHeight;
    const graphHeight = graphBottom - graphTop;

    // 각 티커별 min/max 계산
    const minMaxBySymbol = new Map<string, { min: number; max: number }>();
    const volumeMinMaxBySymbol = new Map<string, { min: number; max: number }>();
    const obvMinMaxBySymbol = new Map<string, { min: number; max: number; values: number[] }>();

    this.dataMap.forEach((data, symbol) => {
      const closes = data.map(d => d.close).filter(c => c > 0);
      if (closes.length > 0) {
        minMaxBySymbol.set(symbol, { min: Math.min(...closes), max: Math.max(...closes) });
      }
      
      const volumes = data.map(d => d.volume || 0).filter(v => v > 0);
      if (volumes.length > 0) {
        volumeMinMaxBySymbol.set(symbol, { min: Math.min(...volumes), max: Math.max(...volumes) });
      }
      
      const obvValues = this.calculateOBV(data);
      if (obvValues.length > 0) {
        obvMinMaxBySymbol.set(symbol, { min: Math.min(...obvValues), max: Math.max(...obvValues), values: obvValues });
      }
    });

    let colorIndex = 0;
    const pointRadius = 2;
    const clipLeft = this.padding;
    const clipRight = this.width - this.padding;

    this.dataMap.forEach((data, symbol) => {
      if (!visibleTickers.has(symbol)) {
        colorIndex++;
        return;
      }

      const color = this.colors[colorIndex % this.colors.length];
      const priceMinMax = minMaxBySymbol.get(symbol);
      const volumeMinMax = volumeMinMaxBySymbol.get(symbol);
      const obvData = obvMinMaxBySymbol.get(symbol);

      // Price 포인트
      if (priceMinMax) {
        data.forEach(d => {
          if (!d.close || d.close <= 0) return;
          const time = new Date(d.timestamp).getTime() / 1000;
          if (time < minTime || time > maxTime) return;

          const x = this.getX(time, minTime, maxTime);
          if (x < clipLeft || x > clipRight) return;
          
          const normalizedValue = (d.close - priceMinMax.min) / (priceMinMax.max - priceMinMax.min || 1);
          const scaledValue = this.chartMargin + normalizedValue * (1 - this.chartMargin * 2);
          const y = graphTop + (1 - scaledValue) * graphHeight;

          this.ctx.fillStyle = color;
          this.ctx.beginPath();
          this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
          this.ctx.fill();

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

          const x = this.getX(time, minTime, maxTime);
          if (x < clipLeft || x > clipRight) return;
          
          const normalizedValue = (volume - volumeMinMax.min) / (volumeMinMax.max - volumeMinMax.min || 1);
          const scaledValue = this.chartMargin + normalizedValue * (1 - this.chartMargin * 2);
          const y = volumeTopY + (1 - scaledValue) * volumeHeight;

          this.ctx.fillStyle = color;
          this.ctx.beginPath();
          this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
          this.ctx.fill();

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

          const x = this.getX(time, minTime, maxTime);
          if (x < clipLeft || x > clipRight) return;
          
          const normalizedValue = (obvValues[i] - obvData.min) / (obvData.max - obvData.min || 1);
          const scaledValue = this.chartMargin + normalizedValue * (1 - this.chartMargin * 2);
          const y = obvTopY + (1 - scaledValue) * obvHeight;

          this.ctx.fillStyle = color;
          this.ctx.beginPath();
          this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
          this.ctx.fill();

          dataPoints.push({ symbol, x, y, value: obvValues[i], time, chartType: 'OBV' });
        });
      }

      colorIndex++;
    });
    
    return dataPoints;
  }

  drawPointTooltip(
    point: { symbol: string; x: number; y: number; value: number; time: number; chartType: string },
    canvasWidth: number
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
    
    this.ctx.font = 'bold 11px Arial';
    const textWidth = Math.max(this.ctx.measureText(text).width, this.ctx.measureText(subText).width);
    const tooltipWidth = textWidth + 16;
    const tooltipHeight = 36;
    
    let tooltipX = point.x + 10;
    let tooltipY = point.y - tooltipHeight - 5;
    
    if (tooltipX + tooltipWidth > canvasWidth - this.padding) {
      tooltipX = point.x - tooltipWidth - 10;
    }
    if (tooltipY < this.padding) {
      tooltipY = point.y + 10;
    }
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    this.ctx.beginPath();
    this.ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text, tooltipX + 8, tooltipY + 6);
    this.ctx.font = '10px Arial';
    this.ctx.fillStyle = '#AAAAAA';
    this.ctx.fillText(subText, tooltipX + 8, tooltipY + 20);
  }

  private isInChartArea(x: number, y: number): boolean {
    return x >= this.padding && x <= this.canvasWidth - this.padding && y >= this.padding;
  }

  private xToZoomPercent(x: number): number {
    const chartWidth = this.canvasWidth - this.padding * 2;
    const xInChart = x - this.padding;
    const percentInView = xInChart / chartWidth;
    return this.zoomStart + percentInView * (this.zoomEnd - this.zoomStart);
  }

  private zoomIn(focusX?: number) {
    const range = this.zoomEnd - this.zoomStart;
    if (range <= 10) return;
    
    let focusPercent: number;
    if (focusX !== undefined) {
      focusPercent = this.xToZoomPercent(focusX);
    } else {
      focusPercent = (this.zoomStart + this.zoomEnd) / 2;
    }
    
    const newRange = range * 0.7;
    const focusRatio = (focusPercent - this.zoomStart) / range;
    this.zoomStart = Math.max(0, focusPercent - newRange * focusRatio);
    this.zoomEnd = Math.min(100, focusPercent + newRange * (1 - focusRatio));
    
    if (this.zoomStart < 0) {
      this.zoomEnd -= this.zoomStart;
      this.zoomStart = 0;
    }
    if (this.zoomEnd > 100) {
      this.zoomStart -= (this.zoomEnd - 100);
      this.zoomEnd = 100;
    }
    
    this.zoomStart = Math.round(this.zoomStart * 100) / 100;
    this.zoomEnd = Math.round(this.zoomEnd * 100) / 100;
    
    if (Math.abs(this.zoomStart) < 0.5 && Math.abs(this.zoomEnd - 100) < 0.5) {
      this.zoomStart = 0;
      this.zoomEnd = 100;
      this.isPanning = false;
      this.panStartX = null;
      this.isTouchPanning = false;
    }
    
    this.render();
  }

  private zoomOut(focusX?: number) {
    const range = this.zoomEnd - this.zoomStart;
    if (range >= 100) return;
    
    let focusPercent: number;
    if (focusX !== undefined) {
      focusPercent = this.xToZoomPercent(focusX);
    } else {
      focusPercent = (this.zoomStart + this.zoomEnd) / 2;
    }
    
    const newRange = Math.min(100, range * 1.4);
    const focusRatio = (focusPercent - this.zoomStart) / range;
    this.zoomStart = Math.max(0, focusPercent - newRange * focusRatio);
    this.zoomEnd = Math.min(100, focusPercent + newRange * (1 - focusRatio));
    
    if (this.zoomStart < 0) {
      this.zoomEnd -= this.zoomStart;
      this.zoomStart = 0;
    }
    if (this.zoomEnd > 100) {
      this.zoomStart -= (this.zoomEnd - 100);
      this.zoomEnd = 100;
    }
    
    this.zoomStart = Math.round(this.zoomStart * 100) / 100;
    this.zoomEnd = Math.round(this.zoomEnd * 100) / 100;
    
    if (Math.abs(this.zoomStart) < 0.5 && Math.abs(this.zoomEnd - 100) < 0.5) {
      this.zoomStart = 0;
      this.zoomEnd = 100;
      this.isPanning = false;
      this.panStartX = null;
      this.isTouchPanning = false;
    }
    
    this.render();
  }

  private zoomReset() {
    this.zoomStart = 0;
    this.zoomEnd = 100;
    this.isPanning = false;
    this.panStartX = null;
    this.isTouchPanning = false;
    this.isDragging = false;
    this.dragStartX = null;
    this.dragCurrentX = null;
    this.isTouchDragging = false;
    this.render();
  }

  private getPinchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private setupEventListeners() {
    // 마우스 이동
    this.canvas.addEventListener('mousemove', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      
      if (this.isDragging && this.dragStartX !== null) {
        this.dragCurrentX = Math.max(this.padding, Math.min(this.canvasWidth - this.padding, this.mouseX));
        this.render();
        return;
      }
      
      if (this.isPanning && this.panStartX !== null) {
        const dx = this.mouseX - this.panStartX;
        const pixelRange = this.canvasWidth - this.padding * 2;
        const percentDelta = (dx / pixelRange) * (this.zoomEnd - this.zoomStart);
        
        let newStart = this.zoomStart - percentDelta;
        let newEnd = this.zoomEnd - percentDelta;
        
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd > 100) {
          newStart -= (newEnd - 100);
          newEnd = 100;
        }
        
        this.zoomStart = Math.max(0, newStart);
        this.zoomEnd = Math.min(100, newEnd);
        this.panStartX = this.mouseX;
        
        this.zoomStart = Math.round(this.zoomStart * 100) / 100;
        this.zoomEnd = Math.round(this.zoomEnd * 100) / 100;
        
        if (Math.abs(this.zoomStart) < 0.5 && Math.abs(this.zoomEnd - 100) < 0.5) {
          this.zoomStart = 0;
          this.zoomEnd = 100;
          this.isPanning = false;
          this.panStartX = null;
        }
        
        this.render();
        return;
      }
      
      if (this.state.showPoints && this.dataPoints.length > 0) {
        const hoverRadius = 6;
        let foundPoint = null;
        for (const point of this.dataPoints) {
          const dx = this.mouseX - point.x;
          const dy = this.mouseY - point.y;
          if (Math.sqrt(dx * dx + dy * dy) <= hoverRadius) {
            foundPoint = point;
            break;
          }
        }
        this.hoveredPoint = foundPoint;
      }
      
      let cursor = 'pointer'; // 'crosshair';
      
      for (const btn of this.zoomButtons) {
        if (this.mouseX >= btn.x && this.mouseX <= btn.x + btn.width &&
            this.mouseY >= btn.y && this.mouseY <= btn.y + btn.height) {
          cursor = 'pointer';
          break;
        }
      }
      
      for (const item of this.legendItems) {
        if (this.mouseX >= item.x && this.mouseX <= item.x + item.width &&
            this.mouseY >= item.y && this.mouseY <= item.y + item.height) {
          cursor = 'pointer';
          break;
        }
      }
      
      if ((this.zoomStart > 0 || this.zoomEnd < 100) && this.isInChartArea(this.mouseX, this.mouseY) && cursor === 'crosshair') {
        cursor = 'grab';
      }
      
      this.canvas.style.cursor = cursor;
      this.render();
    });

    // 마우스 나감
    this.canvas.addEventListener('mouseleave', () => {
      this.mouseX = null;
      this.mouseY = null;
      this.hoveredPoint = null;
      this.isDragging = false;
      this.dragStartX = null;
      this.dragCurrentX = null;
      this.isPanning = false;
      this.panStartX = null;
      this.render();
    });

    // 마우스 다운
    this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      for (const btn of this.zoomButtons) {
        if (x >= btn.x && x <= btn.x + btn.width &&
            y >= btn.y && y <= btn.y + btn.height) {
          return;
        }
      }
      
      for (const item of this.legendItems) {
        if (x >= item.x && x <= item.x + item.width &&
            y >= item.y && y <= item.y + item.height) {
          return;
        }
      }
      
      if (this.isInChartArea(x, y)) {
        if (this.zoomStart === 0 && this.zoomEnd === 100) {
          this.isDragging = true;
          this.dragStartX = x;
          this.dragCurrentX = x;
        } else {
          this.isPanning = true;
          this.panStartX = x;
        }
      }
    });

    // 마우스 업
    this.canvas.addEventListener('mouseup', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      
      if (this.isDragging && this.dragStartX !== null && this.dragCurrentX !== null) {
        const startX = Math.min(this.dragStartX, this.dragCurrentX);
        const endX = Math.max(this.dragStartX, this.dragCurrentX);
        const selectionWidth = endX - startX;
        
        if (selectionWidth > 10) {
          const chartWidth = this.canvasWidth - this.padding * 2;
          const startPercent = ((startX - this.padding) / chartWidth) * 100;
          const endPercent = ((endX - this.padding) / chartWidth) * 100;
          
          if (this.zoomStart === 0 && this.zoomEnd === 100) {
            this.zoomStart = startPercent;
            this.zoomEnd = endPercent;
          } else {
            const currentRange = this.zoomEnd - this.zoomStart;
            this.zoomStart = this.zoomStart + (startPercent / 100) * currentRange;
            this.zoomEnd = this.zoomStart + ((endPercent - startPercent) / 100) * currentRange;
          }
          this.zoomStart = Math.max(0, this.zoomStart);
          this.zoomEnd = Math.min(100, this.zoomEnd);
        }
        
        this.isDragging = false;
        this.dragStartX = null;
        this.dragCurrentX = null;
        this.render();
        return;
      }
      
      if (this.isPanning) {
        this.isPanning = false;
        this.panStartX = null;
        this.canvas.style.cursor = 'grab';
        this.render();
      }
    });

    // 클릭
    this.canvas.addEventListener('click', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      for (const btn of this.zoomButtons) {
        if (clickX >= btn.x && clickX <= btn.x + btn.width &&
            clickY >= btn.y && clickY <= btn.y + btn.height) {
          if (btn.type === 'zoomIn') this.zoomIn();
          else if (btn.type === 'zoomOut') this.zoomOut();
          else if (btn.type === 'reset') this.zoomReset();
          return;
        }
      }
      
      if (this.state.showPoints && this.dataPoints.length > 0) {
        const clickRadius = 12;
        for (const point of this.dataPoints) {
          const dx = clickX - point.x;
          const dy = clickY - point.y;
          if (Math.sqrt(dx * dx + dy * dy) <= clickRadius) {
            this.hoveredPoint = this.hoveredPoint === point ? null : point;
            this.render();
            return;
          }
        }
      }
      
      for (const item of this.legendItems) {
        if (clickX >= item.x && clickX <= item.x + item.width &&
            clickY >= item.y && clickY <= item.y + item.height) {
          if (this.state.visibleTickers.has(item.symbol)) {
            this.state.visibleTickers.delete(item.symbol);
          } else {
            this.state.visibleTickers.add(item.symbol);
          }
          this.render();
          break;
        }
      }
    });

    // 휠
    this.canvas.addEventListener('wheel', (e: WheelEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      if (this.isInChartArea(x, y)) {
        e.preventDefault();
        if (e.deltaY < 0) {
          this.zoomIn(x);
        } else {
          this.zoomOut(x);
        }
      }
    }, { passive: false });

    // 터치 시작
    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (e.touches.length === 2) {
        this.lastPinchDistance = this.getPinchDistance(e.touches);
        this.isTouchDragging = false;
        this.isTouchPanning = false;
        return;
      }

      for (const btn of this.zoomButtons) {
        if (x >= btn.x && x <= btn.x + btn.width &&
            y >= btn.y && y <= btn.y + btn.height) {
          return;
        }
      }

      if (this.isInChartArea(x, y)) {
        this.touchStartX = x;
        this.touchStartY = y;
        
        if (this.zoomStart === 0 && this.zoomEnd === 100) {
          this.isTouchDragging = true;
          this.dragStartX = x;
          this.dragCurrentX = x;
        } else {
          this.isTouchPanning = true;
          this.panStartX = x;
        }
      }
    }, { passive: true });

    // 터치 이동
    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      const rect = this.canvas.getBoundingClientRect();

      if (e.touches.length === 2 && this.lastPinchDistance !== null) {
        e.preventDefault();
        const newDistance = this.getPinchDistance(e.touches);
        const delta = newDistance - this.lastPinchDistance;
        
        const pinchCenterX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        
        if (Math.abs(delta) > 10) {
          if (delta > 0) {
            this.zoomIn(pinchCenterX);
          } else {
            this.zoomOut(pinchCenterX);
          }
          this.lastPinchDistance = newDistance;
        }
        return;
      }

      if (e.touches.length !== 1) return;
      
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      if (this.isTouchDragging && this.dragStartX !== null) {
        e.preventDefault();
        this.dragCurrentX = Math.max(this.padding, Math.min(this.canvasWidth - this.padding, x));
        this.isDragging = true;
        this.render();
        return;
      }

      if (this.isTouchPanning && this.panStartX !== null) {
        e.preventDefault();
        const dx = x - this.panStartX;
        const pixelRange = this.canvasWidth - this.padding * 2;
        const percentDelta = (dx / pixelRange) * (this.zoomEnd - this.zoomStart);
        
        let newStart = this.zoomStart - percentDelta;
        let newEnd = this.zoomEnd - percentDelta;
        
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd > 100) {
          newStart -= (newEnd - 100);
          newEnd = 100;
        }
        
        this.zoomStart = Math.max(0, newStart);
        this.zoomEnd = Math.min(100, newEnd);
        this.panStartX = x;
        
        this.zoomStart = Math.round(this.zoomStart * 100) / 100;
        this.zoomEnd = Math.round(this.zoomEnd * 100) / 100;
        
        if (Math.abs(this.zoomStart) < 0.5 && Math.abs(this.zoomEnd - 100) < 0.5) {
          this.zoomStart = 0;
          this.zoomEnd = 100;
          this.isTouchPanning = false;
          this.panStartX = null;
        }
        
        this.render();
        return;
      }
    }, { passive: false });

    // 터치 종료
    this.canvas.addEventListener('touchend', (e: TouchEvent) => {
      const rect = this.canvas.getBoundingClientRect();

      if (this.lastPinchDistance !== null) {
        this.lastPinchDistance = null;
        return;
      }

      if (this.isTouchDragging && this.dragStartX !== null && this.dragCurrentX !== null) {
        const startX = Math.min(this.dragStartX, this.dragCurrentX);
        const endX = Math.max(this.dragStartX, this.dragCurrentX);
        const selectionWidth = endX - startX;
        
        if (selectionWidth > 20) {
          const chartWidth = this.canvasWidth - this.padding * 2;
          const startPercent = ((startX - this.padding) / chartWidth) * 100;
          const endPercent = ((endX - this.padding) / chartWidth) * 100;
          
          if (this.zoomStart === 0 && this.zoomEnd === 100) {
            this.zoomStart = startPercent;
            this.zoomEnd = endPercent;
          } else {
            const currentRange = this.zoomEnd - this.zoomStart;
            this.zoomStart = this.zoomStart + (startPercent / 100) * currentRange;
            this.zoomEnd = this.zoomStart + ((endPercent - startPercent) / 100) * currentRange;
          }
          this.zoomStart = Math.max(0, this.zoomStart);
          this.zoomEnd = Math.min(100, this.zoomEnd);
        } else if (selectionWidth < 10 && this.touchStartX !== null && this.touchStartY !== null) {
          const tapX = this.touchStartX;
          const tapY = this.touchStartY;
          
          for (const btn of this.zoomButtons) {
            if (tapX >= btn.x && tapX <= btn.x + btn.width &&
                tapY >= btn.y && tapY <= btn.y + btn.height) {
              if (btn.type === 'zoomIn') this.zoomIn();
              else if (btn.type === 'zoomOut') this.zoomOut();
              else if (btn.type === 'reset') this.zoomReset();
              break;
            }
          }
          
          if (this.state.showPoints && this.dataPoints.length > 0) {
            const tapRadius = 20;
            for (const point of this.dataPoints) {
              const dx = tapX - point.x;
              const dy = tapY - point.y;
              if (Math.sqrt(dx * dx + dy * dy) <= tapRadius) {
                this.hoveredPoint = this.hoveredPoint === point ? null : point;
                break;
              }
            }
          }
          
          for (const item of this.legendItems) {
            if (tapX >= item.x && tapX <= item.x + item.width &&
                tapY >= item.y && tapY <= item.y + item.height) {
              if (this.state.visibleTickers.has(item.symbol)) {
                this.state.visibleTickers.delete(item.symbol);
              } else {
                this.state.visibleTickers.add(item.symbol);
              }
              break;
            }
          }
        }
        
        this.isTouchDragging = false;
        this.isDragging = false;
        this.dragStartX = null;
        this.dragCurrentX = null;
        this.render();
        return;
      }

      if (this.isTouchPanning) {
        this.isTouchPanning = false;
        this.panStartX = null;
        this.render();
      }

      this.touchStartX = null;
      this.touchStartY = null;
    }, { passive: true });

    // 터치 취소
    this.canvas.addEventListener('touchcancel', () => {
      this.isTouchDragging = false;
      this.isTouchPanning = false;
      this.isDragging = false;
      this.dragStartX = null;
      this.dragCurrentX = null;
      this.panStartX = null;
      this.touchStartX = null;
      this.touchStartY = null;
      this.lastPinchDistance = null;
      this.render();
    }, { passive: true });
  }

  private groupDataByDay(dataMap: Map<string, ChartData[]>): Map<string, ChartData[]> {
    const groupedMap = new Map<string, ChartData[]>();
    
    dataMap.forEach((data, symbol) => {
      const dailyMap = new Map<string, ChartData>();
      
      data.forEach(d => {
        const dateOnly = d.timestamp.split(' ')[0];
        const dayKey = `${dateOnly} 00:00:00`;
        
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
          const existing = dailyMap.get(dayKey)!;
          existing.high = Math.max(existing.high, d.high);
          existing.low = Math.min(existing.low, d.low);
          existing.close = d.close;
          if (existing.volume !== undefined && d.volume !== undefined) {
            existing.volume += d.volume;
          }
        }
      });
      
      const groupedData = Array.from(dailyMap.values()).sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      
      groupedMap.set(symbol, groupedData);
    });
    
    return groupedMap;
  }

  render() {
    const dpr = window.devicePixelRatio || 1;
    const { width: cssW, height: cssH } = this.canvas.getBoundingClientRect();
    const width = Math.max(300, cssW);
    let totalHeight = Math.max(200, cssH);
    
    // Price/Volume/OBV 레이아웃 계산
    let priceChartHeight: number;
    let volumeChartHeight = 0;
    let obvChartHeight = 0;
    let volumeTopY = 0;
    let obvTopY = 0;
    
    let chartCount = 1;
    if (this.state.showVolume) chartCount++;
    if (this.state.showOBV) chartCount++;
    
    const xAxisLabelHeight = 40;
    const availableHeight = totalHeight - this.padding - xAxisLabelHeight;
    const heightPerChart = availableHeight / chartCount;
    
    if (this.state.showVolume && this.state.showOBV) {
      priceChartHeight = this.padding + heightPerChart;
      volumeChartHeight = heightPerChart;
      obvChartHeight = heightPerChart;
      volumeTopY = priceChartHeight;
      obvTopY = volumeTopY + volumeChartHeight;
    } else if (this.state.showVolume) {
      priceChartHeight = this.padding + heightPerChart;
      volumeChartHeight = heightPerChart;
      volumeTopY = priceChartHeight;
    } else if (this.state.showOBV) {
      priceChartHeight = this.padding + heightPerChart;
      obvChartHeight = heightPerChart;
      obvTopY = priceChartHeight;
    } else {
      priceChartHeight = totalHeight - xAxisLabelHeight;
    }
    
    this.canvas.width = width * dpr;
    this.canvas.height = totalHeight * dpr;
    this.width = width;
    this.height = totalHeight;
    this.canvasWidth = width;
    this.canvasHeight = totalHeight;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    // 활성화된 티커만 필터링
    let filteredDataMap = new Map<string, ChartData[]>();
    this.dataMap.forEach((data, symbol) => {
      if (this.state.enabledTickers.has(symbol)) {
        filteredDataMap.set(symbol, data);
      }
    });
    
    // 일자별 그룹 적용
    if (this.state.dailyGroup) {
      filteredDataMap = this.groupDataByDay(filteredDataMap);
    }
    
    // 전체 시간 범위 계산
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
    
    if (this.state.rangeMin > 0 || this.state.rangeMax < 100) {
      targetMinTime = globalMinTime + globalTimeRange * this.state.rangeMin / 100;
      targetMaxTime = globalMinTime + globalTimeRange * this.state.rangeMax / 100;
    }
    
    // zoom 범위 적용
    if (this.zoomStart > 0 || this.zoomEnd < 100) {
      const rangeTimeSpan = targetMaxTime - targetMinTime;
      const zoomMinTime = targetMinTime + rangeTimeSpan * this.zoomStart / 100;
      const zoomMaxTime = targetMinTime + rangeTimeSpan * this.zoomEnd / 100;
      targetMinTime = zoomMinTime;
      targetMaxTime = zoomMaxTime;
    }
    
    // 시간 기반으로 각 티커 필터링
    if (this.state.rangeMin > 0 || this.state.rangeMax < 100 || this.zoomStart > 0 || this.zoomEnd < 100) {
      const timeFilteredMap = new Map<string, ChartData[]>();
      filteredDataMap.forEach((data, symbol) => {
        if (data.length === 0) {
          timeFilteredMap.set(symbol, []);
          return;
        }
        
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
          timeFilteredMap.set(symbol, []);
          return;
        }
        
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
    this.sortedTimes = Array.from(allTimePoints).sort((a, b) => a - b);
    
    const displayMinTime = targetMinTime;
    const displayMaxTime = targetMaxTime;
    
    // 데이터 업데이트
    const oldDataMap = this.dataMap;
    this.dataMap = filteredDataMap;
    
    // Chart options
    const chartOptions: ChartOptions = {
      showCandles: this.state.showCandles,
      fillGaps: this.state.showGaps,
      smoothMode: this.state.smoothMode,
      showAverage: this.state.showAverage,
      hideValues: this.state.hideValues,
      hideLines: this.state.hideLines,
      showGrid: this.state.showGrid,
      displayMinTime,
      displayMaxTime
    };
    
    // Draw Price chart
    const priceResult = this.drawPrice(this.state.visibleTickers, priceChartHeight, chartOptions);
    
    // Draw legend
    if (priceResult) {
      this.legendItems = this.drawLegend(priceResult.dataBySymbol, this.state.visibleTickers, []);
    }
    
    // Draw Volume chart
    if (this.state.showVolume) {
      this.drawVolume(this.state.visibleTickers, volumeTopY, volumeChartHeight, this.sortedTimes, chartOptions);
    }
    
    // Draw OBV chart
    if (this.state.showOBV) {
      this.drawOBV(this.state.visibleTickers, obvTopY, obvChartHeight, this.sortedTimes, chartOptions);
    }

    // 차트 간 구분선 그리기
    this.drawChartDividers(volumeTopY, obvTopY, this.state.showVolume, this.state.showOBV);

    // 차트 영역의 실제 하단 계산
    let chartBottom = priceChartHeight;
    if (this.state.showVolume && volumeChartHeight > 0) {
      chartBottom = volumeTopY + volumeChartHeight;
    }
    if (this.state.showOBV && obvChartHeight > 0) {
      chartBottom = obvTopY + obvChartHeight;
    }
    
    // 이벤트 마커
    this.drawEventMarkers(this.sortedTimes, chartBottom, this.state.showEvents, displayMinTime, displayMaxTime);

    // X축 레이블
    this.drawXAxisLabels(this.sortedTimes, chartBottom, displayMinTime, displayMaxTime);

    // 포인트 그리기
    if (this.state.showPoints) {
      this.dataPoints = this.drawDataPoints(this.state.visibleTickers, priceChartHeight, volumeTopY, volumeChartHeight, obvTopY, obvChartHeight, this.state.showVolume, this.state.showOBV, this.sortedTimes, displayMinTime, displayMaxTime);
    } else {
      this.dataPoints = [];
    }

    // 호버된 포인트 툴팁 표시
    if (this.state.showPoints && this.hoveredPoint) {
      this.drawPointTooltip(this.hoveredPoint, width);
    }

    // 줌 버튼 그리기
    this.zoomButtons = this.drawZoomButtons(this.zoomStart, this.zoomEnd);

    // 드래그 선택 영역 그리기
    this.drawDragSelection(this.isDragging, this.dragStartX, this.dragCurrentX, chartBottom);

    // 크로스헤어 그리기
    if (this.mouseX !== null && this.mouseY !== null && !this.isDragging && !this.isPanning) {
      this.drawCrosshair(this.mouseX, this.mouseY, priceChartHeight, volumeTopY, volumeChartHeight, obvTopY, obvChartHeight, this.state.showVolume, this.state.showOBV, this.sortedTimes, displayMinTime, displayMaxTime);
    }
    
    // 데이터 복원
    this.dataMap = oldDataMap;
  }
}

export type { ChartData, EventMarker, ChartOptions, RenderState };
