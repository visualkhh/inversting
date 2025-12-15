import yf from 'yahoo-finance2';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { Parser } from 'json2csv';
import { parse } from 'csv-parse/sync';
import { ChartData } from '../chart/Chart';

yf.suppressNotices(['ripHistorical']);

export type Interval = Parameters<typeof yf.chart>[1]['interval'];

export interface StockData extends ChartData {}

interface AggregatedData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  obv?: number;
}

type PeriodConfig = {
  period: string;
  interval: Interval;
};

type DateRangeConfig = {
  from: string; // 'YYYY-MM-DD' 형식
  to: string;   // 'YYYY-MM-DD' 형식
  interval: Interval;
};

export class StockLoader {
  private config: PeriodConfig | DateRangeConfig;

  constructor(config: PeriodConfig | DateRangeConfig = { period: '7d', interval: '30m' }) {
    this.config = config;
  }

  private isPeriodConfig(config: PeriodConfig | DateRangeConfig): config is PeriodConfig {
    return 'period' in config;
  }

  private getFileName(symbol: string): string {
    if (this.isPeriodConfig(this.config)) {
      return `dist/stock/${symbol}_${this.config.period}_${this.config.interval}_data.csv`;
    } else {
      return `dist/stock/${symbol}_${this.config.from}_${this.config.to}_${this.config.interval}_data.csv`;
    }
  }

  private parsePeriodToDays(period: string): number {
    const match = period.match(/^(\d+)([dmy])$/);
    if (!match) return 7; // 기본값
    
    const [, num, unit] = match;
    const value = parseInt(num);
    
    switch (unit) {
      case 'd': return value;
      case 'm': return value * 30;
      case 'y': return value * 365;
      default: return 7;
    }
  }

  private async fetchDataFromYahoo(symbol: string): Promise<string> {
    mkdirSync('dist/stock', { recursive: true });
    const fileName = this.getFileName(symbol);
    
    if (existsSync(fileName)) {
      return fileName;
    }

    let startDate: Date;
    let endDate: Date;
    let interval: Interval;

    if (this.isPeriodConfig(this.config)) {
      // period 방식
      endDate = new Date();
      startDate = new Date();
      const days = this.parsePeriodToDays(this.config.period);
      startDate.setDate(endDate.getDate() - days);
      interval = this.config.interval;
    } else {
      // from/to 날짜 방식
      startDate = new Date(this.config.from);
      endDate = new Date(this.config.to);
      interval = this.config.interval;
    }

    const result = await yf.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: interval,
    });

    const quotes = result.quotes;
    const aggregatedData: AggregatedData[] = [];
    let tempData: any[] = [];
    let currentTime: string | null = null;
    let obv = 0;

    quotes.forEach((row) => {
      const timestamp = new Date(row.date);
      const minute = timestamp.getMinutes();
      const tenMinBucket = Math.floor(minute / 10) * 10;
      const bucketTime = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(tenMinBucket).padStart(2, '0')}:00`;

      if (!currentTime) currentTime = bucketTime;

      if (bucketTime === currentTime) {
        tempData.push({
          timestamp: row.date,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume,
        });
      } else {
        if (tempData.length > 0) {
          const aggregated: AggregatedData = {
            timestamp: currentTime,
            open: tempData[0].open,
            high: Math.max(...tempData.map((d) => d.high)),
            low: Math.min(...tempData.map((d) => d.low)),
            close: tempData[tempData.length - 1].close,
            volume: tempData.reduce((sum, d) => sum + d.volume, 0),
          };

          if (aggregatedData.length > 0) {
            const prevClose = aggregatedData[aggregatedData.length - 1].close;
            const sign = aggregated.close > prevClose ? 1 : aggregated.close < prevClose ? -1 : 0;
            obv += sign * aggregated.volume;
            aggregated.obv = obv;
          } else {
            aggregated.obv = 0;
          }

          aggregatedData.push(aggregated);
        }
        tempData = [{
          timestamp: row.date.toISOString(),
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume,
        }];
        currentTime = bucketTime;
      }
    });

    // 마지막 버킷 처리
    if (tempData.length > 0) {
      const aggregated: AggregatedData = {
        // @ts-ignore
        timestamp: currentTime,
        open: tempData[0].open,
        high: Math.max(...tempData.map((d) => d.high)),
        low: Math.min(...tempData.map((d) => d.low)),
        close: tempData[tempData.length - 1].close,
        volume: tempData.reduce((sum, d) => sum + d.volume, 0),
      };

      if (aggregatedData.length > 0) {
        const prevClose = aggregatedData[aggregatedData.length - 1].close;
        const sign = aggregated.close > prevClose ? 1 : aggregated.close < prevClose ? -1 : 0;
        obv += sign * aggregated.volume;
        aggregated.obv = obv;
      } else {
        aggregated.obv = 0;
      }

      aggregatedData.push(aggregated);
    }

    const fields = ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'obv'];
    const parser = new Parser({ fields });
    const csv = parser.parse(aggregatedData);

    writeFileSync(fileName, csv);
    return fileName;
  }

  private loadCsvToJson(filePath: string): StockData[] {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        cast: true
      });
      // close 가격이 0이거나 유효하지 않은 데이터 필터링
      return (records as StockData[]).filter(record => {
        const close = Number(record.close);
        return !isNaN(close) && close > 0;
      });
    } catch (error) {
      console.error('Error loading CSV:', (error as Error).message);
      return [];
    }
  }

  async loadStock(symbol: string): Promise<StockData[]> {
    const file = await this.fetchDataFromYahoo(symbol);
    const stockData = this.loadCsvToJson(file);
    console.log(`${symbol}: ${stockData.length} records loaded`);
    return stockData;
  }

  async loadStocks(symbols: string[]): Promise<Map<string, StockData[]>> {
    const dataMap = new Map<string, StockData[]>();
    
    for (const symbol of symbols) {
      const stockData = await this.loadStock(symbol);
      dataMap.set(symbol, stockData);
    }
    
    return dataMap;
  }
}
