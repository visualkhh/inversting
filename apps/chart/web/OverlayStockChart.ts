type ChartData = {
  x: number;
  yOpen?: number | null;
  yHigh?: number | null;
  yLow?: number | null;
  y: number;
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

interface FormatResult {
  value: string;
  font?: string;
  fillStyle?: string;
  textAlign?: CanvasTextAlign;
  textBaseline?: CanvasTextBaseline;
}

type FormatReturn = string | FormatResult;

interface ChartConfig {
  xFormat?: (xValue: number, chartKey?: string) => FormatReturn; // X축 레이블 포맷
  yFormat?: (yValue: number, chartKey?: string) => FormatReturn; // Y축 레이블 포맷
  labelFormat?: (chartKey: string) => FormatReturn; // 차트 키별 Y축 타이틀 포맷
  crosshairXFormat?: (xValue: number) => FormatReturn; // 크로스헤어 X축 값 포맷
  crosshairYFormat?: (yValue: number, chartKey: string, isNormalized: boolean) => FormatReturn; // 크로스헤어 Y축 값 포맷
  tooltipLabelFormat?: (symbol: string, chartKey: string, value: number, time: number) => FormatReturn; // 툴팁 메인 텍스트 포맷 (전체)
  tooltipXFormat?: (xValue: number, symbol: string, chartKey: string) => FormatReturn; // 툴팁 서브 텍스트 포맷
  tooltipYFormat?: (yValue: number, chartKey: string, symbol: string) => FormatReturn; // 툴팁 Y축 값 포맷 (tooltipLabelFormat 없을 때)
  
  // 스타일 설정
  lineStrokeStyle?: string | ((symbol: string, chartKey: string) => string); // 라인 그래프 색상
  lineWidth?: number | ((symbol: string, chartKey: string) => number); // 라인 두께
  averageStrokeStyle?: string; // 평균선 색상
  averageLineWidth?: number; // 평균선 두께
  averageLineDash?: number[]; // 평균선 대시 패턴
  crosshairStrokeStyle?: string; // 크로스헤어 색상
  crosshairLineWidth?: number; // 크로스헤어 두께
  crosshairLineDash?: number[]; // 크로스헤어 대시 패턴
  candleUpColor?: string | ((symbol: string, chartKey: string) => string); // 상승 캔들 색상
  candleDownColor?: string | ((symbol: string, chartKey: string) => string); // 하락 캔들 색상
  candleBorderColor?: string | ((symbol: string, chartKey: string) => string); // 캔들 테두리 색상
  gridStrokeStyle?: string; // 그리드 색상
  gridLineWidth?: number; // 그리드 두께
  
  // 레이아웃 설정
  paddingLeft?: number; // 왼쪽 여백 (Y축 레이블 영역)
  paddingRight?: number; // 오른쪽 여백
  paddingTop?: number; // 위쪽 여백
  paddingBottom?: number; // 아래쪽 여백 (X축 레이블 영역)
  
  // 콜백
  onLegendClick?: (symbol: string, isVisible: boolean) => void; // 범례 클릭 콜백
}

interface RenderState {
  enabledTickers: Set<string>;
  visibleTickers: Set<string>;
  showEvents: boolean;
  showCandles: boolean;
  showGaps: boolean;
  visibleChartKeys: string[]; // 표시할 차트 키 목록 (순서대로)
  smoothMode: 'none' | 'smooth' | 'open' | 'high' | 'low' | 'middle';
  showAverage: boolean;
  hideValues: boolean;
  dailyGroup: boolean;
  hideLines: boolean;
  showGrid: boolean;
  showPoints: boolean;
  normalize: boolean;
  rangeMin: number;
  rangeMax: number;
}

export class OverlayStockChart {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private width: number;
  private height: number;
  private padding = 50; // 기본값, config로 오버라이드 가능
  private paddingLeft = 50;
  private paddingRight = 50;
  private paddingTop = 50;
  private paddingBottom = 50;
  private chartAreaWidth = 0; // 실제 차트 그리는 영역의 고정 너비
  private chartAreaLeft = 50; // 차트 영역 시작 X 좌표
  private colors = [
    '#0000FF', // Blue
    '#FF0000', // Red
    '#00AA00', // Green
    '#FF00FF', // Magenta
    '#FF8C00', // Dark Orange
    '#8B00FF', // Violet
    '#00CED1', // Dark Turquoise
    '#FF1493', // Deep Pink
    '#32CD32', // Lime Green
    '#FFD700', // Gold
    '#4169E1', // Royal Blue
    '#DC143C', // Crimson
    '#00FA9A', // Medium Spring Green
    '#FF69B4', // Hot Pink
    '#1E90FF', // Dodger Blue
    '#FF4500', // Orange Red
    '#9370DB', // Medium Purple
    '#00BFFF', // Deep Sky Blue
    '#FF6347', // Tomato
    '#48D1CC'  // Medium Turquoise
  ];
  private chartMargin = 0.1;
  private dataMap: Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }>;
  private commonEvents: EventMarker[];
  private tickerColors: Map<string, string> = new Map();
  private config: ChartConfig;
  
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
  
  // 더블탭 감지
  private lastTapTime = 0;
  private lastTapX = 0;
  private lastTapY = 0;

  constructor(
    canvas: HTMLCanvasElement,
    dataMap: Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }>,
    commonEvents: EventMarker[] = [],
    initialState: RenderState,
    config?: ChartConfig
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = 0;
    this.height = 0;
    this.dataMap = this.convertDataMap(dataMap);
    this.commonEvents = commonEvents;
    this.state = initialState;
    this.config = config || {};
    
    // padding 설정
    this.paddingLeft = this.config.paddingLeft ?? 50;
    this.paddingRight = this.config.paddingRight ?? 50;
    this.paddingTop = this.config.paddingTop ?? 50;
    this.paddingBottom = this.config.paddingBottom ?? 50;
    this.padding = 50; // 기본 padding (차트 영역 계산용)
    
    // 차트 영역은 기본 padding 기준으로 고정
    this.chartAreaLeft = this.padding;
    this.chartAreaWidth = 0; // render에서 계산됨
    
    // visibleChartKeys가 비어있으면 첫 번째 티커의 첫 번째 키를 기본값으로
    if (!this.state.visibleChartKeys || this.state.visibleChartKeys.length === 0) {
      const firstTicker = Array.from(dataMap.values())[0];
      if (firstTicker && firstTicker.data) {
        const firstKey = Object.keys(firstTicker.data)[0];
        if (firstKey) {
          this.state.visibleChartKeys = [firstKey];
        }
      }
    }
    
    // 티커별 색상 초기화
    let colorIndex = 0;
    dataMap.forEach((value, symbol) => {
      const color = value.color || this.colors[colorIndex % this.colors.length];
      this.tickerColors.set(symbol, color);
      colorIndex++;
    });
    
    this.setupEventListeners();
    this.setupResizeObserver();
  }

  // main.ts에서 받은 데이터를 내부 형식으로 변환
  private convertDataMap(
    inputMap: Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }>
  ): Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }> {
    return inputMap;
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

  setData(dataMap: Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }>, commonEvents: EventMarker[] = []) {
    this.dataMap = this.convertDataMap(dataMap);
    this.commonEvents = commonEvents;
    
    // 티커별 색상 재초기화
    this.tickerColors.clear();
    let colorIndex = 0;
    dataMap.forEach((value, symbol) => {
      const color = value.color || this.colors[colorIndex % this.colors.length];
      this.tickerColors.set(symbol, color);
      colorIndex++;
    });
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

  private getTickerColor(symbol: string): string {
    return this.tickerColors.get(symbol) || this.colors[0];
  }

  private applyFormatResult(result: FormatReturn): string {
    if (typeof result === 'string') {
      return result;
    }
    
    // 스타일 적용
    if (result.font) this.ctx.font = result.font;
    if (result.fillStyle) this.ctx.fillStyle = result.fillStyle;
    if (result.textAlign) this.ctx.textAlign = result.textAlign;
    if (result.textBaseline) this.ctx.textBaseline = result.textBaseline;
    
    return result.value;
  }

  private getChartRight(): number {
    return this.chartAreaLeft + this.chartAreaWidth;
  }



  private getX(time: number, minTime: number, maxTime: number): number {
    const timeRange = maxTime - minTime || 1;
    // 차트 영역 너비는 고정 (기본 padding 기준)
    const chartWidth = this.chartAreaWidth;
    const normalizedTime = (time - minTime) / timeRange;
    // 차트 시작 위치는 paddingLeft 사용
    return this.paddingLeft + normalizedTime * chartWidth;
  }

  private getY(value: number, minVal: number, maxVal: number, topY: number, height: number): number {
    const range = maxVal - minVal || 1;
    const normalizedValue = (value - minVal) / range;
    const scaledValue = this.chartMargin + normalizedValue * (1 - this.chartMargin * 2);
    return topY + (1 - scaledValue) * height;
  }

  drawChartKey(
    chartKey: string,
    visibleTickers: Set<string>,
    chartTopY: number,
    chartHeight: number,
    sortedTimes: number[],
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

    if (sortedTimes.length === 0) return;
    
    // 데이터 준비
    const dataBySymbol = new Map<string, { time: number; open: number; high: number; low: number; close: number }[]>();

    this.dataMap.forEach((value, symbol) => {
      const points: { time: number; open: number; high: number; low: number; close: number }[] = [];
      const chartData = value.data[chartKey] || [];
      chartData.forEach(d => {
        const time = d.x;
        if (d.y !== null && d.y !== undefined) {
          // yOpen, yHigh, yLow가 모두 유효한 경우에만 OHLC 데이터로 추가
          const hasOHLC = d.yOpen !== null && d.yOpen !== undefined &&
                          d.yHigh !== null && d.yHigh !== undefined &&
                          d.yLow !== null && d.yLow !== undefined;
          
          points.push({
            time,
            open: hasOHLC ? d.yOpen! : d.y,
            high: hasOHLC ? d.yHigh! : d.y,
            low: hasOHLC ? d.yLow! : d.y,
            close: d.y
          });
        }
      });
      dataBySymbol.set(symbol, points);
    });

    const minTime = displayMinTime ?? sortedTimes[0];
    const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
    const timeRange = maxTime - minTime || 1;

    const minMaxBySymbol = new Map<string, { min: number; max: number }>();
    
    if (this.state.normalize) {
      // 정규화: 각 티커별로 min/max 계산 (0~100%)
      dataBySymbol.forEach((points, symbol) => {
        const closes = points.map(p => p.close);
        if (closes.length > 0) {
          minMaxBySymbol.set(symbol, {
            min: Math.min(...closes),
            max: Math.max(...closes)
          });
        }
      });
    } else {
      // 정규화 안함: 모든 티커의 전체 min/max 사용
      let globalMin = Infinity;
      let globalMax = -Infinity;
      
      dataBySymbol.forEach((points) => {
        const closes = points.map(p => p.close);
        if (closes.length > 0) {
          globalMin = Math.min(globalMin, ...closes);
          globalMax = Math.max(globalMax, ...closes);
        }
      });
      
      // 모든 티커에 동일한 min/max 적용
      dataBySymbol.forEach((_, symbol) => {
        minMaxBySymbol.set(symbol, {
          min: globalMin,
          max: globalMax
        });
      });
    }

    const graphTop = chartTopY;
    const graphBottom = chartTopY + chartHeight;
    const graphHeight = chartHeight;

    // 배경
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, chartTopY, this.width, chartHeight);

    // 그리드
    if (showGrid) {
      this.drawGrid(graphTop, graphHeight);
    }

    // Y축
    this.drawYAxis(graphTop, graphBottom);

    // Y축 레이블
    if (!hideValues) {
      // 전체 min/max 계산 (비정규화 모드용)
      let globalMin = Infinity;
      let globalMax = -Infinity;
      minMaxBySymbol.forEach((minMax) => {
        globalMin = Math.min(globalMin, minMax.min);
        globalMax = Math.max(globalMax, minMax.max);
      });
      this.drawYAxisLabels(graphTop, graphHeight, graphBottom, globalMin, globalMax, chartKey);
    }

    // Y축 타이틀
    const labelFormatted = this.config.labelFormat ? this.config.labelFormat(chartKey) : chartKey;
    const yAxisLabel = this.applyFormatResult(labelFormatted);
    this.drawYAxisTitle(yAxisLabel, graphTop, graphBottom);

    // 심볼별 렌더링
    dataBySymbol.forEach((points, symbol) => {
      if (!visibleTickers.has(symbol)) {
        return;
      }

      const color = this.getTickerColor(symbol);
      const minMax = minMaxBySymbol.get(symbol)!;
      const sortedPoints = points.sort((a, b) => a.time - b.time);

      // 캔들
      if (showCandles) {
        this.drawCandles(sortedPoints, minMax, color, minTime, maxTime, graphTop, graphHeight, symbol, chartKey);
      }

      // 라인
      if (!hideLines) {
        this.drawLine(sortedPoints, minMax, color, minTime, maxTime, timeRange, sortedTimes.length, graphTop, graphHeight, fillGaps, smoothMode, symbol, chartKey);
      }
    });

    // 평균선
    if (showAverage && dataBySymbol.size > 0) {
      this.drawAverageLine(dataBySymbol, minMaxBySymbol, sortedTimes, minTime, maxTime, graphTop, graphHeight, smoothMode);
    }

    return { dataBySymbol, minMaxBySymbol, sortedTimes };
  }

  private drawGrid(topY: number, height: number) {
    const gridDivisions = 10;
    const gridWidth = this.chartAreaWidth;
    const gridStepX = gridWidth / gridDivisions;
    const gridStepY = height / gridDivisions;
    
    this.ctx.strokeStyle = this.config.gridStrokeStyle || '#CCCCCC';
    this.ctx.lineWidth = this.config.gridLineWidth || 1;
    
    for (let i = 0; i <= gridDivisions; i++) {
      const x = this.chartAreaLeft + gridStepX * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, topY);
      this.ctx.lineTo(x, topY + height);
      this.ctx.stroke();
    }
    
    for (let i = 0; i <= gridDivisions; i++) {
      const y = topY + gridStepY * i;
      this.ctx.beginPath();
      this.ctx.moveTo(this.chartAreaLeft, y);
      this.ctx.lineTo(this.getChartRight(), y);
      this.ctx.stroke();
    }
  }

  private drawYAxis(topY: number, bottomY: number) {
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.paddingLeft, topY);
    this.ctx.lineTo(this.paddingLeft, bottomY);
    this.ctx.stroke();
  }

  private drawYAxisLabels(topY: number, height: number, bottomY: number, minValue?: number, maxValue?: number, chartKey?: string) {
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Arial';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    
    for (let i = 0; i <= 5; i++) {
      const normalizedValue = (100 - i * 20) / 100;
      const scaledValue = this.chartMargin + normalizedValue * (1 - this.chartMargin * 2);
      const y = bottomY - scaledValue * height;
      
      let labelText: string;
      if (this.state.normalize || minValue === undefined || maxValue === undefined) {
        // 정규화 모드: % 표시
        const value = 100 - i * 20;
        labelText = `${value}%`;
      } else {
        // 비정규화 모드: 실제 값 표시
        const actualValue = minValue + normalizedValue * (maxValue - minValue);
        const formatted = this.config.yFormat ? this.config.yFormat(actualValue, chartKey) : actualValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
        labelText = this.applyFormatResult(formatted);
      }
      
      this.ctx.fillText(labelText, this.paddingLeft - 5, y);
      
      this.ctx.beginPath();
      this.ctx.moveTo(this.paddingLeft - 5, y);
      this.ctx.lineTo(this.paddingLeft, y);
      this.ctx.stroke();
    }
  }

  private drawYAxisTitle(title: string, topY: number, bottomY: number) {
    this.ctx.save();
    const labelY = (topY + bottomY) / 2;
    // paddingLeft가 작을 때는 타이틀을 왼쪽 끝에, 클 때는 적절한 위치에
    const titleX = Math.min(this.paddingLeft / 2, 8);
    this.ctx.translate(titleX, labelY);
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
    height: number,
    symbol?: string,
    chartKey?: string
  ) {
    if (points.length === 0) return;
    
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(this.chartAreaLeft, topY, this.chartAreaWidth, height);
    this.ctx.clip();
    
    points.forEach(point => {
      const x = this.getX(point.time, minTime, maxTime);
      const yHigh = this.getY(point.high, minMax.min, minMax.max, topY, height);
      const yLow = this.getY(point.low, minMax.min, minMax.max, topY, height);
      const yOpen = this.getY(point.open, minMax.min, minMax.max, topY, height);
      const yClose = this.getY(point.close, minMax.min, minMax.max, topY, height);

      const isUp = point.close >= point.open;
      
      // 캔들 색상 결정
      let upColor = color;
      let downColor = color;
      let borderColor = color;
      
      if (symbol && chartKey) {
        if (this.config.candleUpColor) {
          upColor = typeof this.config.candleUpColor === 'function' 
            ? this.config.candleUpColor(symbol, chartKey) 
            : this.config.candleUpColor;
        }
        if (this.config.candleDownColor) {
          downColor = typeof this.config.candleDownColor === 'function' 
            ? this.config.candleDownColor(symbol, chartKey) 
            : this.config.candleDownColor;
        }
        if (this.config.candleBorderColor) {
          borderColor = typeof this.config.candleBorderColor === 'function' 
            ? this.config.candleBorderColor(symbol, chartKey) 
            : this.config.candleBorderColor;
        }
      }

      // High-Low 라인
      this.ctx.globalAlpha = 0.3;
      this.ctx.strokeStyle = borderColor;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, yHigh);
      this.ctx.lineTo(x, yLow);
      this.ctx.stroke();

      // Open-Close 캔들 바디
      const candleWidth = 3;
      this.ctx.strokeStyle = borderColor;
      this.ctx.fillStyle = isUp ? upColor : downColor;
      
      const rectY = Math.min(yOpen, yClose);
      const rectHeight = Math.max(Math.abs(yOpen - yClose), 1);
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
    smoothMode: string,
    symbol?: string,
    chartKey?: string
  ) {
    if (points.length === 0) return;
    
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(this.chartAreaLeft, topY, this.chartAreaWidth, height);
    this.ctx.clip();
    
    // 라인 스타일 적용
    let lineColor = color;
    let lineWidth = 1;
    
    if (symbol && chartKey) {
      if (this.config.lineStrokeStyle) {
        lineColor = typeof this.config.lineStrokeStyle === 'function'
          ? this.config.lineStrokeStyle(symbol, chartKey)
          : this.config.lineStrokeStyle;
      }
      if (this.config.lineWidth) {
        lineWidth = typeof this.config.lineWidth === 'function'
          ? this.config.lineWidth(symbol, chartKey)
          : this.config.lineWidth;
      }
    }
    
    this.ctx.strokeStyle = lineColor;
    this.ctx.lineWidth = lineWidth;
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
      this.ctx.rect(this.chartAreaLeft, topY, this.chartAreaWidth, height);
      this.ctx.clip();
      
      this.ctx.strokeStyle = this.config.averageStrokeStyle || '#000000';
      this.ctx.lineWidth = this.config.averageLineWidth || 2;
      this.ctx.setLineDash(this.config.averageLineDash || [3, 2]);
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
    this.ctx.moveTo(this.chartAreaLeft, volumeTopY + volumeHeight);
    this.ctx.lineTo(this.getChartRight(), volumeTopY + volumeHeight);
    this.ctx.stroke();

    // 각 티커별 볼륨 min/max 계산
    const volumeMinMaxBySymbol = new Map<string, { min: number; max: number }>();
    
    if (this.state.normalize) {
      // 정규화: 각 티커별로 min/max 계산
      this.dataMap.forEach((value, symbol) => {
        const volumeData = value.data['volume'] || [];
        const volumes = volumeData.map(d => d.y).filter(v => v !== null && v !== undefined);
        if (volumes.length > 0) {
          volumeMinMaxBySymbol.set(symbol, {
            min: Math.min(...volumes),
            max: Math.max(...volumes)
          });
        }
      });
    } else {
      // 정규화 안함: 모든 티커의 전체 min/max 사용
      let globalMin = Infinity;
      let globalMax = -Infinity;
      
      this.dataMap.forEach((value) => {
        const volumeData = value.data['volume'] || [];
        const volumes = volumeData.map(d => d.y).filter(v => v !== null && v !== undefined);
        if (volumes.length > 0) {
          globalMin = Math.min(globalMin, ...volumes);
          globalMax = Math.max(globalMax, ...volumes);
        }
      });
      
      // 모든 티커에 동일한 min/max 적용
      this.dataMap.forEach((_, symbol) => {
        volumeMinMaxBySymbol.set(symbol, {
          min: globalMin,
          max: globalMax
        });
      });
    }

    // Volume 렌더링
    this.dataMap.forEach((value, symbol) => {
      const minMax = volumeMinMaxBySymbol.get(symbol);
      if (!minMax || !visibleTickers.has(symbol)) {
        return;
      }

      const data = value.data['volume'] || [];
      const color = this.getTickerColor(symbol);

      // 캔들 그리기
      if (showCandles) {
        const candlePoints: { time: number; open: number; high: number; low: number; close: number }[] = [];
        data.forEach(d => {
          if (d.y !== null && d.y !== undefined) {
            // yOpen, yHigh, yLow가 모두 유효한 경우에만 캔들 포인트 추가
            const hasOHLC = d.yOpen !== null && d.yOpen !== undefined &&
                            d.yHigh !== null && d.yHigh !== undefined &&
                            d.yLow !== null && d.yLow !== undefined;
            
            if (hasOHLC) {
              candlePoints.push({
                time: d.x,
                open: d.yOpen!,
                high: d.yHigh!,
                low: d.yLow!,
                close: d.y
              });
            }
          }
        });
        if (candlePoints.length > 0) {
          this.drawCandles(candlePoints, minMax, color, minTime, maxTime, volumeTopY, volumeHeight);
        }
      }

      if (!hideLines) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(this.chartAreaLeft, volumeTopY, this.chartAreaWidth, volumeHeight);
        this.ctx.clip();

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        const avgTimeDiff = timeRange / sortedTimes.length;
        let prevValidIndex = -1;

        for (let i = 0; i < data.length; i++) {
          const time = data[i].x;
          const volume = data[i].y || 0;
          const x = this.getX(time, minTime, maxTime);
          const y = this.getY(volume, minMax.min, minMax.max, volumeTopY, volumeHeight);
          const hasData = volume > 0;

          if (prevValidIndex === -1) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            prevValidIndex = i;
          } else {
            const prevTime = data[prevValidIndex].x;
            const timeDiff = time - prevTime;
            const prevVolume = data[prevValidIndex].y || 0;
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
    });

    // Y축 레이블
    if (!hideValues) {
      // 전체 min/max 계산 (비정규화 모드용)
      let globalMin = Infinity;
      let globalMax = -Infinity;
      volumeMinMaxBySymbol.forEach((minMax) => {
        globalMin = Math.min(globalMin, minMax.min);
        globalMax = Math.max(globalMax, minMax.max);
      });
      this.drawYAxisLabels(volumeTopY, volumeHeight, volumeTopY + volumeHeight, globalMin, globalMax, 'volume');
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

      this.dataMap.forEach((value, symbol) => {
        const minMax = minMaxBySymbol.get(symbol);
        if (!minMax) return;

        const data = value.data['volume'] || [];
        let volumeValue: number | null = null;
        const exactData = data.find(d => d.x === time);
        
        if (exactData && exactData.y) {
          volumeValue = exactData.y;
        } else {
          let prevData = null;
          let nextData = null;

          for (let i = 0; i < data.length; i++) {
            const t = data[i].x;
            if (t < time) {
              prevData = data[i];
            } else if (t > time) {
              nextData = data[i];
              break;
            }
          }

          if (prevData && nextData && prevData.y && nextData.y) {
            const prevTime = prevData.x;
            const nextTime = nextData.x;
            const ratio = (time - prevTime) / (nextTime - prevTime);
            volumeValue = prevData.y + (nextData.y - prevData.y) * ratio;
          } else if (prevData && prevData.y) {
            volumeValue = prevData.y;
          } else if (nextData && nextData.y) {
            volumeValue = nextData.y;
          }
        }

        if (volumeValue !== null && volumeValue !== undefined) {
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
      this.ctx.rect(this.chartAreaLeft, topY, this.chartAreaWidth, height);
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
    this.ctx.moveTo(this.chartAreaLeft, obvTopY + obvHeight);
    this.ctx.lineTo(this.getChartRight(), obvTopY + obvHeight);
    this.ctx.stroke();

    // 각 티커별 OBV min/max 계산
    const obvMinMaxBySymbol = new Map<string, { min: number; max: number; values: number[] }>();
    
    if (this.state.normalize) {
      // 정규화: 각 티커별로 min/max 계산
      this.dataMap.forEach((value, symbol) => {
        const obvData = value.data['obv'] || [];
        const obvValues = obvData.map(d => d.y).filter(v => v !== null && v !== undefined);
        
        if (obvValues.length > 0) {
          obvMinMaxBySymbol.set(symbol, {
            min: Math.min(...obvValues),
            max: Math.max(...obvValues),
            values: obvValues
          });
        }
      });
    } else {
      // 정규화 안함: 모든 티커의 전체 min/max 사용
      let globalMin = Infinity;
      let globalMax = -Infinity;
      
      this.dataMap.forEach((value) => {
        const obvData = value.data['obv'] || [];
        const obvValues = obvData.map(d => d.y).filter(v => v !== null && v !== undefined);
        if (obvValues.length > 0) {
          globalMin = Math.min(globalMin, ...obvValues);
          globalMax = Math.max(globalMax, ...obvValues);
        }
      });
      
      // 모든 티커에 동일한 min/max 적용
      this.dataMap.forEach((value, symbol) => {
        const obvData = value.data['obv'] || [];
        const obvValues = obvData.map(d => d.y).filter(v => v !== null && v !== undefined);
        obvMinMaxBySymbol.set(symbol, {
          min: globalMin,
          max: globalMax,
          values: obvValues
        });
      });
    }

    // OBV 렌더링
    this.dataMap.forEach((value, symbol) => {
      const obvDataInfo = obvMinMaxBySymbol.get(symbol);
      if (!obvDataInfo || !visibleTickers.has(symbol)) {
        return;
      }

      const data = value.data['obv'] || [];
      const obvValues = obvDataInfo.values;
      const minMax = { min: obvDataInfo.min, max: obvDataInfo.max };
      const color = this.getTickerColor(symbol);

      // 캔들 그리기
      if (showCandles) {
        const candlePoints: { time: number; open: number; high: number; low: number; close: number }[] = [];
        data.forEach((d, i) => {
          if (i < obvValues.length) {
            // yOpen, yHigh, yLow가 모두 유효한 경우에만 캔들 포인트 추가
            const hasOHLC = d.yOpen !== null && d.yOpen !== undefined &&
                            d.yHigh !== null && d.yHigh !== undefined &&
                            d.yLow !== null && d.yLow !== undefined;
            
            if (hasOHLC) {
              candlePoints.push({
                time: d.x,
                open: d.yOpen!,
                high: d.yHigh!,
                low: d.yLow!,
                close: obvValues[i]
              });
            }
          }
        });
        if (candlePoints.length > 0) {
          this.drawCandles(candlePoints, minMax, color, minTime, maxTime, obvTopY, obvHeight);
        }
      }

      if (!hideLines) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(this.chartAreaLeft, obvTopY, this.chartAreaWidth, obvHeight);
        this.ctx.clip();

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        const avgTimeDiff = timeRange / sortedTimes.length;
        let prevValidIndex = -1;

        for (let i = 0; i < data.length; i++) {
          const time = data[i].x;
          const x = this.getX(time, minTime, maxTime);
          const y = this.getY(obvValues[i], minMax.min, minMax.max, obvTopY, obvHeight);
          const hasData = obvValues[i] !== 0;

          if (prevValidIndex === -1) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            prevValidIndex = i;
          } else {
            const prevTime = data[prevValidIndex].x;
            const timeDiff = time - prevTime;
            const prevVolume = data[prevValidIndex].y || 0;
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
    });

    // Y축 레이블
    if (!hideValues) {
      // 전체 min/max 계산 (비정규화 모드용)
      let globalMin = Infinity;
      let globalMax = -Infinity;
      obvMinMaxBySymbol.forEach((obvData) => {
        globalMin = Math.min(globalMin, obvData.min);
        globalMax = Math.max(globalMax, obvData.max);
      });
      this.drawYAxisLabels(obvTopY, obvHeight, obvTopY + obvHeight, globalMin, globalMax, 'obv');
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

    this.dataMap.forEach((value, symbol) => {
      const obvDataInfo = obvMinMaxBySymbol.get(symbol);
      if (!obvDataInfo) return;

      const data = value.data['obv'] || [];
      const points: { time: number; obv: number }[] = [];
      data.forEach((d, i) => {
        const time = d.x;
        points.push({ time, obv: obvDataInfo.values[i] });
      });
      obvBySymbol.set(symbol, points);
      minMaxBySymbol.set(symbol, { min: obvDataInfo.min, max: obvDataInfo.max });
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
      this.ctx.rect(this.chartAreaLeft, topY, this.chartAreaWidth, height);
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
      const color = this.getTickerColor(symbol);
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
      this.ctx.moveTo(this.chartAreaLeft, volumeTopY);
      this.ctx.lineTo(this.getChartRight(), volumeTopY);
      this.ctx.stroke();
    }
    
    if (showOBV) {
      this.ctx.beginPath();
      this.ctx.moveTo(this.chartAreaLeft, obvTopY);
      this.ctx.lineTo(this.getChartRight(), obvTopY);
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
    if (!showEvents || sortedTimes.length === 0) return;

    const minTime = displayMinTime ?? sortedTimes[0];
    const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];

    // 모든 이벤트 수집 (티커별 + 공통)
    const allEvents: EventMarker[] = [];
    
    // 공통 이벤트 추가
    if (this.commonEvents && this.commonEvents.length > 0) {
      allEvents.push(...this.commonEvents);
    }
    
    // 활성화된 티커의 이벤트 추가
    this.dataMap.forEach((value, symbol) => {
      if (this.state.enabledTickers.has(symbol) && value.events && value.events.length > 0) {
        allEvents.push(...value.events);
      }
    });

    if (allEvents.length === 0) return;

    // 이벤트 그리기
    allEvents.forEach(event => {
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
    this.ctx.moveTo(this.chartAreaLeft, baselineY);
    this.ctx.lineTo(this.getChartRight(), baselineY);
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
      
      const formatted = this.config.xFormat ? this.config.xFormat(time) : time.toString();
      const labelText = this.applyFormatResult(formatted);
      this.ctx.fillText(labelText, x, labelY);
      this.ctx.beginPath();
      this.ctx.moveTo(x, tickYStart);
      this.ctx.lineTo(x, tickYEnd);
      this.ctx.stroke();
    }
  }

  drawZoomButtons(
    zoomStart: number, 
    zoomEnd: number, 
    displayMinTime?: number, 
    displayMaxTime?: number
  ): { type: string; x: number; y: number; width: number; height: number }[] {
    const buttonSize = 18;
    const buttonGap = 6;
    const totalButtonWidth = buttonSize * 3 + buttonGap * 2;
    const startX = (this.width - totalButtonWidth) / 2;
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
      
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.strokeStyle = '#999';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, buttonSize, buttonSize, 4);
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.fillStyle = '#333';
      this.ctx.font = 'bold 10px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(btn.label, x + buttonSize / 2, y + buttonSize / 2);
      
      zoomButtons.push({ type: btn.type, x, y, width: buttonSize, height: buttonSize });
    });
    
    // 현재 보고 있는 시간 범위를 항상 버튼 위에 표시
    if (displayMinTime !== undefined && displayMaxTime !== undefined) {
      // 날짜 포맷 함수
      const formatDateTime = (timestamp: number): string => {
        if (this.config.xFormat) {
          const formatted = this.config.xFormat(timestamp);
          return this.applyFormatResult(formatted);
        } else {
          return timestamp.toString();
        }
      };
      
      const fromDate = formatDateTime(displayMinTime);
      const toDate = formatDateTime(displayMaxTime);
      const dateRangeText = `${fromDate} ~ ${toDate}`;
      
      // 날짜 범위를 버튼 위에 중앙 정렬로 표시
      this.ctx.font = '10px Arial';
      this.ctx.fillStyle = '#333';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(dateRangeText, this.width / 2, startY - 5);
    }
    
    // 줌 모드일 때 퍼센트를 버튼 아래에 중앙 정렬로 표시
    if (zoomStart > 0 || zoomEnd < 100) {
      this.ctx.font = '10px Arial';
      this.ctx.fillStyle = '#666';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${zoomStart.toFixed(0)}%-${zoomEnd.toFixed(0)}%`, this.width / 2, startY + buttonSize + 5);
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
    chartLayouts: { key: string; topY: number; height: number }[],
    sortedTimes: number[],
    displayMinTime?: number,
    displayMaxTime?: number
  ) {
    if (mouseX < this.padding || mouseX > this.width - this.padding) return;
    
    // 마우스가 어느 차트 영역에 있는지 확인
    let isInChartArea = false;
    for (const layout of chartLayouts) {
      if (mouseY >= layout.topY && mouseY <= layout.topY + layout.height) {
        isInChartArea = true;
        break;
      }
    }
    
    if (!isInChartArea) return;
    
    const chartBottom = chartLayouts.length > 0 
      ? chartLayouts[chartLayouts.length - 1].topY + chartLayouts[chartLayouts.length - 1].height
      : this.height - this.padding;
    
    this.ctx.strokeStyle = this.config.crosshairStrokeStyle || '#666666';
    this.ctx.lineWidth = this.config.crosshairLineWidth || 1;
    this.ctx.setLineDash(this.config.crosshairLineDash || [4, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(mouseX, this.padding);
    this.ctx.lineTo(mouseX, chartBottom);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(this.chartAreaLeft, mouseY);
    this.ctx.lineTo(this.getChartRight(), mouseY);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    const timePercent = (mouseX - this.padding) / (this.width - this.padding * 2);
    
    if (sortedTimes.length > 0) {
      const minTime = displayMinTime ?? sortedTimes[0];
      const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];
      const timeRange = maxTime - minTime || 1;
      const currentTime = minTime + timePercent * timeRange;
      const date = new Date(currentTime * 1000);
      this.ctx.fillStyle = '#333333';
      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'center';
      
      const formatted = this.config.crosshairXFormat 
        ? this.config.crosshairXFormat(currentTime)
        : (this.config.xFormat 
          ? this.config.xFormat(currentTime)
          : currentTime.toString());
      const dateStr = this.applyFormatResult(formatted);
      
      this.ctx.fillText(dateStr, mouseX, this.height - this.padding + 35);
    }

    let valueStr = '';
    
    // 마우스가 있는 차트 영역 찾기
    for (const layout of chartLayouts) {
      if (mouseY >= layout.topY && mouseY <= layout.topY + layout.height) {
        const scaledValue = 1 - (mouseY - layout.topY) / layout.height;
        const normalizedValue = (scaledValue - this.chartMargin) / (1 - this.chartMargin * 2);
        
        if (this.state.normalize) {
          // 정규화 모드: 퍼센트 표시
          const valuePercent = normalizedValue * 100;
          const formatted = this.config.crosshairYFormat
            ? this.config.crosshairYFormat(valuePercent, layout.key, true)
            : `${valuePercent.toFixed(1)}%`;
          valueStr = this.applyFormatResult(formatted);
        } else {
          // 비정규화 모드: 실제 값 계산 및 포맷 적용
          // 해당 차트의 전체 min/max 범위 계산
          let globalMin = Infinity;
          let globalMax = -Infinity;
          
          this.dataMap.forEach((value) => {
            const chartData = value.data[layout.key] || [];
            const values = chartData.map(d => d.y).filter(v => v !== null && v !== undefined);
            if (values.length > 0) {
              globalMin = Math.min(globalMin, ...values);
              globalMax = Math.max(globalMax, ...values);
            }
          });
          
          if (globalMin !== Infinity && globalMax !== -Infinity) {
            const actualValue = globalMin + normalizedValue * (globalMax - globalMin);
            const formatted = this.config.crosshairYFormat
              ? this.config.crosshairYFormat(actualValue, layout.key, false)
              : (this.config.yFormat 
                ? this.config.yFormat(actualValue, layout.key) 
                : actualValue.toLocaleString(undefined, { maximumFractionDigits: 2 }));
            valueStr = this.applyFormatResult(formatted);
          }
        }
        break;
      }
    }
    
    if (valueStr) {
      this.ctx.fillStyle = '#333333';
      this.ctx.font = 'bold 12px Arial';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(valueStr, this.paddingLeft + this.chartAreaWidth + 5, mouseY);
    }
  }

  drawDataPoints(
    visibleTickers: Set<string>,
    chartLayouts: { key: string; topY: number; height: number }[],
    sortedTimes: number[],
    displayMinTime?: number,
    displayMaxTime?: number
  ): { symbol: string; x: number; y: number; value: number; time: number; chartType: string }[] {
    const dataPoints: { symbol: string; x: number; y: number; value: number; time: number; chartType: string }[] = [];
    
    if (sortedTimes.length === 0) return dataPoints;

    const minTime = displayMinTime ?? sortedTimes[0];
    const maxTime = displayMaxTime ?? sortedTimes[sortedTimes.length - 1];

    const pointRadius = 2;
    const clipLeft = this.padding;
    const clipRight = this.width - this.padding;

    // 각 차트 레이아웃에 대해 포인트 그리기
    chartLayouts.forEach(layout => {
      const chartKey = layout.key;
      const graphTop = layout.topY;
      const graphHeight = layout.height;

      // 각 티커별 min/max 계산
      const minMaxBySymbol = new Map<string, { min: number; max: number }>();

      if (this.state.normalize) {
        // 정규화: 각 티커별로 min/max 계산
        this.dataMap.forEach((value, symbol) => {
          const chartData = value.data[chartKey] || [];
          const values = chartData.map(d => d.y).filter(v => v !== null && v !== undefined);
          if (values.length > 0) {
            minMaxBySymbol.set(symbol, { min: Math.min(...values), max: Math.max(...values) });
          }
        });
      } else {
        // 정규화 안함: 모든 티커의 전체 min/max 사용
        let globalMin = Infinity, globalMax = -Infinity;
        
        this.dataMap.forEach((value) => {
          const chartData = value.data[chartKey] || [];
          const values = chartData.map(d => d.y).filter(v => v !== null && v !== undefined);
          if (values.length > 0) {
            globalMin = Math.min(globalMin, ...values);
            globalMax = Math.max(globalMax, ...values);
          }
        });
        
        // 모든 티커에 동일한 min/max 적용
        this.dataMap.forEach((value, symbol) => {
          minMaxBySymbol.set(symbol, { min: globalMin, max: globalMax });
        });
      }

      // 각 티커의 포인트 그리기
      this.dataMap.forEach((value, symbol) => {
        if (!visibleTickers.has(symbol)) return;

        const color = this.getTickerColor(symbol);
        const minMax = minMaxBySymbol.get(symbol);
        if (!minMax) return;

        const chartData = value.data[chartKey] || [];
        chartData.forEach(d => {
          if (d.y === null || d.y === undefined) return;
          const time = d.x;
          if (time < minTime || time > maxTime) return;

          const x = this.getX(time, minTime, maxTime);
          if (x < clipLeft || x > clipRight) return;
          
          const normalizedValue = (d.y - minMax.min) / (minMax.max - minMax.min || 1);
          const scaledValue = this.chartMargin + normalizedValue * (1 - this.chartMargin * 2);
          const y = graphTop + (1 - scaledValue) * graphHeight;

          this.ctx.fillStyle = color;
          this.ctx.beginPath();
          this.ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
          this.ctx.fill();

          dataPoints.push({ symbol, x, y, value: d.y, time, chartType: chartKey });
        });
      });
    });
    
    return dataPoints;
  }

  drawPointTooltip(
    point: { symbol: string; x: number; y: number; value: number; time: number; chartType: string },
    canvasWidth: number
  ) {
    const xFormatted = this.config.tooltipXFormat
      ? this.config.tooltipXFormat(point.time, point.symbol, point.chartType)
      : (this.config.xFormat 
        ? this.config.xFormat(point.time, point.chartType)
        : point.time.toString());
    const dateStr = this.applyFormatResult(xFormatted);
    
    let text: string;
    if (this.config.tooltipLabelFormat) {
      const formatted = this.config.tooltipLabelFormat(point.symbol, point.chartType, point.value, point.time);
      text = this.applyFormatResult(formatted);
    } else {
      let valueStr: string;
      if (this.config.tooltipYFormat) {
        const formatted = this.config.tooltipYFormat(point.value, point.chartType, point.symbol);
        valueStr = this.applyFormatResult(formatted);
      } else if (this.config.yFormat) {
        const formatted = this.config.yFormat(point.value, point.chartType);
        valueStr = this.applyFormatResult(formatted);
      } else if (point.chartType === 'Volume' || point.chartType === 'OBV') {
        valueStr = point.value.toLocaleString();
      } else {
        valueStr = point.value.toFixed(2);
      }
      
      const labelFormatted = this.config.labelFormat
        ? this.config.labelFormat(point.chartType)
        : point.chartType;
      const chartLabel = this.applyFormatResult(labelFormatted);
      
      text = `${point.symbol} (${chartLabel}): ${valueStr}`;
    }
    
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
          const wasVisible = this.state.visibleTickers.has(item.symbol);
          if (wasVisible) {
            this.state.visibleTickers.delete(item.symbol);
          } else {
            this.state.visibleTickers.add(item.symbol);
          }
          
          // 콜백 호출
          if (this.config.onLegendClick) {
            this.config.onLegendClick(item.symbol, !wasVisible);
          }
          
          this.render();
          break;
        }
      }
    });

    // 더블클릭 (PC)
    this.canvas.addEventListener('dblclick', (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // 확대 상태에서 차트 영역을 더블클릭하면 초기화
      if (this.isInChartArea(x, y) && (this.zoomStart > 0 || this.zoomEnd < 100)) {
        this.zoomReset();
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
          const currentTime = Date.now();
          const tapThreshold = 300; // 300ms 이내
          const distanceThreshold = 30; // 30px 이내
          
          // 더블탭 감지
          const timeDiff = currentTime - this.lastTapTime;
          const dx = tapX - this.lastTapX;
          const dy = tapY - this.lastTapY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (timeDiff < tapThreshold && distance < distanceThreshold) {
            // 더블탭 감지됨 - 확대 상태에서 차트 영역이면 초기화
            if (this.isInChartArea(tapX, tapY) && (this.zoomStart > 0 || this.zoomEnd < 100)) {
              this.zoomReset();
              this.lastTapTime = 0; // 초기화
              this.isTouchDragging = false;
              this.isDragging = false;
              this.dragStartX = null;
              this.dragCurrentX = null;
              this.touchStartX = null;
              this.touchStartY = null;
              return;
            }
          }
          
          // 마지막 탭 정보 저장
          this.lastTapTime = currentTime;
          this.lastTapX = tapX;
          this.lastTapY = tapY;
          
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
              const wasVisible = this.state.visibleTickers.has(item.symbol);
              if (wasVisible) {
                this.state.visibleTickers.delete(item.symbol);
              } else {
                this.state.visibleTickers.add(item.symbol);
              }
              
              // 콜백 호출
              if (this.config.onLegendClick) {
                this.config.onLegendClick(item.symbol, !wasVisible);
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

  private groupDataByDay(dataMap: Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }>): Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }> {
    const groupedMap = new Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }>();
    
    dataMap.forEach((value, symbol) => {
      const groupedData: { [key: string]: ChartData[] } = {};
      
      // 각 데이터 타입별로 일자별 그룹화
      Object.keys(value.data).forEach(dataType => {
        const dailyMap = new Map<number, ChartData>();
        
        value.data[dataType].forEach(d => {
          const date = new Date(d.x * 1000);
          const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
          const dayKey = dayStart.getTime() / 1000;
          
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
            existing.y = d.y;
            // volume의 경우 합산
            if (dataType === 'volume') {
              existing.y += d.y;
            }
          }
        });
        
        groupedData[dataType] = Array.from(dailyMap.values()).sort((a, b) => a.x - b.x);
      });
      
      groupedMap.set(symbol, { color: value.color, data: groupedData, events: value.events });
    });
    
    return groupedMap;
  }

  render() {
    const dpr = window.devicePixelRatio || 1;
    const { width: cssW, height: cssH } = this.canvas.getBoundingClientRect();
    const width = Math.max(300, cssW);
    let totalHeight = Math.max(200, cssH);
    
    // 차트 영역 너비 계산 (기본 padding 기준으로 고정)
    const defaultPadding = 50;
    this.chartAreaWidth = width - defaultPadding * 2;
    this.chartAreaLeft = defaultPadding;
    
    // 실제 그리기에 사용할 padding은 기본값 사용 (차트 영역 고정)
    this.padding = defaultPadding;
    
    // 차트 레이아웃 계산
    const chartCount = this.state.visibleChartKeys.length;
    const xAxisLabelHeight = 40;
    const availableHeight = totalHeight - this.padding - xAxisLabelHeight;
    const heightPerChart = availableHeight / chartCount;
    
    // 각 차트의 위치와 높이 계산
    const chartLayouts: { key: string; topY: number; height: number }[] = [];
    this.state.visibleChartKeys.forEach((key, index) => {
      chartLayouts.push({
        key,
        topY: this.padding + index * heightPerChart,
        height: heightPerChart
      });
    });
    
    this.canvas.width = width * dpr;
    this.canvas.height = totalHeight * dpr;
    this.width = width;
    this.height = totalHeight;
    this.canvasWidth = width;
    this.canvasHeight = totalHeight;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    // 활성화된 티커만 필터링
    let filteredDataMap = new Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }>();
    this.dataMap.forEach((value, symbol) => {
      if (this.state.enabledTickers.has(symbol)) {
        filteredDataMap.set(symbol, value);
      }
    });
    
    // 일자별 그룹 적용
    if (this.state.dailyGroup) {
      filteredDataMap = this.groupDataByDay(filteredDataMap);
    }
    
    // 전체 시간 범위 계산
    let globalMinTime = Infinity;
    let globalMaxTime = -Infinity;
    filteredDataMap.forEach((value) => {
      Object.values(value.data).forEach(dataArray => {
        dataArray.forEach(d => {
          const time = d.x;
          if (time < globalMinTime) globalMinTime = time;
          if (time > globalMaxTime) globalMaxTime = time;
        });
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
      const timeFilteredMap = new Map<string, { color?: string; data: { [key: string]: ChartData[] }; events?: EventMarker[] }>();
      filteredDataMap.forEach((value, symbol) => {
        const filteredData: { [key: string]: ChartData[] } = {};
        
        Object.keys(value.data).forEach(dataType => {
          const data = value.data[dataType];
          if (data.length === 0) {
            filteredData[dataType] = [];
            return;
          }
          
          let startIdx = -1;
          let endIdx = -1;
          for (let i = 0; i < data.length; i++) {
            const time = data[i].x;
            if (time >= targetMinTime && startIdx === -1) {
              startIdx = i;
            }
            if (time <= targetMaxTime) {
              endIdx = i;
            }
          }
          
          if (startIdx === -1 || endIdx === -1) {
            filteredData[dataType] = [];
            return;
          }
          
          const actualStartIdx = Math.max(0, startIdx - 1);
          const actualEndIdx = Math.min(data.length - 1, endIdx + 1);
          filteredData[dataType] = data.slice(actualStartIdx, actualEndIdx + 1);
        });
        
        timeFilteredMap.set(symbol, { color: value.color, data: filteredData, events: value.events });
      });
      filteredDataMap = timeFilteredMap;
    }
    
    // 시간 포인트 수집
    const allTimePoints = new Set<number>();
    filteredDataMap.forEach((value) => {
      Object.values(value.data).forEach(dataArray => {
        dataArray.forEach(d => {
          const time = d.x;
          allTimePoints.add(time);
        });
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
    
    // 각 차트 그리기
    let firstChartResult: any = null;
    chartLayouts.forEach((layout, index) => {
      const result = this.drawChartKey(
        layout.key,
        this.state.visibleTickers,
        layout.topY,
        layout.height,
        this.sortedTimes,
        chartOptions
      );
      
      // 첫 번째 차트의 결과를 legend에 사용
      if (index === 0 && result) {
        firstChartResult = result;
      }
    });
    
    // Draw legend (첫 번째 차트 기준)
    if (firstChartResult) {
      this.legendItems = this.drawLegend(firstChartResult.dataBySymbol, this.state.visibleTickers, []);
    }

    // 차트 간 구분선 그리기
    chartLayouts.forEach((layout, index) => {
      if (index > 0) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(this.chartAreaLeft, layout.topY);
        this.ctx.lineTo(this.getChartRight(), layout.topY);
        this.ctx.stroke();
      }
    });

    // 차트 영역의 실제 하단 계산
    const chartBottom = chartLayouts.length > 0 
      ? chartLayouts[chartLayouts.length - 1].topY + chartLayouts[chartLayouts.length - 1].height
      : totalHeight - xAxisLabelHeight;
    
    // 이벤트 마커
    this.drawEventMarkers(this.sortedTimes, chartBottom, this.state.showEvents, displayMinTime, displayMaxTime);

    // X축 레이블
    this.drawXAxisLabels(this.sortedTimes, chartBottom, displayMinTime, displayMaxTime);

    // 포인트 그리기
    if (this.state.showPoints) {
      this.dataPoints = this.drawDataPoints(this.state.visibleTickers, chartLayouts, this.sortedTimes, displayMinTime, displayMaxTime);
    } else {
      this.dataPoints = [];
    }

    // 호버된 포인트 툴팁 표시
    if (this.state.showPoints && this.hoveredPoint) {
      this.drawPointTooltip(this.hoveredPoint, width);
    }

    // 줌 버튼 그리기
    this.zoomButtons = this.drawZoomButtons(this.zoomStart, this.zoomEnd, displayMinTime, displayMaxTime);

    // 드래그 선택 영역 그리기
    this.drawDragSelection(this.isDragging, this.dragStartX, this.dragCurrentX, chartBottom);

    // 크로스헤어 그리기
    if (this.mouseX !== null && this.mouseY !== null && !this.isDragging && !this.isPanning) {
      this.drawCrosshair(this.mouseX, this.mouseY, chartLayouts, this.sortedTimes, displayMinTime, displayMaxTime);
    }
    
    // 데이터 복원
    this.dataMap = oldDataMap;
  }
}

export type { ChartData, EventMarker, ChartOptions, RenderState };
