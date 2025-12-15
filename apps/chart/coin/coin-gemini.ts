import { getCoinData } from './Coin';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

interface CoinConfig {
  symbol: string;
  period: string;
  commissionRate: number;
  buyQuantity: number;
  sellQuantity: number;
  rsiPeriod: number;         // RSI 기간
  oversoldThreshold: number; // 과매도 임계값
  overboughtThreshold: number; // 과매수 임계값
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
const RSI_PERIOD = 7; // RSI 계산 기간 (더 짧게 조정)
const OVERSOLD_THRESHOLD = 20; // 과매도 기준 (더 넓게 조정)
const OVERBOUGHT_THRESHOLD = 20; // 과매수 기준

const coinConfigs: { [key: string]: CoinConfig } = {
  'bitcoin': { symbol: 'bitcoin', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, rsiPeriod: RSI_PERIOD, oversoldThreshold: OVERSOLD_THRESHOLD, overboughtThreshold: OVERBOUGHT_THRESHOLD },
  'ethereum': { symbol: 'ethereum', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, rsiPeriod: RSI_PERIOD, oversoldThreshold: OVERSOLD_THRESHOLD, overboughtThreshold: OVERBOUGHT_THRESHOLD },
  'ripple': { symbol: 'ripple', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, rsiPeriod: RSI_PERIOD, oversoldThreshold: OVERSOLD_THRESHOLD, overboughtThreshold: OVERBOUGHT_THRESHOLD },
};

interface CoinData {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  obv: number;
}

// RSI 계산 함수
function calculateRSI(data: CoinData[], period: number): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
    } else {
      const diff = data[i].close - data[i - 1].close;
      gains.push(Math.max(0, diff));
      losses.push(Math.max(0, -diff));
    }

    if (i < period) {
      rsi.push(NaN); // Not enough data yet
    } else {
      let avgGain = 0;
      let avgLoss = 0;

      if (i === period) {
        avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
        avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
      } else {
        avgGain = (rsi[i - 1] * (period - 1) + gains[i]) / period;
        avgLoss = (rsi[i - 1] * (period - 1) + losses[i]) / period;
      }

      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  return rsi;
}

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

  const rsiValues = calculateRSI(coinData, config.rsiPeriod);

  let coinCount = 0;
  let saveAmount = 0;
  let sellCount = 0;
  let buyCount = 0;
  let sellActionCount = 0;
  let buyActionCount = 0;
  let lastCoinData: CoinData | undefined;

  for (let i = 1; i < coinData.length; i++) { // Start from 1 to compare with previous day
    const currentCoin = coinData[i];
    lastCoinData = currentCoin;

    const prevRsi = rsiValues[i - 1];
    const currentRsi = rsiValues[i];

    // Ensure we have enough data for RSI calculation
    if (isNaN(prevRsi) || isNaN(currentRsi)) {
      continue;
    }

    let action = '-';

    // Buy Signal: RSI crosses above oversold threshold
    if (prevRsi <= config.oversoldThreshold && currentRsi > config.oversoldThreshold) {
      if (coinCount === 0) { // Only buy if we don't hold any coins
        buyActionCount++;
        buyCount += config.buyQuantity;
        coinCount += config.buyQuantity;
        const buyPrice = config.buyQuantity * currentCoin.close;
        const commission = buyPrice * config.commissionRate;
        saveAmount -= buyPrice + commission;
        action = `BUY (RSI Cross Up) quantity:${config.buyQuantity}, price:${currentCoin.close}, commission: ${commission}`;
        console.log(`BUY ACTION: ${action}`);
      }
    }
    // Sell Signal: RSI crosses below overbought threshold
    else if (prevRsi >= config.overboughtThreshold && currentRsi < config.overboughtThreshold) {
      if (coinCount > 0) { // Only sell if we hold coins
        sellActionCount++;
        const sellQuantity = Math.min(coinCount, config.sellQuantity);
        sellCount += sellQuantity;
        coinCount -= sellQuantity;
        const sellPrice = sellQuantity * currentCoin.close;
        const commission = sellPrice * config.commissionRate;
        saveAmount += sellPrice - commission;
        action = `SELL (RSI Cross Down) quantity:${sellQuantity}, price:${currentCoin.close}, commission: ${commission}`;
        console.log(`SELL ACTION: ${action}`);
      }
    }

    console.log(`i: ${String(i).padStart(3, ' ')}, t: ${currentCoin.timestamp}, close: ${currentCoin.close.toFixed(2)}, RSI: ${currentRsi.toFixed(2)}, coinCount: ${coinCount}, saveAmount: ${saveAmount.toFixed(2)}, action: ${action}`);
  }

  return {
    config: config,
    coinCount,
    sellCount,
    buyCount,
    sellActionCount,
    buyActionCount,
    saveAmount,
    lastCoinData
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