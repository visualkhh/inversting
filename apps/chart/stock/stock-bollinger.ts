import { getData, Interval } from './Stock';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { Chart, ChartData, TradePoint} from '../chart/Chart';

interface StockConfig {
  symbol: string;
  period: string;
  interval: Interval;
  commissionRate: number;
  buyQuantity: number;
  sellQuantity: number;
  bbPeriod: number;         // 볼린저 밴드 기간 (SMA 및 표준편차 계산용)
  stdDevMultiplier: number; // 표준편차 배수 (일반적으로 2)
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
const BUY_QUANTITY = 100;
const SELL_QUANTITY = 100;
const BB_PERIOD = 20;         // 볼린저 밴드 기간 (일반적으로 20)
const STD_DEV_MULTIPLIER = 2; // 표준편차 배수 (일반적으로 2)

const stockConfigs: { [key: string]: StockConfig } = {
  'AAPL': { symbol: 'AAPL', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'MSFT': { symbol: 'MSFT', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'AMZN': { symbol: 'AMZN', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'GOOGL': { symbol: 'GOOGL', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'NVDA': { symbol: 'NVDA', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'META': { symbol: 'META', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'TSLA': { symbol: 'TSLA', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'ORCL': { symbol: 'ORCL', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'INTC': { symbol: 'INTC', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'BABA': { symbol: 'BABA', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'VMC': { symbol: 'VMC', period: PERIOD, interval: INTERVAL, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
};

interface StockData extends ChartData {}

async function main(config: StockConfig) {
  const file = await getData(config.symbol, { period: config.period, interval: config.interval });

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

  const stockData = loadCsvToJson(file);

  console.log('Total records:', config.symbol, stockData.length);

  const middleBand = Chart.calculateSMA(stockData, config.bbPeriod);
  const stdDev = Chart.calculateStandardDeviation(stockData, config.bbPeriod, middleBand);

  const bollingerChart = new Chart(config.symbol);

  let stockCount = 0;
  let saveAmount = 0;
  let sellCount = 0;
  let buyCount = 0;
  let sellActionCount = 0;
  let buyActionCount = 0;
  const tradePoints: TradePoint[] = [];

  // 매수/매도 시점 표시
  for (let i = 0; i < stockData.length; i++) {
    const currentStock = stockData[i];
    const currentMiddleBand = middleBand[i];
    const currentStdDev = stdDev[i];

    if (isNaN(currentMiddleBand) || isNaN(currentStdDev)) {
      continue;
    }

    const upperBand = currentMiddleBand + (currentStdDev * config.stdDevMultiplier);
    const lowerBand = currentMiddleBand - (currentStdDev * config.stdDevMultiplier);

    let action = '-';

    // 매수 신호: 가격이 하단 밴드를 터치하거나 아래로 돌파할 때
    if (currentStock.close <= lowerBand) {
      if (stockCount === 0) { // 주식을 보유하고 있지 않을 때만 매수
        buyActionCount++;
        buyCount += config.buyQuantity;
        stockCount += config.buyQuantity;
        const buyPrice = config.buyQuantity * currentStock.close;
        const commission = buyPrice * config.commissionRate;
        saveAmount -= buyPrice + commission;
        action = `BUY (Bollinger Lower Band Touch/Break) quantity:${config.buyQuantity}, price:${currentStock.close}, commission: ${commission}`;
        console.log(`BUY ACTION: ${action}`);
        tradePoints.push({ timestamp: currentStock.timestamp, type: 'buy', price: currentStock.close });
      }
    }
    // 매도 신호: 가격이 상단 밴드를 터치하거나 위로 돌파할 때
    else if (currentStock.close >= upperBand) {
      if (stockCount > 0) { // 주식을 보유하고 있을 때만 매도
        sellActionCount++;
        const sellQuantity = Math.min(stockCount, config.sellQuantity);
        sellCount += sellQuantity;
        stockCount -= sellQuantity;
        const sellPrice = sellQuantity * currentStock.close;
        const commission = sellPrice * config.commissionRate;
        saveAmount += sellPrice - commission;
        action = `SELL (Bollinger Upper Band Touch/Break) quantity:${sellQuantity}, price:${currentStock.close}, commission: ${commission}`;
        console.log(`SELL ACTION: ${action}`);
        tradePoints.push({ timestamp: currentStock.timestamp, type: 'sell', price: currentStock.close });
      }
    }

    console.log(`i: ${String(i).padStart(3, ' ')}, t: ${currentStock.timestamp}, close: ${currentStock.close.toFixed(2)}, MiddleBand: ${currentMiddleBand.toFixed(2)}, UpperBand: ${upperBand.toFixed(2)}, LowerBand: ${lowerBand.toFixed(2)}, stockCount: ${stockCount}, saveAmount: ${saveAmount.toFixed(2)}, action: ${action}`);
  }

  bollingerChart.drawBollingerBandChart(stockData, middleBand, stdDev, config.stdDevMultiplier, tradePoints);

  const candlestickChart = new Chart(config.symbol);
  candlestickChart.drawCandlestickChart(stockData);

  return {
    config: config,
    stockCount,
    sellCount,
    buyCount,
    sellActionCount,
    buyActionCount,
    saveAmount,
    lastStockData: stockData[stockData.length - 1]
  } as StockResult;
}

Promise.all(Array.from(Object.entries(stockConfigs)).map(([k,v]) => main(v))).then(it => {
  let amount = 0;
  let valuation = 0;
  let afterValuation = 0;
  for (const stockResult of it) {
    let itValuation = stockResult.stockCount * (stockResult.lastStockData?.close ?? 0);
    amount += stockResult.saveAmount;
    valuation += itValuation;
    afterValuation += itValuation - (itValuation * stockResult.config.commissionRate);
    console.log(`symbol: ${stockResult.config.symbol}	: stockCount:${stockResult.stockCount}(Valuation amount: ${valuation.toFixed(2)} ${afterValuation.toFixed(2)}) (sell:(${stockResult.sellCount}), buy:(${stockResult.buyCount})),	saveAmount: ${stockResult.saveAmount.toFixed(2)} => a: ${(amount + afterValuation).toFixed(2)}`);
  }
  console.log(`Final Result: amount: ${amount.toFixed(2)}, afterValuation:${afterValuation.toFixed(2)}, total: ${(amount + afterValuation).toFixed(2)}`);
}).catch(console.error);
