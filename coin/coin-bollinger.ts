import { getCoinData } from './Coin';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { Chart, ChartData, TradePoint } from '../chart/Chart';

interface CoinConfig {
  symbol: string;
  period: string;
  commissionRate: number;
  buyQuantity: number;
  sellQuantity: number;
  bbPeriod: number;         // 볼린저 밴드 기간 (SMA 및 표준편차 계산용)
  stdDevMultiplier: number; // 표준편차 배수 (일반적으로 2)
}

interface CoinResult {
  config: CoinConfig;
  coinCount: number;
  lastCoinData?: CoinData;
  sellCount: number;
  buyCount: number;
  sellActionCount: number;
  buyActionCount: number;
  saveAmount: number;
}

const COMMISSION_RATE = 0.0025;
const PERIOD: string = '7d'; // 7일치 데이터 (1시간 단위)
const BUY_QUANTITY = 1;
const SELL_QUANTITY = 1;
const BB_PERIOD = 20;         // 볼린저 밴드 기간 (일반적으로 20)
const STD_DEV_MULTIPLIER = 2; // 표준편차 배수 (일반적으로 2)

const coinConfigs: { [key: string]: CoinConfig } = {
  'bitcoin': { symbol: 'bitcoin', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'ethereum': { symbol: 'ethereum', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
  'ripple': { symbol: 'ripple', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, bbPeriod: BB_PERIOD, stdDevMultiplier: STD_DEV_MULTIPLIER },
};

interface CoinData extends ChartData {}

async function main(config: CoinConfig) {
  const file = await getCoinData(config.symbol, { period: config.period });

  function loadCsvToJson(filePath: string): CoinData[] {
    try {
      const fileContent = readFileSync(filePath, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        cast: true
      });
      return records as CoinData[];
    } catch (error) {
      console.error('Error loading CSV:', (error as Error).message);
      return [];
    }
  }

  const coinData = loadCsvToJson(file);

  console.log('Total records:', config.symbol, coinData.length);

  const middleBand = Chart.calculateSMA(coinData, config.bbPeriod);
  const stdDev = Chart.calculateStandardDeviation(coinData, config.bbPeriod, middleBand);

  const bollingerChart = new Chart(config.symbol);

  let coinCount = 0;
  let saveAmount = 0;
  let sellCount = 0;
  let buyCount = 0;
  let sellActionCount = 0;
  let buyActionCount = 0;
  const tradePoints: TradePoint[] = [];

  // 매수/매도 시점 표시
  for (let i = 0; i < coinData.length; i++) {
    const currentCoin = coinData[i];

    const currentMiddleBand = middleBand[i];
    const currentStdDev = stdDev[i];

    if (isNaN(currentMiddleBand) || isNaN(currentStdDev)) {
      continue;
    }

    const upperBand = currentMiddleBand + (currentStdDev * config.stdDevMultiplier);
    const lowerBand = currentMiddleBand - (currentStdDev * config.stdDevMultiplier);

    let action = '-';

    // 매수 신호: 가격이 하단 밴드를 터치하거나 아래로 돌파할 때
    if (currentCoin.close <= lowerBand) {
      if (coinCount === 0) { // 코인을 보유하고 있지 않을 때만 매수
        buyActionCount++;
        buyCount += config.buyQuantity;
        coinCount += config.buyQuantity;
        const buyPrice = config.buyQuantity * currentCoin.close;
        const commission = buyPrice * config.commissionRate;
        saveAmount -= buyPrice + commission;
        action = `BUY (Bollinger Lower Band Touch/Break) quantity:${config.buyQuantity}, price:${currentCoin.close}, commission: ${commission}`;
        console.log(`BUY ACTION: ${action}`);
        tradePoints.push({ timestamp: currentCoin.timestamp, type: 'buy', price: currentCoin.close });
      }
    }
    // 매도 신호: 가격이 상단 밴드를 터치하거나 위로 돌파할 때
    else if (currentCoin.close >= upperBand) {
      if (coinCount > 0) { // 코인을 보유하고 있을 때만 매도
        sellActionCount++;
        const sellQuantity = Math.min(coinCount, config.sellQuantity);
        sellCount += sellQuantity;
        coinCount -= sellQuantity;
        const sellPrice = sellQuantity * currentCoin.close;
        const commission = sellPrice * config.commissionRate;
        saveAmount += sellPrice - commission;
        action = `SELL (Bollinger Upper Band Touch/Break) quantity:${sellQuantity}, price:${currentCoin.close}, commission: ${commission}`;
        console.log(`SELL ACTION: ${action}`);
        tradePoints.push({ timestamp: currentCoin.timestamp, type: 'sell', price: currentCoin.close });
      }
    }

    console.log(`i: ${String(i).padStart(3, ' ')}, t: ${currentCoin.timestamp}, close: ${currentCoin.close.toFixed(2)}, MiddleBand: ${currentMiddleBand.toFixed(2)}, UpperBand: ${upperBand.toFixed(2)}, LowerBand: ${lowerBand.toFixed(2)}, coinCount: ${coinCount}, saveAmount: ${saveAmount.toFixed(2)}, action: ${action}`);
  }

  bollingerChart.drawBollingerBandChart(coinData, middleBand, stdDev, config.stdDevMultiplier, tradePoints);

  const candlestickChart = new Chart(config.symbol);
  candlestickChart.drawCandlestickChart(coinData);

  return {
    config: config,
    coinCount,
    sellCount,
    buyCount,
    sellActionCount,
    buyActionCount,
    saveAmount,
    lastCoinData: coinData[coinData.length - 1]
  } as CoinResult;
}

Promise.all(Array.from(Object.entries(coinConfigs)).map(([k,v]) => main(v))).then(it => {
  let amount = 0;
  let valuation = 0;
  let afterValuation = 0;
  for (const coinResult of it) {
    let itValuation = coinResult.coinCount * (coinResult.lastCoinData?.close ?? 0);
    amount += coinResult.saveAmount;
    valuation += itValuation;
    afterValuation += itValuation - (itValuation * coinResult.config.commissionRate);
    console.log(`symbol: ${coinResult.config.symbol}	: coinCount:${coinResult.coinCount}(Valuation amount: ${valuation.toFixed(2)} ${afterValuation.toFixed(2)}) (sell:(${coinResult.sellCount}), buy:(${coinResult.buyCount})),	saveAmount: ${coinResult.saveAmount.toFixed(2)} => a: ${(amount + afterValuation).toFixed(2)}`);
  }
  console.log(`Final Result: amount: ${amount.toFixed(2)}, afterValuation:${afterValuation.toFixed(2)}, total: ${(amount + afterValuation).toFixed(2)}`);
}).catch(console.error);
