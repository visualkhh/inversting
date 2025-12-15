console.log('---saa');


import yf from 'yahoo-finance2';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { Parser } from 'json2csv';

yf.suppressNotices(['ripHistorical']);

// 10분 단위로 집계된 데이터의 인터페이스 정의
interface AggregatedData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  obv?: number; // OBV (선택적)
}

export type Interval = Parameters<typeof yf.chart>[1]['interval']

export async function getData(symbol: string, {period = '7d', interval = '15m'}: {
  period?: string, interval?: Interval
} = {}): Promise<string> {
  mkdirSync('dist/stock', {recursive: true})
  let fileName = `dist/stock/${symbol}_${period}_${interval}_data.csv`;
  if (existsSync(fileName)) {
    return fileName;
  }


  // try {
    // 시작 날짜 계산
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7); // 7일 전


    // 1분 단위 데이터 가져오기
    const result = await yf.chart(symbol, {
      period1: startDate, // Date 객체 사용
      period2: endDate,   // 현재 날짜
      interval: interval, // interval 파라미터 사용
      // interval: '15m', // interval 파라미터 사용
    });

    // quotes 배열에서 데이터 추출
    const quotes = result.quotes;

    // 1분 데이터를 10분 단위로 집계
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

          // OBV 계산
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
        timestamp: currentTime,
        open: tempData[0].open,
        high: Math.max(...tempData.map((d) => d.high)),
        low: Math.min(...tempData.map((d) => d.low)),
        close: tempData[tempData.length - 1].close,
        volume: tempData.reduce((sum, d) => sum + d.volume, 0),
      };

      // OBV 계산
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

    console.log(aggregatedData);

    // CSV로 저장
    const fields = ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'obv'];
    const parser = new Parser({fields});
    const csv = parser.parse(aggregatedData);

    writeFileSync(fileName, csv);
    return fileName;

  // } catch (error) {
  //   console.error('Error:', (error as Error).message);
  // }
}

// 실행
// getData("AAPL"); // 예: 애플 주식