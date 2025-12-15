import { createCanvas, CanvasRenderingContext2D } from 'canvas';
import { mkdirSync, writeFileSync } from 'fs';

interface ChartData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  obv: number;
}

interface TradePoint {
  timestamp: string;
  type: 'buy' | 'sell';
  price: number;
}

class Chart {
  private width: number;
  private height: number;
  private padding: number;
  private canvas: any;
  private ctx: CanvasRenderingContext2D;
  private symbol: string;
  private dpiScale: number;

  constructor(symbol: string, width: number = 1200, height: number = 600, padding: number = 50, dpiScale: number = 2) {
    this.symbol = symbol;
    this.width = width;
    this.height = height;
    this.padding = padding;
    this.dpiScale = Math.max(1, dpiScale);
    this.canvas = createCanvas(this.width * this.dpiScale, this.height * this.dpiScale);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(this.dpiScale, this.dpiScale);

    // 배경색
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // saveChart 메서드를 명시적으로 바인딩
    this.saveChart = this.saveChart.bind(this);
  }

  private getX(index: number, dataLength: number): number {
    const scaleX = (this.width - this.padding * 2) / dataLength;
    return this.padding + index * scaleX;
  }

  private getY(price: number, minY: number, maxY: number): number {
    const priceRange = maxY - minY;
    const scaleY = (this.height - this.padding * 2) / priceRange;
    return this.height - this.padding - (price - minY) * scaleY;
  }

  private getYForPricePanel(price: number, minY: number, maxY: number, panelHeight: number, panelTop: number): number {
    const priceRange = maxY - minY;
    const scaleY = panelHeight / priceRange;
    return panelTop + panelHeight - (price - minY) * scaleY;
  }

  private drawSmoothCurve(points: Array<{ x: number; y: number }>, ctx: CanvasRenderingContext2D) {
    if (points.length < 2) return;
    
    // 첫 점에서 시작
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    
    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      // 각 점 사이에 베지어 곡선 그리기
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i + 2 < points.length ? points[i + 2] : points[i + 1];
        
        // 카디널 스플라인을 사용한 제어점 계산
        const tension = 0.25; // 곡선의 부드러움 정도 (0-1, 작을수록 부드러움)
        const cp1x = p1.x + (p2.x - p0.x) * tension;
        const cp1y = p1.y + (p2.y - p0.y) * tension;
        const cp2x = p2.x - (p3.x - p1.x) * tension;
        const cp2y = p2.y - (p3.y - p1.y) * tension;
        
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
    }
    
    ctx.stroke();
  }

  private drawAxes(minY: number, maxY: number) {
    // Y축 그리기
    this.ctx.strokeStyle = '#CCCCCC';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, this.padding);
    this.ctx.lineTo(this.padding, this.height - this.padding);
    this.ctx.stroke();

    // X축 그리기
    this.ctx.beginPath();
    this.ctx.moveTo(this.padding, this.height - this.padding);
    this.ctx.lineTo(this.width - this.padding, this.height - this.padding);
    this.ctx.stroke();

    // Y축 라벨
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Arial';
    const numYLabels = 5;
    const priceRange = maxY - minY;
    for (let j = 0; j <= numYLabels; j++) {
      const price = minY + (priceRange / numYLabels) * j;
      this.ctx.fillText(price.toFixed(2), this.padding - 40, this.getY(price, minY, maxY) + 5);
      this.ctx.beginPath();
      this.ctx.moveTo(this.padding - 5, this.getY(price, minY, maxY));
      this.ctx.lineTo(this.padding, this.getY(price, minY, maxY));
      this.ctx.stroke();
    }
  }

  private drawXAxisLabelsAndGrid(data: ChartData[], gridTop?: number, gridBottom?: number, fontSize: number = 10) {
    let lastDate = '';
    let lastLabelX = -Infinity;
    const minLabelGap = 80; // px 간격 기준으로 라벨 간소화
    const yAxis = this.height - this.padding;
    const gridTopY = gridTop ?? this.padding;
    const gridBottomY = gridBottom ?? (this.height - this.padding);
    
    for (let i = 0; i < data.length; i++) {
      const currentData = data[i];
      const date = new Date(currentData.timestamp);
      const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;

      // 일자 변경 시 라벨 및 점선 추가
      if (currentDate !== lastDate) {
        const x = this.getX(i, data.length);

        // 점선 그리기 (지정된 범위 내에서만)
        this.ctx.strokeStyle = '#CCCCCC';
        this.ctx.setLineDash([2, 2]); // 점선 설정
        this.ctx.beginPath();
        this.ctx.moveTo(x, gridTopY);
        this.ctx.lineTo(x, gridBottomY);
        this.ctx.stroke();
        this.ctx.setLineDash([]); // 점선 해제

        // 라벨은 일정 픽셀 간격 이상일 때만 표기 (기울여서 표시)
        if (x - lastLabelX >= minLabelGap) {
          this.ctx.save();
          this.ctx.fillStyle = '#000000';
          this.ctx.font = `${fontSize}px Arial`;
          this.ctx.translate(x + 2, yAxis + 14);
          this.ctx.rotate((Math.PI / 180) * 45);
          this.ctx.fillText(currentDate, 0, 0);
          this.ctx.restore();
          lastLabelX = x;
        }

        lastDate = currentDate;
      }
    }
    // 마지막 날짜 라벨이 간격 때문에 누락되면 추가 시도
    if (data.length > 0) {
      const lastData = data[data.length - 1];
      const date = new Date(lastData.timestamp);
      const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;
      const x = this.getX(data.length - 1, data.length);
      if (x - lastLabelX >= minLabelGap * 0.6) { // 약간의 관대한 임계
        this.ctx.save();
        this.ctx.fillStyle = '#000000';
        this.ctx.font = `${fontSize}px Arial`;
        this.ctx.translate(x + 2, yAxis + 14);
        this.ctx.rotate((Math.PI / 180) * 45);
        this.ctx.fillText(currentDate, 0, 0);
        this.ctx.restore();
      }
    }
  }

  drawCandlestickChart(data: ChartData[], filenameSuffix: string = '_candlestick_chart.png') {
    const allPrices = data.flatMap(d => [d.open, d.high, d.low, d.close]);
    const minY = Math.min(...allPrices);
    const maxY = Math.max(...allPrices);

    this.drawAxes(minY, maxY);
    this.drawXAxisLabelsAndGrid(data);

    const scaleX = (this.width - this.padding * 2) / data.length;
    const candleWidth = scaleX * 0.7; // 캔들 너비

    for (let i = 0; i < data.length; i++) {
      const currentData = data[i];
      const x = this.getX(i, data.length);

      // 캔들 색상 결정
      if (currentData.close >= currentData.open) {
        this.ctx.fillStyle = '#00FF00'; // 양봉 (상승) - 초록색
        this.ctx.strokeStyle = '#00FF00';
      } else {
        this.ctx.fillStyle = '#FF0000'; // 음봉 (하락) - 빨간색
        this.ctx.strokeStyle = '#FF0000';
      }

      // 캔들 몸통 그리기
      this.ctx.fillRect(x - candleWidth / 2, this.getY(Math.max(currentData.open, currentData.close), minY, maxY), candleWidth, Math.abs(this.getY(currentData.open, minY, maxY) - this.getY(currentData.close, minY, maxY)));

      // 캔들 심지 (꼬리) 그리기
      this.ctx.beginPath();
      this.ctx.moveTo(x, this.getY(currentData.high, minY, maxY));
      this.ctx.lineTo(x, this.getY(currentData.low, minY, maxY));
      this.ctx.stroke();
    }

    this.saveChart(filenameSuffix);
  }

  drawBollingerBandChart(data: ChartData[], middleBand: number[], stdDev: number[], stdDevMultiplier: number, tradePoints: TradePoint[] = [], filenameSuffix: string = '_bollinger_chart.png') {
    const allPrices = data.map(d => d.close)
      .concat(middleBand.filter(n => !isNaN(n)))
      .concat(stdDev.map((s, i) => middleBand[i] + (s * stdDevMultiplier)).filter(n => !isNaN(n)))
      .concat(stdDev.map((s, i) => middleBand[i] - (s * stdDevMultiplier)).filter(n => !isNaN(n)));

    const minY = Math.min(...allPrices);
    const maxY = Math.max(...allPrices);

    this.drawAxes(minY, maxY);
    this.drawXAxisLabelsAndGrid(data);

    // 가격 라인 그리기
    this.ctx.strokeStyle = '#0000FF'; // 파란색
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(this.getX(0, data.length), this.getY(data[0].close, minY, maxY));
    for (let i = 1; i < data.length; i++) {
      this.ctx.lineTo(this.getX(i, data.length), this.getY(data[i].close, minY, maxY));
    }
    this.ctx.stroke();

    // 볼린저 밴드 그리기
    this.ctx.lineWidth = 1;
    // 중간 밴드 (SMA)
    this.ctx.strokeStyle = '#FFA500'; // 주황색
    this.ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      if (!isNaN(middleBand[i])) {
        if (i === 0 || isNaN(middleBand[i - 1])) {
          this.ctx.moveTo(this.getX(i, data.length), this.getY(middleBand[i], minY, maxY));
        } else {
          this.ctx.lineTo(this.getX(i, data.length), this.getY(middleBand[i], minY, maxY));
        }
      }
    }
    this.ctx.stroke();

    // 상단 밴드
    this.ctx.strokeStyle = '#FF0000'; // 빨간색
    this.ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      if (!isNaN(middleBand[i]) && !isNaN(stdDev[i])) {
        const upper = middleBand[i] + (stdDev[i] * stdDevMultiplier);
        if (i === 0 || isNaN(middleBand[i - 1]) || isNaN(stdDev[i - 1])) {
          this.ctx.moveTo(this.getX(i, data.length), this.getY(upper, minY, maxY));
        } else {
          this.ctx.lineTo(this.getX(i, data.length), this.getY(upper, minY, maxY));
        }
      }
    }
    this.ctx.stroke();

    // 하단 밴드
    this.ctx.strokeStyle = '#008000'; // 초록색
    this.ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      if (!isNaN(middleBand[i]) && !isNaN(stdDev[i])) {
        const lower = middleBand[i] - (stdDev[i] * stdDevMultiplier);
        if (i === 0 || isNaN(middleBand[i - 1]) || isNaN(stdDev[i - 1])) {
          this.ctx.moveTo(this.getX(i, data.length), this.getY(lower, minY, maxY));
        } else {
          this.ctx.lineTo(this.getX(i, data.length), this.getY(lower, minY, maxY));
        }
      }
    }
    this.ctx.stroke();

    // 매수/매도 지점 그리기
    tradePoints.forEach(point => {
      const index = data.findIndex(d => d.timestamp === point.timestamp);
      if (index !== -1) {
        const x = this.getX(index, data.length);
        const y = this.getY(point.price, minY, maxY);
        if (point.type === 'buy') {
          this.ctx.fillStyle = '#0000FF'; // 파란색 점
        } else {
          this.ctx.fillStyle = '#FF0000'; // 빨간색 점
        }
        this.ctx.beginPath();
        this.ctx.arc(x, y, 5, 0, Math.PI * 2, false);
        this.ctx.fill();
      }
    });
    this.saveChart(filenameSuffix);
  }

  static calculateSMA(data: ChartData[], period: number): number[] {
    const sma: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        sma.push(NaN); // Not enough data yet
      } else {
        const sum = data.slice(i - period + 1, i + 1).reduce((acc, d) => acc + d.close, 0);
        sma.push(sum / period);
      }
    }
    return sma;
  }

  private saveChart(filenameSuffix: string) {
    const buffer = this.canvas.toBuffer('image/png');
    mkdirSync('dist/chart', {recursive: true})
    writeFileSync(`dist/chart/${this.symbol}${filenameSuffix}`, buffer);
  }

  static calculateStandardDeviation(data: ChartData[], period: number, sma: number[]): number[] {
    const stdDev: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        stdDev.push(NaN); // Not enough data yet
      } else {
        const slice = data.slice(i - period + 1, i + 1);
        const mean = sma[i]; // 해당 시점의 SMA 사용
        const sumOfSquares = slice.reduce((acc, d) => acc + Math.pow(d.close - mean, 2), 0);
        stdDev.push(Math.sqrt(sumOfSquares / period));
      }
    }
    return stdDev;
  }

  drawOverlayChart(
    inputOrMap: { 
      dataMap: Map<string, ChartData[]>; 
      eventPoint?: { title: string; timestamp: string; color?: string } | Array<{ title: string; timestamp: string; color?: string }>; 
      filenameSuffix?: string; 
      showAverage?: boolean;
      showVolume?: boolean;
      showObv?: boolean;
      smoothCurve?: boolean;
      imageWidth?: number;
      imageHeight?: number;
      lineWidth?: number;
      averageLineWidth?: number;
      eventLineWidth?: number;
      fontSize?: number;
      xAxisLabelSize?: number;
      yAxisLabelSize?: number;
      legendFontSize?: number;
      eventLabelSize?: number;
      xAxisWidth?: number;
      yAxisWidth?: number;
    } | Map<string, ChartData[]>,
    filenameSuffix: string = '_overlay_chart.png',
    showAverage: boolean = false
  ) {
    // 입력 파라미터 호환 처리: 기존 (dataMap, filenameSuffix, showAverage) 또는 객체 입력
    let dataMap: Map<string, ChartData[]>;
    let eventPoints: Array<{ title: string; timestamp: string; color?: string }>; 
    let showVolume = false;
    let showObv = false;
    let smoothCurve = false;
    let imageWidth = this.width;
    let imageHeight = this.height;
    let lineWidth = 1;
    let averageLineWidth = 2;
    let eventLineWidth = 1;
    let fontSize = 10;
    let xAxisLabelSize = 10;
    let yAxisLabelSize = 10;
    let legendFontSize = 14;
    let eventLabelSize = 10;
    let xAxisWidth = this.padding;
    let yAxisWidth = this.padding;
    if (inputOrMap instanceof Map) {
      dataMap = inputOrMap as Map<string, ChartData[]>;
      eventPoints = []; // 이벤트 없음
    } else {
      const obj = inputOrMap as { 
        dataMap: Map<string, ChartData[]>; 
        eventPoint?: any; 
        filenameSuffix?: string; 
        showAverage?: boolean; 
        showVolume?: boolean; 
        showObv?: boolean; 
        smoothCurve?: boolean; 
        imageWidth?: number; 
        imageHeight?: number; 
        lineWidth?: number; 
        averageLineWidth?: number;
        eventLineWidth?: number;
        fontSize?: number;
        xAxisLabelSize?: number;
        yAxisLabelSize?: number;
        legendFontSize?: number;
        eventLabelSize?: number;
        xAxisWidth?: number;
        yAxisWidth?: number;
      };
      dataMap = obj.dataMap;
      filenameSuffix = obj.filenameSuffix ?? filenameSuffix;
      showAverage = obj.showAverage ?? showAverage;
      showVolume = obj.showVolume ?? showVolume;
      showObv = obj.showObv ?? showObv;
      smoothCurve = obj.smoothCurve ?? smoothCurve;
      imageWidth = obj.imageWidth ?? this.width;
      imageHeight = obj.imageHeight ?? this.height;
      lineWidth = obj.lineWidth ?? 1;
      averageLineWidth = obj.averageLineWidth ?? 2;
      eventLineWidth = obj.eventLineWidth ?? 1.5;
      fontSize = obj.fontSize ?? 10;
      xAxisLabelSize = obj.xAxisLabelSize ?? obj.fontSize ?? 10;
      yAxisLabelSize = obj.yAxisLabelSize ?? obj.fontSize ?? 10;
      legendFontSize = obj.legendFontSize ?? 14;
      eventLabelSize = obj.eventLabelSize ?? obj.fontSize ?? 10;
      xAxisWidth = obj.xAxisWidth ?? this.padding;
      yAxisWidth = obj.yAxisWidth ?? this.padding;
      if (!obj.eventPoint) {
        eventPoints = [];
      } else if (Array.isArray(obj.eventPoint)) {
        eventPoints = obj.eventPoint;
      } else {
        eventPoints = [obj.eventPoint];
      }
    }
    
    // 캔버스 크기 조정 (원본 크기 저장)
    const originalWidth = this.width;
    const originalHeight = this.height;
    const originalCanvas = this.canvas;
    const originalCtx = this.ctx;
    const originalPadding = this.padding;
    
    // X축/Y축 폭 적용 (좌우는 yAxisWidth, 상하는 xAxisWidth 사용)
    const paddingLeft = yAxisWidth;
    const paddingRight = yAxisWidth;
    const paddingTop = xAxisWidth;
    const paddingBottom = xAxisWidth;
    
    // padding은 기본값으로 설정 (기존 코드 호환)
    this.padding = yAxisWidth;
    
    // 새로운 크기로 캔버스 생성 (크기가 변경된 경우에만)
    if (imageWidth !== originalWidth || imageHeight !== originalHeight) {
      const { createCanvas } = require('canvas');
      this.canvas = createCanvas(imageWidth * this.dpiScale, imageHeight * this.dpiScale);
      this.ctx = this.canvas.getContext('2d');
      this.ctx.scale(this.dpiScale, this.dpiScale);
      this.width = imageWidth;
      this.height = imageHeight;
      
      // 배경색 설정 (원래 생성자에서 하던 것과 동일)
      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    const colors = ['#0000FF', '#FF0000', '#00AA00', '#FF00FF', '#00AAAA', '#AAAA00'];
    
    // 모든 타임스탬프 수집 및 정렬
    const allTimestamps = new Set<string>();
    dataMap.forEach(data => {
      data.forEach(d => allTimestamps.add(d.timestamp));
    });
    const sortedTimestamps = Array.from(allTimestamps).sort();

    // 로컬 getX 함수 (분리된 좌우 padding 사용)
    const getXWithPadding = (index: number, dataLength: number): number => {
      const scaleX = (this.width - paddingLeft - paddingRight) / dataLength;
      return paddingLeft + index * scaleX;
    };

    // 타임스탬프 인덱스 매핑 및 시리즈 보간 헬퍼
    const timestampIndexMap = new Map<string, number>();
    sortedTimestamps.forEach((ts, idx) => timestampIndexMap.set(ts, idx));
    // 보간 함수: price 라인용 (외삽 포함)
    const interpolateSeries = (valueMap: Map<string, number>): number[] => {
      // known points: index -> value
      const indices: number[] = [];
      const values: number[] = [];
      valueMap.forEach((val, ts) => {
        const idx = timestampIndexMap.get(ts);
        if (idx !== undefined) {
          indices.push(idx);
          values.push(val);
        }
      });
      const paired = indices.map((i, k) => ({ i, v: values[k] })).sort((a, b) => a.i - b.i);
      const sortedIdx = paired.map(p => p.i);
      const sortedVal = paired.map(p => p.v);

      const result = new Array<number>(sortedTimestamps.length).fill(NaN);
      if (sortedIdx.length === 0) return result;

      // 왼쪽 외삽
      for (let i = 0; i <= sortedIdx[0]; i++) {
        if (i === sortedIdx[0]) {
          result[i] = sortedVal[0];
        } else {
          const i0 = sortedIdx[0];
          const i1 = sortedIdx[1] !== undefined ? sortedIdx[1] : sortedIdx[0];
          const v0 = sortedVal[0];
          const v1 = sortedVal[1] !== undefined ? sortedVal[1] : sortedVal[0];
          const slope = i1 === i0 ? 0 : (v1 - v0) / (i1 - i0);
          result[i] = v0 + slope * (i - i0);
        }
      }
      // 내부 보간
      for (let seg = 0; seg < sortedIdx.length - 1; seg++) {
        const i0 = sortedIdx[seg];
        const i1 = sortedIdx[seg + 1];
        const v0 = sortedVal[seg];
        const v1 = sortedVal[seg + 1];
        const slope = (v1 - v0) / (i1 - i0);
        for (let i = i0; i <= i1; i++) {
          const t = i - i0;
          result[i] = v0 + slope * t;
        }
      }
      // 오른쪽 외삽
      const last = sortedIdx[sortedIdx.length - 1];
      const prev = sortedIdx[sortedIdx.length - 2] !== undefined ? sortedIdx[sortedIdx.length - 2] : last;
      const vLast = sortedVal[sortedVal.length - 1];
      const vPrev = sortedVal[sortedVal.length - 2] !== undefined ? sortedVal[sortedVal.length - 2] : vLast;
      const slopeRight = last === prev ? 0 : (vLast - vPrev) / (last - prev);
      for (let i = last; i < sortedTimestamps.length; i++) {
        if (i === last) {
          result[i] = vLast;
        } else {
          result[i] = vLast + slopeRight * (i - last);
        }
      }
      return result;
    };

    // 보간 없는 매핑 함수: 실제 데이터만 사용, 중간 빈 구간은 NaN 유지
    const interpolateSeriesNoExtrapolate = (valueMap: Map<string, number>): number[] => {
      const result = new Array<number>(sortedTimestamps.length).fill(NaN);
      valueMap.forEach((val, ts) => {
        const idx = timestampIndexMap.get(ts);
        if (idx !== undefined) {
          result[idx] = val;
        }
      });
      return result;
    };

    // 각 주식의 데이터를 타임스탬프 기준으로 맵핑
    // close/volume/obv가 0이면 맵에 저장 안함 (라인 끊김), high/low는 0이면 캔들 미표시
    const timestampDataMap = new Map<string, Map<string, number>>();
    const obvMapBySymbol = new Map<string, Map<string, number>>();
    const highMapBySymbol = new Map<string, Map<string, number>>();
    const lowMapBySymbol = new Map<string, Map<string, number>>();
    const volumeDataMap = new Map<string, Map<string, number>>();
    const candleSkipBySymbol = new Map<string, Set<string>>(); // high/low 0값 (캔들 스킵)
    
    dataMap.forEach((data, symbol) => {
      const priceMap = new Map<string, number>();
      const obvMap = new Map<string, number>();
      const highMap = new Map<string, number>();
      const lowMap = new Map<string, number>();
      const volMap = new Map<string, number>();
      const candleSkip = new Set<string>();
      
      let lastPrice = 0, lastObv = 0, lastVol = 0;
      
      data.forEach(d => {
        // close: 0이면 아예 맵에 저장 안 함 (라인 끊김)
        if (d.close > 0) {
          priceMap.set(d.timestamp, d.close);
          lastPrice = d.close;
        }
        
        // high/low: 0이면 캔들 스킵 표시 (맵에 저장하지 않음)
        if (d.high > 0) {
          highMap.set(d.timestamp, d.high);
        } else {
          candleSkip.add(d.timestamp);
        }
        if (d.low > 0) {
          lowMap.set(d.timestamp, d.low);
        } else {
          candleSkip.add(d.timestamp);
        }
        
        // volume: 0이면 맵에 저장 안 함 (volume 라인 끊김)
        if (d.volume > 0) {
          volMap.set(d.timestamp, d.volume);
          lastVol = d.volume;
        }
        
        // obv: 0이면 맵에 저장 안 함 (obv 라인 끊김), 음수도 유효함
        if (d.obv !== undefined && d.obv !== null && d.obv !== 0) {
          obvMap.set(d.timestamp, d.obv);
          lastObv = d.obv;
        }
      });
      
      timestampDataMap.set(symbol, priceMap);
      obvMapBySymbol.set(symbol, obvMap);
      highMapBySymbol.set(symbol, highMap);
      lowMapBySymbol.set(symbol, lowMap);
      volumeDataMap.set(symbol, volMap);
      candleSkipBySymbol.set(symbol, candleSkip);
    });

    // 각 주식을 0-100% 범위로 정규화 (타임스탬프 기준)
    const normalizedDataMap = new Map<string, Map<string, number>>();
    const normalizedObvMap = new Map<string, Map<string, number>>();
    const normalizedHighMap = new Map<string, Map<string, number>>();
    const normalizedLowMap = new Map<string, Map<string, number>>();
    const normalizedVolumeMap = new Map<string, Map<string, number>>();
    timestampDataMap.forEach((priceMap, symbol) => {
      const prices = Array.from(priceMap.values());
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const range = maxPrice - minPrice;
      
      const normalizedMap = new Map<string, number>();
      priceMap.forEach((price, timestamp) => {
        const normalized = range === 0 ? 50 : ((price - minPrice) / range) * 100;
        normalizedMap.set(timestamp, normalized);
      });
      normalizedDataMap.set(symbol, normalizedMap);

      // OBV 정규화 (있을 때만)
      const obvRaw = obvMapBySymbol.get(symbol) || new Map<string, number>();
      const obvValues = Array.from(obvRaw.values());
      if (obvValues.length > 0) {
        const minObv = Math.min(...obvValues);
        const maxObv = Math.max(...obvValues);
        const obvRange = maxObv - minObv;
        const normObv = new Map<string, number>();
        obvRaw.forEach((v, ts) => {
          const nv = obvRange === 0 ? 50 : ((v - minObv) / obvRange) * 100;
          normObv.set(ts, nv);
        });
        normalizedObvMap.set(symbol, normObv);
      }

      // 고가/저가도 동일한 범위로 정규화
      const hMap = highMapBySymbol.get(symbol) || new Map<string, number>();
      const lMap = lowMapBySymbol.get(symbol) || new Map<string, number>();
      const normHigh = new Map<string, number>();
      const normLow = new Map<string, number>();
      hMap.forEach((h, ts) => {
        const nh = range === 0 ? 50 : ((h - minPrice) / range) * 100;
        normHigh.set(ts, nh);
      });
      lMap.forEach((l, ts) => {
        const nl = range === 0 ? 50 : ((l - minPrice) / range) * 100;
        normLow.set(ts, nl);
      });
      normalizedHighMap.set(symbol, normHigh);
      normalizedLowMap.set(symbol, normLow);

      // 거래량 정규화 (0~100%)
      const volMap = volumeDataMap.get(symbol) || new Map<string, number>();
      const vols = Array.from(volMap.values());
      const minVol = vols.length > 0 ? Math.min(...vols) : 0;
      const maxVol = vols.length > 0 ? Math.max(...vols) : 0;
      const volRange = maxVol - minVol;
      const normalizedVol = new Map<string, number>();
      volMap.forEach((v, ts) => {
        const norm = volRange === 0 ? 50 : ((v - minVol) / volRange) * 100;
        normalizedVol.set(ts, norm);
      });
      normalizedVolumeMap.set(symbol, normalizedVol);
    });

    const minY = 0;
    const maxY = 100;

    // 패널 분할 (Volume/OBV 표시 시)
    const panelGap = 5; // 패널 간 간격
    const totalHeight = this.height - this.padding * 2;
    let priceAreaRatio = 1.0;
    let volumeAreaRatio = 0;
    let obvAreaRatio = 0;
    let numGaps = 0; // 간격 개수
    
    if (showVolume && showObv) {
      priceAreaRatio = 0.5;
      volumeAreaRatio = 0.25;
      obvAreaRatio = 0.25;
      numGaps = 2; // price-volume, volume-obv
    } else if (showVolume) {
      priceAreaRatio = 0.7;
      volumeAreaRatio = 0.3;
      numGaps = 1; // price-volume
    } else if (showObv) {
      priceAreaRatio = 0.7;
      obvAreaRatio = 0.3;
      numGaps = 1; // price-obv
    }
    
    // 간격을 제외한 실제 차트 영역
    const availableHeight = totalHeight - (numGaps * panelGap);
    const priceAreaHeight = availableHeight * priceAreaRatio;
    const volumeAreaHeight = availableHeight * volumeAreaRatio;
    const obvAreaHeight = availableHeight * obvAreaRatio;
    
    // 패널 위치 계산
    const pricePanelTop = paddingTop;
    const pricePanelBottom = pricePanelTop + priceAreaHeight;
    const volumePanelTop = showVolume ? pricePanelBottom + panelGap : 0;
    const volumePanelBottom = showVolume ? volumePanelTop + volumeAreaHeight : 0;
    const obvPanelTop = showObv ? (showVolume ? volumePanelBottom + panelGap : pricePanelBottom + panelGap) : 0;
    const obvPanelBottom = showObv ? obvPanelTop + obvAreaHeight : 0;

    // X축 라벨용 데이터 생성
    const chartData: ChartData[] = sortedTimestamps.map(ts => ({
      timestamp: ts,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      obv: 0
    }));

    // Price 패널에 X축 그리드 및 라벨 그리기 (분리된 padding 사용)
    let lastDate = '';
    let lastLabelX = -Infinity;
    const minLabelGap = 80;
    const yAxis = this.height - paddingBottom;
    
    for (let i = 0; i < chartData.length; i++) {
      const currentData = chartData[i];
      const date = new Date(currentData.timestamp);
      const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;
      
      if (currentDate !== lastDate) {
        const x = getXWithPadding(i, chartData.length);
        
        // 점선 그리기
        this.ctx.strokeStyle = '#CCCCCC';
        this.ctx.setLineDash([2, 2]);
        this.ctx.beginPath();
        this.ctx.moveTo(x, pricePanelTop);
        this.ctx.lineTo(x, pricePanelBottom);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // 라벨 (일정 간격 이상일 때만)
        if (x - lastLabelX >= minLabelGap) {
          this.ctx.save();
          this.ctx.fillStyle = '#000000';
          this.ctx.font = `${xAxisLabelSize}px Arial`;
          this.ctx.translate(x + 2, yAxis + 14);
          this.ctx.rotate((Math.PI / 180) * 45);
          this.ctx.fillText(currentDate, 0, 0);
          this.ctx.restore();
          lastLabelX = x;
        }
        
        lastDate = currentDate;
      }
    }
    
    // 마지막 날짜 라벨
    if (chartData.length > 0) {
      const lastData = chartData[chartData.length - 1];
      const date = new Date(lastData.timestamp);
      const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;
      const x = getXWithPadding(chartData.length - 1, chartData.length);
      if (x - lastLabelX >= minLabelGap * 0.6) {
        this.ctx.save();
        this.ctx.fillStyle = '#000000';
        this.ctx.font = `${xAxisLabelSize}px Arial`;
        this.ctx.translate(x + 2, yAxis + 14);
        this.ctx.rotate((Math.PI / 180) * 45);
        this.ctx.fillText(currentDate, 0, 0);
        this.ctx.restore();
      }
    }

    // Y축 그리기
    this.ctx.strokeStyle = '#CCCCCC';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(paddingLeft, paddingTop);
    this.ctx.lineTo(paddingLeft, this.height - paddingBottom);
    this.ctx.stroke();

    // X축 그리기
    this.ctx.beginPath();
    this.ctx.moveTo(paddingLeft, this.height - paddingBottom);
    this.ctx.lineTo(this.width - paddingRight, this.height - paddingBottom);
    this.ctx.stroke();

    // Price 패널 Y축 라벨 (0-100%)
    this.ctx.fillStyle = '#000000';
    this.ctx.font = `${yAxisLabelSize}px Arial`;
    // 'Price' 라벨
    this.ctx.save();
    this.ctx.translate(15, pricePanelTop + priceAreaHeight / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Price', 0, 0);
    this.ctx.restore();
    this.ctx.textAlign = 'left';
    // 숫자 라벨
    for (let j = 0; j <= 5; j++) {
      const percent = (100 / 5) * j;
      const y = this.getYForPricePanel(percent, minY, maxY, priceAreaHeight, pricePanelTop);
      this.ctx.fillText(`${percent.toFixed(0)}%`, paddingLeft - 35, y + 3);
    }

    // Volume 패널 구분선 및 Y축 라벨
    if (showVolume) {
      this.ctx.strokeStyle = '#AAAAAA';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(paddingLeft, pricePanelBottom);
      this.ctx.lineTo(this.width - paddingRight, pricePanelBottom);
      this.ctx.stroke();
      
      // Volume 패널 그리드 (X축 가이드라인)
      let lastDateVol = '';
      for (let i = 0; i < chartData.length; i++) {
        const date = new Date(chartData[i].timestamp);
        const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;
        if (currentDate !== lastDateVol) {
          const x = getXWithPadding(i, chartData.length);
          this.ctx.strokeStyle = '#CCCCCC';
          this.ctx.setLineDash([2, 2]);
          this.ctx.beginPath();
          this.ctx.moveTo(x, volumePanelTop);
          this.ctx.lineTo(x, volumePanelBottom);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
          lastDateVol = currentDate;
        }
      }
      
      // Volume Y축 라벨 (Vol)
      this.ctx.fillStyle = '#666666';
      this.ctx.font = `${yAxisLabelSize}px Arial`;
      // 'Volume' 라벨
      this.ctx.save();
      this.ctx.translate(15, volumePanelTop + volumeAreaHeight / 2);
      this.ctx.rotate(-Math.PI / 2);
      this.ctx.textAlign = 'center';
      this.ctx.fillText('Volume', 0, 0);
      this.ctx.restore();
      this.ctx.textAlign = 'left';
      // 숫자 라벨
      const volLabelCount = 3; // 0%, 50%, 100%
      for (let j = 0; j <= volLabelCount; j++) {
        const percent = (100 / volLabelCount) * j;
        const y = volumePanelTop + volumeAreaHeight - (percent / 100) * volumeAreaHeight;
        this.ctx.fillText(`${percent.toFixed(0)}%`, paddingLeft - 30, y + 3);
      }
    }
    
    // OBV 패널 구분선 및 Y축 라벨
    if (showObv) {
      this.ctx.strokeStyle = '#AAAAAA';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      const obvSeparatorY = showVolume ? volumePanelBottom : pricePanelBottom;
      this.ctx.moveTo(paddingLeft, obvSeparatorY);
      this.ctx.lineTo(this.width - paddingRight, obvSeparatorY);
      this.ctx.stroke();
      
      // OBV 패널 그리드 (X축 가이드라인)
      let lastDateObv = '';
      for (let i = 0; i < chartData.length; i++) {
        const date = new Date(chartData[i].timestamp);
        const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;
        if (currentDate !== lastDateObv) {
          const x = getXWithPadding(i, chartData.length);
          this.ctx.strokeStyle = '#CCCCCC';
          this.ctx.setLineDash([2, 2]);
          this.ctx.beginPath();
          this.ctx.moveTo(x, obvPanelTop);
          this.ctx.lineTo(x, obvPanelBottom);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
          lastDateObv = currentDate;
        }
      }
      
      // OBV Y축 라벨
      this.ctx.fillStyle = '#666666';
      this.ctx.font = `${yAxisLabelSize}px Arial`;
      // 'OBV' 라벨
      this.ctx.save();
      this.ctx.translate(15, obvPanelTop + obvAreaHeight / 2);
      this.ctx.rotate(-Math.PI / 2);
      this.ctx.textAlign = 'center';
      this.ctx.fillText('OBV', 0, 0);
      this.ctx.restore();
      this.ctx.textAlign = 'left';
      // 숫자 라벨
      const obvLabelCount = 3; // 0%, 50%, 100%
      for (let j = 0; j <= obvLabelCount; j++) {
        const percent = (100 / obvLabelCount) * j;
        const y = obvPanelTop + obvAreaHeight - (percent / 100) * obvAreaHeight;
        this.ctx.fillText(`${percent.toFixed(0)}%`, paddingLeft - 30, y + 3);
      }
    }

    // 각 주식의 정규화된 라인 및 백그라운드 캔들, 0값 마크 그리기
    let colorIndex = 0;
    const symbols: string[] = [];

    normalizedDataMap.forEach((normalizedMap, symbol) => {
      symbols.push(symbol);
      this.ctx.strokeStyle = colors[colorIndex % colors.length];
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      const volMap = normalizedVolumeMap.get(symbol) || new Map<string, number>();

      // 외삽 없이 보간: 데이터가 있는 구간만 그리기
      const priceSeries = interpolateSeriesNoExtrapolate(normalizedMap);
      const volSeries = interpolateSeriesNoExtrapolate(volMap);

      // 백그라운드 캔들 (고가-저가 범위 시각화, 저채도/저투명)
      // high/low가 0인 지점은 캔들을 그리지 않음
      const highSeries = interpolateSeriesNoExtrapolate(normalizedHighMap.get(symbol) || new Map<string, number>());
      const lowSeries = interpolateSeriesNoExtrapolate(normalizedLowMap.get(symbol) || new Map<string, number>());
      const candleFill = `${colors[colorIndex % colors.length]}22`; // 약 13% 투명도
      this.ctx.fillStyle = candleFill;
      // 더 얇은 캔들 폭: 간격의 25% 정도, 최소 1px
      const candleWidth = Math.max(1, (this.width - this.padding * 2) / sortedTimestamps.length * 0.25);
      const candleSkip = candleSkipBySymbol.get(symbol) || new Set<string>();
      for (let i = 0; i < sortedTimestamps.length; i++) {
        const ts = sortedTimestamps[i];
        // high/low가 0인 지점은 스킵
        if (candleSkip.has(ts)) continue;
        
        const hi = highSeries[i];
        const lo = lowSeries[i];
        if (!isNaN(hi) && !isNaN(lo)) {
          const x = getXWithPadding(i, sortedTimestamps.length);
          const clampedHi = Math.max(0, Math.min(100, hi));
          const clampedLo = Math.max(0, Math.min(100, lo));
          const yHigh = this.getYForPricePanel(clampedHi, minY, maxY, priceAreaHeight, pricePanelTop);
          const yLow = this.getYForPricePanel(clampedLo, minY, maxY, priceAreaHeight, pricePanelTop);
          const h = Math.max(1, yLow - yHigh);
          this.ctx.fillRect(x - candleWidth / 2, yHigh, candleWidth, h);
        }
      }

      let prevPoint: { x: number; y: number } | null = null;
      const pricePoints: Array<{ x: number; y: number }> = [];
      
      for (let i = 0; i < priceSeries.length; i++) {
        const value = priceSeries[i];
        if (!isNaN(value)) {
          const x = getXWithPadding(i, sortedTimestamps.length);
          // 외삽으로 인한 범위 초과 방지: 0-100으로 clamp
          const clampedValue = Math.max(0, Math.min(100, value));
          const y = this.getYForPricePanel(clampedValue, minY, maxY, priceAreaHeight, pricePanelTop);
          pricePoints.push({ x, y });
        } else {
          // NaN 구간이 있으면 현재 곡선을 그리고 리셋
          if (pricePoints.length > 0) {
            this.ctx.lineWidth = 1;
            smoothCurve ? this.drawSmoothCurve(pricePoints, this.ctx) : (() => {
              this.ctx.beginPath();
              this.ctx.moveTo(pricePoints[0].x, pricePoints[0].y);
              for (let j = 1; j < pricePoints.length; j++) {
                this.ctx.lineTo(pricePoints[j].x, pricePoints[j].y);
              }
              this.ctx.stroke();
            })();
            pricePoints.length = 0;
          }
        }
      }
      // 마지막 곡선 그리기
      if (pricePoints.length > 0) {
        this.ctx.lineWidth = lineWidth;
        smoothCurve ? this.drawSmoothCurve(pricePoints, this.ctx) : (() => {
          this.ctx.beginPath();
          this.ctx.moveTo(pricePoints[0].x, pricePoints[0].y);
          for (let j = 1; j < pricePoints.length; j++) {
            this.ctx.lineTo(pricePoints[j].x, pricePoints[j].y);
          }
          this.ctx.stroke();
        })();
      }

      // Volume 선 그래프 (옵션) - 외삽 없음
      if (showVolume) {
        const volSeries = interpolateSeriesNoExtrapolate(volMap);
        this.ctx.strokeStyle = colors[colorIndex % colors.length];
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.ctx.lineWidth = lineWidth;
        
        const volPoints: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < volSeries.length; i++) {
          const v = volSeries[i];
          if (!isNaN(v)) {
            const x = getXWithPadding(i, sortedTimestamps.length);
            const clampedV = Math.max(0, Math.min(100, v));
            const y = volumePanelTop + volumeAreaHeight - (clampedV / 100) * volumeAreaHeight;
            volPoints.push({ x, y });
          } else {
            if (volPoints.length > 0) {
              smoothCurve ? this.drawSmoothCurve(volPoints, this.ctx) : (() => {
                this.ctx.beginPath();
                this.ctx.moveTo(volPoints[0].x, volPoints[0].y);
                for (let j = 1; j < volPoints.length; j++) {
                  this.ctx.lineTo(volPoints[j].x, volPoints[j].y);
                }
                this.ctx.stroke();
              })();
              volPoints.length = 0;
            }
          }
        }
        if (volPoints.length > 0) {
          smoothCurve ? this.drawSmoothCurve(volPoints, this.ctx) : (() => {
            this.ctx.beginPath();
            this.ctx.moveTo(volPoints[0].x, volPoints[0].y);
            for (let j = 1; j < volPoints.length; j++) {
              this.ctx.lineTo(volPoints[j].x, volPoints[j].y);
            }
            this.ctx.stroke();
          })();
        }
      }

      // OBV 라인 (옵션) - 외삽 없음
      if (showObv && normalizedObvMap.has(symbol)) {
        const obvSeries = interpolateSeriesNoExtrapolate(normalizedObvMap.get(symbol)!);
        this.ctx.strokeStyle = colors[colorIndex % colors.length];
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';
        this.ctx.lineWidth = lineWidth;
        
        const obvPoints: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < obvSeries.length; i++) {
          const v = obvSeries[i];
          if (!isNaN(v)) {
            const x = getXWithPadding(i, sortedTimestamps.length);
            const clampedV = Math.max(0, Math.min(100, v));
            const y = obvPanelTop + obvAreaHeight - (clampedV / 100) * obvAreaHeight;
            obvPoints.push({ x, y });
          } else {
            if (obvPoints.length > 0) {
              smoothCurve ? this.drawSmoothCurve(obvPoints, this.ctx) : (() => {
                this.ctx.beginPath();
                this.ctx.moveTo(obvPoints[0].x, obvPoints[0].y);
                for (let j = 1; j < obvPoints.length; j++) {
                  this.ctx.lineTo(obvPoints[j].x, obvPoints[j].y);
                }
                this.ctx.stroke();
              })();
              obvPoints.length = 0;
            }
          }
        }
        if (obvPoints.length > 0) {
          smoothCurve ? this.drawSmoothCurve(obvPoints, this.ctx) : (() => {
            this.ctx.beginPath();
            this.ctx.moveTo(obvPoints[0].x, obvPoints[0].y);
            for (let j = 1; j < obvPoints.length; j++) {
              this.ctx.lineTo(obvPoints[j].x, obvPoints[j].y);
            }
            this.ctx.stroke();
          })();
        }
      }

      colorIndex++;
    });

    // 평균값 그리기 (옵션)
    if (showAverage) {
      // 각 심볼의 시계열을 선형 보간하여 동일한 타임라인으로 맞춤 (외삽 없음)
      const interpolatedSeries: number[][] = [];
      const interpolatedVolSeries: number[][] = [];
      const interpolatedObvSeries: number[][] = [];
      normalizedDataMap.forEach((normalizedMap) => {
        interpolatedSeries.push(interpolateSeriesNoExtrapolate(normalizedMap));
      });
      normalizedVolumeMap.forEach((volMap) => {
        interpolatedVolSeries.push(interpolateSeriesNoExtrapolate(volMap));
      });
      normalizedObvMap.forEach((obvMap) => {
        interpolatedObvSeries.push(interpolateSeriesNoExtrapolate(obvMap));
      });

      // 타임스탬프별 평균 계산 (보간/외삽된 값 기반)
      const avgData: number[] = new Array<number>(sortedTimestamps.length).fill(NaN);
      const avgVolData: number[] = new Array<number>(sortedTimestamps.length).fill(NaN);
      const avgObvData: number[] = new Array<number>(sortedTimestamps.length).fill(NaN);
      for (let i = 0; i < sortedTimestamps.length; i++) {
        let sum = 0;
        let count = 0;
        let volSum = 0;
        let volCount = 0;
        let obvSum = 0;
        let obvCount = 0;
        
        let symIdx = 0;
        for (const [symbol] of normalizedDataMap) {
          const v = interpolatedSeries[symIdx]?.[i];
          if (!isNaN(v)) {
            sum += v;
            count++;
          }
          symIdx++;
        }
        
        symIdx = 0;
        for (const [symbol] of normalizedVolumeMap) {
          const vv = interpolatedVolSeries[symIdx]?.[i];
          if (!isNaN(vv)) {
            volSum += vv;
            volCount++;
          }
          symIdx++;
        }
        
        symIdx = 0;
        for (const [symbol] of normalizedObvMap) {
          const ov = interpolatedObvSeries[symIdx]?.[i];
          if (!isNaN(ov)) {
            obvSum += ov;
            obvCount++;
          }
          symIdx++;
        }
        
        avgData[i] = count > 0 ? sum / count : NaN;
        avgVolData[i] = volCount > 0 ? volSum / volCount : NaN;
        avgObvData[i] = obvCount > 0 ? obvSum / obvCount : NaN;
      }

      // Price 평균값 라인 (찐한 검은색)
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      this.ctx.lineWidth = averageLineWidth;
      const avgPoints: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < avgData.length; i++) {
        const value = avgData[i];
        if (!isNaN(value)) {
          const x = getXWithPadding(i, sortedTimestamps.length);
          const clampedValue = Math.max(0, Math.min(100, value));
          const y = this.getYForPricePanel(clampedValue, minY, maxY, priceAreaHeight, pricePanelTop);
          avgPoints.push({ x, y });
        } else {
          if (avgPoints.length > 0) {
            smoothCurve ? this.drawSmoothCurve(avgPoints, this.ctx) : (() => {
              this.ctx.beginPath();
              this.ctx.moveTo(avgPoints[0].x, avgPoints[0].y);
              for (let j = 1; j < avgPoints.length; j++) {
                this.ctx.lineTo(avgPoints[j].x, avgPoints[j].y);
              }
              this.ctx.stroke();
            })();
            avgPoints.length = 0;
          }
        }
      }
      if (avgPoints.length > 0) {
        smoothCurve ? this.drawSmoothCurve(avgPoints, this.ctx) : (() => {
          this.ctx.beginPath();
          this.ctx.moveTo(avgPoints[0].x, avgPoints[0].y);
          for (let j = 1; j < avgPoints.length; j++) {
            this.ctx.lineTo(avgPoints[j].x, avgPoints[j].y);
          }
          this.ctx.stroke();
        })();
      }

      // Volume 평균값 라인
      if (showVolume) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = averageLineWidth;
        const avgVolPoints: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < avgVolData.length; i++) {
          const value = avgVolData[i];
          if (!isNaN(value)) {
            const x = getXWithPadding(i, sortedTimestamps.length);
            const clampedValue = Math.max(0, Math.min(100, value));
            const y = volumePanelTop + volumeAreaHeight - (clampedValue / 100) * volumeAreaHeight;
            avgVolPoints.push({ x, y });
          } else {
            if (avgVolPoints.length > 0) {
              smoothCurve ? this.drawSmoothCurve(avgVolPoints, this.ctx) : (() => {
                this.ctx.beginPath();
                this.ctx.moveTo(avgVolPoints[0].x, avgVolPoints[0].y);
                for (let j = 1; j < avgVolPoints.length; j++) {
                  this.ctx.lineTo(avgVolPoints[j].x, avgVolPoints[j].y);
                }
                this.ctx.stroke();
              })();
              avgVolPoints.length = 0;
            }
          }
        }
        if (avgVolPoints.length > 0) {
          smoothCurve ? this.drawSmoothCurve(avgVolPoints, this.ctx) : (() => {
            this.ctx.beginPath();
            this.ctx.moveTo(avgVolPoints[0].x, avgVolPoints[0].y);
            for (let j = 1; j < avgVolPoints.length; j++) {
              this.ctx.lineTo(avgVolPoints[j].x, avgVolPoints[j].y);
            }
            this.ctx.stroke();
          })();
        }
      }

      // OBV 평균값 라인
      if (showObv) {
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = averageLineWidth;
        const avgObvPoints: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < avgObvData.length; i++) {
          const value = avgObvData[i];
          if (!isNaN(value)) {
            const x = getXWithPadding(i, sortedTimestamps.length);
            const clampedValue = Math.max(0, Math.min(100, value));
            const y = obvPanelTop + obvAreaHeight - (clampedValue / 100) * obvAreaHeight;
            avgObvPoints.push({ x, y });
          } else {
            if (avgObvPoints.length > 0) {
              smoothCurve ? this.drawSmoothCurve(avgObvPoints, this.ctx) : (() => {
                this.ctx.beginPath();
                this.ctx.moveTo(avgObvPoints[0].x, avgObvPoints[0].y);
                for (let j = 1; j < avgObvPoints.length; j++) {
                  this.ctx.lineTo(avgObvPoints[j].x, avgObvPoints[j].y);
                }
                this.ctx.stroke();
              })();
              avgObvPoints.length = 0;
            }
          }
        }
        if (avgObvPoints.length > 0) {
          smoothCurve ? this.drawSmoothCurve(avgObvPoints, this.ctx) : (() => {
            this.ctx.beginPath();
            this.ctx.moveTo(avgObvPoints[0].x, avgObvPoints[0].y);
            for (let j = 1; j < avgObvPoints.length; j++) {
              this.ctx.lineTo(avgObvPoints[j].x, avgObvPoints[j].y);
            }
            this.ctx.stroke();
          })();
        }
      }
    }

    // 범례 그리기 (우측 상단 고정, padding 내부)
    const legendPadding = 20;
    const legendWidth = 250;
    const legendX = this.width - paddingRight - legendWidth; // padding 내부에서 250px
    const legendY = paddingTop + legendPadding; // padding 내부에서 시작
    this.ctx.font = `${legendFontSize}px Arial`;
    
    colorIndex = 0;
    symbols.forEach((symbol, idx) => {
      this.ctx.fillStyle = colors[colorIndex % colors.length];
      this.ctx.fillRect(legendX, legendY + idx * 22, 20, 3);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillText(symbol, legendX + 30, legendY + idx * 22 + 5);
      colorIndex++;
    });

    let legendOffset = symbols.length * 22;
    // 평균 범례 (옵션)
    if (showAverage) {
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(legendX, legendY + legendOffset, 20, 3);
      this.ctx.fillText('Average (Interpolated)', legendX + 30, legendY + legendOffset + 5);
      legendOffset += 22;
    }
    // Volume 범례 (옵션)
    if (showVolume) {
      this.ctx.fillStyle = '#888888';
      this.ctx.fillRect(legendX, legendY + legendOffset, 20, 2);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillText('Volume (trend)', legendX + 30, legendY + legendOffset + 5);
      legendOffset += 22;
    }
    // OBV 범례 (옵션)
    if (showObv) {
      this.ctx.fillStyle = '#666666';
      this.ctx.fillRect(legendX, legendY + legendOffset, 20, 2);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillText('OBV (normalized)', legendX + 30, legendY + legendOffset + 5);
    }

    // 이벤트 마커 그리기 (맨 마지막에 - 모든 데이터 위에)
    if (eventPoints && eventPoints.length > 0) {
      const findNearestIndex = (ts: string): number => {
        const exact = sortedTimestamps.indexOf(ts);
        if (exact !== -1) return exact;
        // 가까운 타임스탬프 탐색 (날짜 파싱 기준)
        const target = new Date(ts).getTime();
        let bestIdx = 0;
        let bestDiff = Number.POSITIVE_INFINITY;
        for (let i = 0; i < sortedTimestamps.length; i++) {
          const t = new Date(sortedTimestamps[i]).getTime();
          const diff = Math.abs(t - target);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
        return bestIdx;
      };

      eventPoints.forEach(evt => {
        const exact = sortedTimestamps.indexOf(evt.timestamp);
        // 데이터에 정확히 존재하는 이벤트만 그리기
        if (exact !== -1) {
          const idx = exact;
          const x = getXWithPadding(idx, sortedTimestamps.length);
          const color = evt.color || '#333333';

          this.ctx.save();
          this.ctx.strokeStyle = color;
          this.ctx.fillStyle = color;
          this.ctx.lineWidth = eventLineWidth;
          // 전체 차트 높이에 수직 실선 (모든 패널을 관통)
          this.ctx.beginPath();
          this.ctx.moveTo(x, paddingTop);
          this.ctx.lineTo(x, this.height - paddingBottom);
          this.ctx.stroke();
          // 축 아래로 표시되는 틱
          const yAxis = this.height - paddingBottom;
          this.ctx.beginPath();
          this.ctx.moveTo(x, yAxis);
          this.ctx.lineTo(x, yAxis + 10);
          this.ctx.stroke();

          // 라벨: 기울여서 충돌 줄이기
          this.ctx.translate(x + 5, yAxis + 14);
          this.ctx.rotate((Math.PI / 180) * 45);
          this.ctx.font = `bold ${eventLabelSize}px Arial`;
          this.ctx.fillText(evt.title, 0, 0);
          this.ctx.restore();
        }
      });
    }

    this.saveChart(filenameSuffix);
    
    // 캔버스 크기 및 패딩 복원
    if (imageWidth !== originalWidth || imageHeight !== originalHeight) {
      this.canvas = originalCanvas;
      this.ctx = originalCtx;
      this.width = originalWidth;
      this.height = originalHeight;
    }
    this.padding = originalPadding;
  }
}

export { Chart, ChartData, TradePoint };
