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

  private async fetchDataFromYahoo(symbol: string, events?: string): Promise<string> {
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

    const chartOptions: any = {
      period1: startDate,
      period2: endDate,
      interval: interval,
    };

    if (events) {
      chartOptions.events = events;
    }

    const result = await yf.chart(symbol, chartOptions);

    const quotes = (result as any).quotes;
    const aggregatedData: AggregatedData[] = [];
    let tempData: any[] = [];
    let currentTime: string | null = null;
    let obv = 0;

    quotes.forEach((row: any) => {
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

      const toNumberOrNull = (v: any): number | null => {
        if (v === undefined || v === null || v === '') return null;
        const n = Number(v);
        return isNaN(n) ? null : n;
      };

      return (records as StockData[]).map(record => {
        if (typeof record.timestamp === 'string') {
          record.timestamp = record.timestamp.replace(/"/g, '');
        }
        record.open = toNumberOrNull(record.open) as any;
        record.high = toNumberOrNull(record.high) as any;
        record.low = toNumberOrNull(record.low) as any;
        record.close = toNumberOrNull(record.close) as any;
        record.volume = toNumberOrNull(record.volume) as any;
        if (record.obv !== undefined) record.obv = toNumberOrNull(record.obv) as any;
        return record;
      });
    } catch (error) {
      console.error('Error loading CSV:', (error as Error).message);
      return [];
    }
  }

  async loadStock(symbol: string, events?: string): Promise<StockData[]> {
    const file = await this.fetchDataFromYahoo(symbol, events);
    const stockData = this.loadCsvToJson(file);
    console.log(`${symbol}: ${stockData.length} records loaded`);
    return stockData;
  }

  async loadStocks(symbols: string[], events?: string): Promise<Map<string, StockData[]>> {
    const dataMap = new Map<string, StockData[]>();
    
    for (const symbol of symbols) {
      const stockData = await this.loadStock(symbol, events);
      dataMap.set(symbol, stockData);
    }
    
    return dataMap;
  }

  async loadEventsFromChart(symbols: string[]): Promise<Array<{ timestamp: string; label: string; color?: string }>> {
    const events: Array<{ timestamp: string; label: string; color?: string }> = [];
    const colorMap = ['#FF0000', '#0000FF', '#00AA00', '#FF00FF', '#FF6600', '#00AAAA'];

    let startDate: Date;
    let endDate: Date;

    if (this.isPeriodConfig(this.config)) {
      endDate = new Date();
      startDate = new Date();
      const days = this.parsePeriodToDays(this.config.period);
      startDate.setDate(endDate.getDate() - days);
    } else {
      startDate = new Date(this.config.from);
      endDate = new Date(this.config.to);
    }

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        console.log(`Loading events for ${symbol} using chart API...`);
        const result = await yf.chart(symbol, {
          period1: startDate,
          period2: endDate,
          events: 'div|split|earn'
        });

        // Dividends
        if (result.events?.dividends) {
          for (const [timestamp, dividend] of Object.entries(result.events.dividends)) {
            const date = new Date(parseInt(timestamp) * 1000);
            const timestampStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
            events.push({
              timestamp: timestampStr,
              label: `${symbol} Div $${dividend.amount?.toFixed(2) || ''}`,
              color: colorMap[i % colorMap.length],
            });
          }
        }

        // Stock Splits
        if (result.events?.splits) {
          for (const [timestamp, split] of Object.entries(result.events.splits)) {
            const date = new Date(parseInt(timestamp) * 1000);
            const timestampStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
            const ratio = split.splitRatio || `${split.numerator}:${split.denominator}`;
            events.push({
              timestamp: timestampStr,
              label: `${symbol} Split ${ratio}`,
              color: colorMap[i % colorMap.length],
            });
          }
        }

        // Earnings
        if ((result.events as any)?.earnings) {
          for (const [timestamp, earning] of Object.entries((result.events as any).earnings)) {
            const earningData = earning as any;
            const date = new Date(parseInt(timestamp) * 1000);
            const timestampStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
            const actual = earningData.actual !== undefined ? earningData.actual.toFixed(2) : 'N/A';
            const estimate = earningData.estimate !== undefined ? earningData.estimate.toFixed(2) : 'N/A';
            const diff = (earningData.actual !== undefined && earningData.estimate !== undefined) 
              ? (earningData.actual - earningData.estimate).toFixed(2) 
              : '';
            const surprise = diff && parseFloat(diff) > 0 ? ' ✓' : diff && parseFloat(diff) < 0 ? ' ✗' : '';
            events.push({
              timestamp: timestampStr,
              label: `${symbol} Earnings ${actual}/${estimate}${surprise}`,
              color: colorMap[i % colorMap.length],
            });
          }
        }

      } catch (error) {
        console.warn(`Failed to load events for ${symbol}:`, (error as Error).message);
      }
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    console.log(`Total ${events.length} events loaded from chart API`);
    return events;
  }

  async loadEvents(symbols: string[]): Promise<Array<{ timestamp: string; label: string; color?: string }>> {
    const events: Array<{ timestamp: string; label: string; color?: string }> = [];
    const colorMap = ['#FF0000', '#0000FF', '#00AA00', '#FF00FF', '#FF6600', '#00AAAA'];

    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      try {
        console.log(`Loading events for ${symbol}...`);
        const result = await yf.quoteSummary(symbol, {
          modules: [
            'calendarEvents',
            'earningsHistory',
            'earningsTrend',
            'secFilings',
            'upgradeDowngradeHistory',
            'insiderTransactions'
          ]
        });

        // Calendar Events
        const calendarEvents = result.calendarEvents;
        
        // 배당금 지급일 (Dividend Date)
        if (calendarEvents?.dividendDate) {
          const date = new Date(calendarEvents.dividendDate);
          const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
          events.push({
            timestamp,
            label: `${symbol} Dividend`,
            color: colorMap[i % colorMap.length],
          });
        }

        // 실적 발표일 (Earnings Date)
        if (calendarEvents?.earnings?.earningsDate) {
          const earningsDateArray = Array.isArray(calendarEvents.earnings.earningsDate) 
            ? calendarEvents.earnings.earningsDate 
            : [calendarEvents.earnings.earningsDate];
            
          for (const earningsDate of earningsDateArray) {
            const date = new Date(earningsDate);
            const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
            events.push({
              timestamp,
              label: `${symbol} Earnings`,
              color: colorMap[i % colorMap.length],
            });
          }
        }

        // 배당락일 (Ex-Dividend Date)
        if (calendarEvents?.exDividendDate) {
          const date = new Date(calendarEvents.exDividendDate);
          const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
          events.push({
            timestamp,
            label: `${symbol} Ex-Div`,
            color: colorMap[i % colorMap.length],
          });
        }

        // Earnings History (과거 실적)
        if (result.earningsHistory?.history) {
          for (const earning of result.earningsHistory.history) {
            if (earning.quarter) {
              const date = new Date(earning.quarter);
              const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
              const epsActual = (earning.epsActual as any)?.fmt || '';
              const epsEstimate = (earning.epsEstimate as any)?.fmt || '';
              events.push({
                timestamp,
                label: `${symbol} Q Earnings ${epsActual}/${epsEstimate}`,
                color: colorMap[i % colorMap.length],
              });
            }
          }
        }

        // Upgrade/Downgrade History (애널리스트 등급 변경)
        if (result.upgradeDowngradeHistory?.history) {
          for (const upgrade of result.upgradeDowngradeHistory.history.slice(0, 5)) { // 최근 5개만
            if (upgrade.epochGradeDate) {
              const date = new Date((upgrade.epochGradeDate as any) * 1000);
              const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
              const action = upgrade.action || '';
              const toGrade = upgrade.toGrade || '';
              const firm = upgrade.firm || '';
              events.push({
                timestamp,
                label: `${symbol} ${action} ${toGrade} by ${firm}`,
                color: colorMap[i % colorMap.length],
              });
            }
          }
        }

        // SEC Filings (증권거래위원회 제출서류)
        if (result.secFilings?.filings) {
          for (const filing of result.secFilings.filings.slice(0, 3)) { // 최근 3개만
            if (filing.epochDate) {
              const date = new Date((filing.epochDate as any) * 1000);
              const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
              const type = filing.type || '';
              events.push({
                timestamp,
                label: `${symbol} SEC ${type}`,
                color: colorMap[i % colorMap.length],
              });
            }
          }
        }

        // Insider Transactions (내부자 거래)
        if ((result as any).insiderTransactions?.transactions) {
          for (const transaction of (result as any).insiderTransactions.transactions.slice(0, 3)) { // 최근 3개만
            if (transaction.startDate) {
              const date = new Date(transaction.startDate);
              const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} 09:00:00`;
              const transactionText = transaction.transactionText || '';
              const shares = transaction.shares?.fmt || '';
              events.push({
                timestamp,
                label: `${symbol} Insider ${transactionText} ${shares}`,
                color: colorMap[i % colorMap.length],
              });
            }
          }
        }

      } catch (error) {
        console.warn(`Failed to load events for ${symbol}:`, (error as Error).message);
      }
    }

    // 시간 순으로 정렬
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    console.log(`Total ${events.length} events loaded from quoteSummary`);
    return events;
  }

  async loadAllEvents(symbols: string[]): Promise<Array<{ timestamp: string; label: string; color?: string }>> {
    console.log('Loading events from both chart API and quoteSummary...');
    
    // chart API에서 이벤트 가져오기 (배당, 분할, 실적)
    const chartEvents = await this.loadEventsFromChart(symbols);
    
    // quoteSummary에서 이벤트 가져오기 (캘린더, 실적 히스토리, 등급 변경, SEC, 내부자 거래)
    const summaryEvents = await this.loadEvents(symbols);
    
    // 두 결과 합치기
    const allEvents = [...chartEvents, ...summaryEvents];
    
    // 중복 제거 (같은 심볼, 같은 날짜, 비슷한 레이블)
    const uniqueEvents = allEvents.filter((event, index, self) => {
      return index === self.findIndex((e) => {
        const sameTimestamp = e.timestamp === event.timestamp;
        const sameSymbol = e.label.split(' ')[0] === event.label.split(' ')[0];
        const sameType = e.label.includes(event.label.split(' ')[1]) || event.label.includes(e.label.split(' ')[1]);
        return sameTimestamp && sameSymbol && sameType;
      });
    });
    
    // 시간 순으로 정렬
    uniqueEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    console.log(`Total ${uniqueEvents.length} unique events loaded (${chartEvents.length} from chart + ${summaryEvents.length} from quoteSummary)`);
    return uniqueEvents;
  }
}
