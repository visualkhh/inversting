import { getData, Interval } from 'stock/Stock';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

interface StockConfig {
  symbol: string;
  period: string;
  interval: Interval;
  commissionRate: number;
  buyQuantity: number;
  sellQuantity: number;
  consecutiveHighEntryThreshold: number;
  consecutiveHighExitThreshold: number;
  consecutiveLowExitThreshold: number;
}

interface StockResult {
  config: StockConfig;
  stockCount: number;
  lastStockData?: StockData;
  sellCount: number;
  buyCount: number;
  sellActionCount: number;
  buyActionCount: number;
  saveAmount: number;
}

const COMMISSION_RATE = 0.0025;
const PERIOD: string = '7d';
const INTERVAL: Interval = '30m';
const BUY_QUANTITY = 10;
const SELL_QUANTITY = 3;
const CONSECUTIVE_HIGH_EXIT_THRESHOLD = 8;
const CONSECUTIVE_HIGH_ENTRY_THRESHOLD = 3;
const CONSECUTIVE_LOW_EXIT_THRESHOLD = 3;
const stockConfigs: { [key: string]: StockConfig } = {
  'AAPL': { symbol: 'AAPL', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'MSFT': { symbol: 'MSFT', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'AMZN': { symbol: 'AMZN', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'GOOGL': { symbol: 'GOOGL', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'NVDA': { symbol: 'NVDA', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'META': { symbol: 'META', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'TSLA': { symbol: 'TSLA', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'ORCL': { symbol: 'ORCL', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'INTC': { symbol: 'INTC', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'BABA': { symbol: 'BABA', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  // 'VMC': { symbol: 'VMC', period: PERIOD,interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
};

interface StockData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  obv: number;
}

// 메인 함수를 async 함수로 정의
async function main(config: StockConfig) {
  // const file = `${config.symbol}_${config.interval}_data.csv`;
  const file = await getData(config.symbol, {period: config.period, interval: config.interval})
  function loadCsvToJson(filePath: string): StockData[] {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        cast: true
      });
      return records as StockData[];
    } catch (error) {
      console.error('Error loading CSV:', (error as Error).message);
      return [];
    }
  }

  function extractTimeFromTimestamp(timestamp: string): string {
    return timestamp.split(' ')[1];
  }

  function isTimeInRange(time: string, startTime: string, endTime: string): boolean {
    // return true;
    return (time >= startTime && time <= '23:59:59') || (time >= '00:00:00' && time <= endTime);
  }

  const stockData = loadCsvToJson(file)
    .filter(data => isTimeInRange(
      extractTimeFromTimestamp(data.timestamp),
      '22:30:00',
      '04:40:00'
    ));

  console.log('Total records:', config.symbol, stockData.length);

  let previousStock: StockData | undefined;
  let high = 0;
  let low = 0;
  let saveAmount = 0;
  let startIndex: number | undefined = undefined;

  let stockCount = 0;
  let sellCount = 0;
  let buyCount = 0;
  let sellActionCount = 0;
  let buyActionCount = 0;
  let lastStockData: StockData | undefined;

  let consecutiveLow = 0;
  let consecutiveHigh = 0;

  for (let i = 0; i < stockData.length; i++) {
    const currentStock = stockData[i];
    lastStockData = currentStock;
    let direction = `- ${''.padStart(20)}`;

    if (previousStock) {
      const diff = currentStock.close - previousStock.close
      if (currentStock.close > previousStock.close) {
        direction = `⬆️${String(diff).padStart(20)}`;
        high++;
        low = 0;

        consecutiveHigh++;
        consecutiveLow=0;
      } else if (currentStock.close < previousStock.close) {
        direction = `🔻${String(diff).padStart(20)}`;
        low++;
        if (startIndex === undefined) {
          high = 0;
        }
        consecutiveHigh=0;
        consecutiveLow++;
      } else {
        direction = `- ${String(diff).padStart(20)}`;
        consecutiveHigh=0;
        consecutiveLow=0;
      }

      let action = '-';
      if (startIndex === undefined && high === config.consecutiveHighEntryThreshold ) {
        startIndex = i;
        console.log(`============== start!!!!`, startIndex);
        // 추매일지 아닐찌
        buyActionCount++;
        buyCount += config.buyQuantity;
        stockCount += config.buyQuantity;
        const diff = currentStock.close - stockData[startIndex].close;
        let buyPrice = config.buyQuantity * currentStock.close;
        let commission = buyPrice * config.commissionRate;
        saveAmount -= buyPrice + commission;
        action = `buy(quantity:${config.buyQuantity}, 1price:${currentStock.close}) 1diff:${diff}, commission: ${commission})`;
        // startIndex = undefined;
        // high = 0;
        low = 0;
      }

      // 계속 상승 매도
      if (high > config.consecutiveHighExitThreshold) {
        // if (startIndex !== undefined && startIndex > 0 && stockCount >0) {
        // 거래량 까지 비교
        if (startIndex !== undefined && startIndex > 0 && stockCount >0 ) {
          let stockData1 = stockData.slice(startIndex, i );
          const volumes = stockData1.map(d => d.volume);
          const maxVolume = Math.max(...volumes);
          const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

          // console.log('inde',i ,stockData.slice(startIndex, i + 1) )
          if (maxVolume < currentStock.volume) {
            sellActionCount++;
            const sellQuantity = Math.min(stockCount, config.sellQuantity);
            sellCount += sellQuantity;
            stockCount -= sellQuantity;
            const diff = currentStock.close - stockData[startIndex].close;
            let sellPrice = sellQuantity * currentStock.close;
            let commission = sellPrice * config.commissionRate;
            saveAmount += sellPrice - commission;
            action = `sell High (quantity:${sellQuantity}, 1price:${currentStock.close}, 1diff:${diff}, commission: ${commission})`;
          }
        }
        startIndex = undefined;
        high = 0;
        low = 0;
      }

      // 계속 하락 매도
      if (low === config.consecutiveLowExitThreshold) {
        if (startIndex !== undefined && startIndex > 0 && stockCount >0) {
          sellActionCount++;
          const sellQuantity = Math.min(stockCount, config.sellQuantity);
          sellCount += sellQuantity;
          stockCount -= sellQuantity;
          const diff = currentStock.close - stockData[startIndex].close;
          let sellPrice = sellQuantity * currentStock.close;
          let commission = sellPrice * config.commissionRate;
          saveAmount += sellPrice - commission;
          action = `sell Low (quantity:${sellQuantity}, 1price:${currentStock.close}, 1diff:${diff}, commission: ${commission})`;
        }
        startIndex = undefined;
        high = 0;
        low = 0;
      }
      // console.log(`i: ${String(i).padStart(3, ' ')}, t: ${currentStock.timestamp}, d:${direction}, close: ${currentStock.close}, v:${currentStock.volume}, high: ${high}, low: ${low}, startIndex: ${startIndex??'-'}, amount:${saveAmount}, action: ${action}`);
    }

    previousStock = currentStock;
  }

  // console.log(`symbol: ${config.symbol}\t: stockCount:${stockCount} (sell:(${sellCount}), buy:(${buyCount})),\tsaveAmount: ${saveAmount}`);


  return {
    config: config,
    stockCount,
    sellCount,
    buyCount,
    sellActionCount,
    buyActionCount,
    saveAmount,
    lastStockData
  } as StockResult;
}



// 메인 함수 실행
// Promise.all(Array.from(Object.entries(stockConfigs)).map(([k,v])  => main(v))).then(it => {
//   let amount = 0;
//   let valuation = 0;
//   let afterValuation = 0;
//   for (const stockResult of it) {
//     let itValuation = stockResult.stockCount * (stockResult.lastStockData?.close ??0);
//     amount += stockResult.saveAmount;
//     valuation += itValuation;
//     afterValuation += itValuation - (itValuation * stockResult.config.commissionRate);
//     console.log(`symbol: ${stockResult.config.symbol}\t: stockCount:${stockResult.stockCount}(Valuation amount: ${valuation} ${afterValuation}) (sell:(${stockResult.sellCount}), buy:(${stockResult.buyCount})),\tsaveAmount: ${stockResult.saveAmount} => a: ${amount + afterValuation}`);
//   }
//   console.log(`amount: ${amount}, afterValuation:${afterValuation}, result: ${amount + afterValuation}`);
// }).catch(console.error)


// for (let [k, v] of Array.from(Object.entries(stockConfigs))) {
//   main(v).then(it => {
//     console.log(`symbol: ${v.symbol}\t: stockCount:${it.stockCount} (sell:(${it.sellCount}), buy:(${it.buyCount})),\tsaveAmount: ${it.saveAmount}`);
//   }).catch(console.error);
// }

// main(stockConfigs['AAPL']).catch(console.error);
