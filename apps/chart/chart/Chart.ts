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

  constructor(symbol: string, width: number = 1200, height: number = 600, padding: number = 50) {
    this.symbol = symbol;
    this.width = width;
    this.height = height;
    this.padding = padding;
    this.canvas = createCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext('2d');

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
    for (let i = 0; i < data.length; i++) {
      const currentData = data[i];
      const date = new Date(currentData.timestamp);
      const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;

      // 일자 변경 시 라벨 및 점선 추가
      if (currentDate !== lastDate) {
        const x = this.getX(i, data.length);
        this.ctx.fillStyle = '#000000';
        this.ctx.font = '12px Arial';
        this.ctx.fillText(currentDate, x - 20, this.height - this.padding + 20);

        // 점선 그리기
        this.ctx.strokeStyle = '#CCCCCC';
        this.ctx.setLineDash([2, 2]); // 점선 설정
        this.ctx.beginPath();
        this.ctx.moveTo(x, this.padding);
        this.ctx.lineTo(x, this.height - this.padding);
        this.ctx.stroke();
        this.ctx.setLineDash([]); // 점선 해제

        lastDate = currentDate;
      }
    }
    // 마지막 날짜 라벨이 누락될 경우 추가
    if (data.length > 0) {
      const lastData = data[data.length - 1];
      const date = new Date(lastData.timestamp);
      const currentDate = `${date.getMonth() + 1}/${date.getDate()}`;
      const x = this.getX(data.length - 1, data.length);
      this.ctx.fillStyle = '#000000';
      this.ctx.font = '12px Arial';
      // 이미 라벨이 그려져 있지 않다면 추가 (겹치지 않게)
      if (currentDate !== lastDate) {
        this.ctx.fillText(currentDate, x - 20, this.height - this.padding + 20);
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

  drawOverlayChart(dataMap: Map<string, ChartData[]>, filenameSuffix: string = '_overlay_chart.png', showAverage: boolean = true) {
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
      // 정규화된 값들의 평균 계산 (타임스탬프 기준)
      const avgData: number[] = [];
      sortedTimestamps.forEach(timestamp => {
        let sum = 0;
        let count = 0;
        normalizedDataMap.forEach(normalizedMap => {
          const value = normalizedMap.get(timestamp);
          if (value !== undefined) {
            sum += value;
            count++;
          }
        });
        avgData.push(count > 0 ? sum / count : NaN);
      });

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
      this.ctx.fillText('Average', legendX + 30, legendY + symbols.length * 25 + 5);
    }

    this.saveChart(filenameSuffix);
  }
}

export { Chart, ChartData, TradePoint };
