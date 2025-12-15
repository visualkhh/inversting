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

  private drawXAxisLabelsAndGrid(data: ChartData[]) {
    let lastDate = '';
    let lastLabelX = -Infinity;
    const minLabelGap = 80; // px 간격 기준으로 라벨 간소화
    const yAxis = this.height - this.padding;
    for (let i = 0; i < data.length; i++) {
      const currentData = data[i];
      const date = new Date(currentData.timestamp);
      const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;

      // 일자 변경 시 라벨 및 점선 추가
      if (currentDate !== lastDate) {
        const x = this.getX(i, data.length);

        // 점선 그리기 (기존 유지)
        this.ctx.strokeStyle = '#CCCCCC';
        this.ctx.setLineDash([2, 2]); // 점선 설정
        this.ctx.beginPath();
        this.ctx.moveTo(x, this.padding);
        this.ctx.lineTo(x, this.height - this.padding);
        this.ctx.stroke();
        this.ctx.setLineDash([]); // 점선 해제

        // 라벨은 일정 픽셀 간격 이상일 때만 표기 (기울여서 표시)
        if (x - lastLabelX >= minLabelGap) {
          this.ctx.save();
          this.ctx.fillStyle = '#000000';
          this.ctx.font = '10px Arial';
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
        this.ctx.font = '10px Arial';
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
    } | Map<string, ChartData[]>,
    filenameSuffix: string = '_overlay_chart.png',
    showAverage: boolean = true
  ) {
    // 입력 파라미터 호환 처리: 기존 (dataMap, filenameSuffix, showAverage) 또는 객체 입력
    let dataMap: Map<string, ChartData[]>;
    let eventPoints: Array<{ title: string; timestamp: string; color?: string }>; 
    if (inputOrMap instanceof Map) {
      dataMap = inputOrMap as Map<string, ChartData[]>;
      eventPoints = []; // 이벤트 없음
    } else {
      const obj = inputOrMap as { dataMap: Map<string, ChartData[]>; eventPoint?: any; filenameSuffix?: string; showAverage?: boolean };
      dataMap = obj.dataMap;
      filenameSuffix = obj.filenameSuffix ?? filenameSuffix;
      showAverage = obj.showAverage ?? showAverage;
      if (!obj.eventPoint) {
        eventPoints = [];
      } else if (Array.isArray(obj.eventPoint)) {
        eventPoints = obj.eventPoint;
      } else {
        eventPoints = [obj.eventPoint];
      }
    }
    const colors = ['#0000FF', '#FF0000', '#00AA00', '#FF00FF', '#00AAAA', '#AAAA00'];
    
    // 모든 타임스탬프 수집 및 정렬
    const allTimestamps = new Set<string>();
    dataMap.forEach(data => {
      data.forEach(d => allTimestamps.add(d.timestamp));
    });
    const sortedTimestamps = Array.from(allTimestamps).sort();

    // 각 주식의 데이터를 타임스탬프 기준으로 맵핑
    const timestampDataMap = new Map<string, Map<string, number>>();
    dataMap.forEach((data, symbol) => {
      const priceMap = new Map<string, number>();
      data.forEach(d => {
        priceMap.set(d.timestamp, d.close);
      });
      timestampDataMap.set(symbol, priceMap);
    });

    // 각 주식을 0-100% 범위로 정규화 (타임스탬프 기준)
    const normalizedDataMap = new Map<string, Map<string, number>>();
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
    });

    const minY = 0;
    const maxY = 100;

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

    this.drawAxes(minY, maxY);
    this.drawXAxisLabelsAndGrid(chartData);

    // 이벤트 마커 그리기 (X축 영역)
    if (eventPoints && eventPoints.length > 0) {
      const yAxis = this.height - this.padding;
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
        const idx = findNearestIndex(evt.timestamp);
        const x = this.getX(idx, sortedTimestamps.length);
        const color = evt.color || '#333333';

        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.fillStyle = color;
        this.ctx.lineWidth = 1.5;
        // 차트 영역 전체에 수직 실선 (이벤트 라인)
        this.ctx.beginPath();
        this.ctx.moveTo(x, this.padding);
        this.ctx.lineTo(x, this.height - this.padding);
        this.ctx.stroke();
        // 축 아래로 표시되는 틱
        this.ctx.beginPath();
        this.ctx.moveTo(x, yAxis);
        this.ctx.lineTo(x, yAxis + 10);
        this.ctx.stroke();

        // 라벨: 기울여서 충돌 줄이기
        this.ctx.translate(x + 5, yAxis + 14);
        this.ctx.rotate((Math.PI / 180) * 45);
        this.ctx.font = 'bold 10px Arial';
        this.ctx.fillText(evt.title, 0, 0);
        this.ctx.restore();
      });
    }

    // Y축 라벨을 % 형식으로 다시 그리기
    this.ctx.fillStyle = '#000000';
    this.ctx.font = '12px Arial';
    for (let j = 0; j <= 5; j++) {
      const percent = (100 / 5) * j;
      this.ctx.fillText(`${percent.toFixed(0)}%`, this.padding - 40, this.getY(percent, minY, maxY) + 5);
    }

    // 각 주식의 정규화된 라인 그리기 (얇게)
    let colorIndex = 0;
    const symbols: string[] = [];
    normalizedDataMap.forEach((normalizedMap, symbol) => {
      symbols.push(symbol);
      this.ctx.strokeStyle = colors[colorIndex % colors.length];
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      
      let firstPoint = true;
      sortedTimestamps.forEach((timestamp, i) => {
        const value = normalizedMap.get(timestamp);
        if (value !== undefined) {
          const x = this.getX(i, sortedTimestamps.length);
          const y = this.getY(value, minY, maxY);
          if (firstPoint) {
            this.ctx.moveTo(x, y);
            firstPoint = false;
          } else {
            this.ctx.lineTo(x, y);
          }
        }
      });
      this.ctx.stroke();
      colorIndex++;
    });

    // 평균값 그리기 (옵션)
    if (showAverage) {
      // 각 심볼의 시계열을 선형 보간하여 동일한 타임라인으로 맞춤
      const interpolatedSeries: number[][] = [];

      const timestampIndexMap = new Map<string, number>();
      sortedTimestamps.forEach((ts, idx) => timestampIndexMap.set(ts, idx));

      const interpolateLine = (normalizedMap: Map<string, number>): number[] => {
        // known points: index -> value
        const indices: number[] = [];
        const values: number[] = [];
        normalizedMap.forEach((val, ts) => {
          const idx = timestampIndexMap.get(ts);
          if (idx !== undefined) {
            indices.push(idx);
            values.push(val);
          }
        });
        // 정렬 보장 (Map 순서가 임의일 수 있음)
        const paired = indices.map((i, k) => ({ i, v: values[k] })).sort((a, b) => a.i - b.i);
        const sortedIdx = paired.map(p => p.i);
        const sortedVal = paired.map(p => p.v);

        const result = new Array<number>(sortedTimestamps.length).fill(NaN);
        if (sortedIdx.length === 0) return result;

        // 좌/우 외삽: 가장 좌측, 우측 구간은 최근 기울기 적용한 선형 외삽
        // 내부 구간: 인접한 두 점 사이 선형 보간
        // 왼쪽 외삽
        for (let i = 0; i <= sortedIdx[0]; i++) {
          if (i === sortedIdx[0]) {
            result[i] = sortedVal[0];
          } else {
            // 첫 두 점의 기울기로 외삽 (첫 점 이전)
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

      normalizedDataMap.forEach((normalizedMap) => {
        interpolatedSeries.push(interpolateLine(normalizedMap));
      });

      // 타임스탬프별 평균 계산 (보간/외삽된 값 기반)
      const avgData: number[] = new Array<number>(sortedTimestamps.length).fill(NaN);
      for (let i = 0; i < sortedTimestamps.length; i++) {
        let sum = 0;
        let count = 0;
        for (let s = 0; s < interpolatedSeries.length; s++) {
          const v = interpolatedSeries[s][i];
          if (!isNaN(v)) {
            sum += v;
            count++;
          }
        }
        avgData[i] = count > 0 ? sum / count : NaN;
      }

      // 평균값 라인 (찐한 검은색)
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      let firstAvgPoint = true;
      avgData.forEach((value, i) => {
        if (!isNaN(value)) {
          const x = this.getX(i, sortedTimestamps.length);
          const y = this.getY(value, minY, maxY);
          if (firstAvgPoint) {
            this.ctx.moveTo(x, y);
            firstAvgPoint = false;
          } else {
            this.ctx.lineTo(x, y);
          }
        }
      });
      this.ctx.stroke();
    }

    // 범례 그리기
    const legendX = this.width - this.padding - 150;
    const legendY = this.padding + 20;
    this.ctx.font = '14px Arial';
    
    colorIndex = 0;
    symbols.forEach((symbol, idx) => {
      this.ctx.fillStyle = colors[colorIndex % colors.length];
      this.ctx.fillRect(legendX, legendY + idx * 25, 20, 3);
      this.ctx.fillStyle = '#000000';
      this.ctx.fillText(symbol, legendX + 30, legendY + idx * 25 + 5);
      colorIndex++;
    });

    // 평균 범례 (옵션)
    if (showAverage) {
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(legendX, legendY + symbols.length * 25, 20, 3);
      this.ctx.fillText('Average (Interpolated)', legendX + 30, legendY + symbols.length * 25 + 5);
    }

    this.saveChart(filenameSuffix);
  }
}

export { Chart, ChartData, TradePoint };
