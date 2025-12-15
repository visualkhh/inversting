import { getCoinData } from './Coin';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';

interface CoinConfig {
  symbol: string;
  period: string;
  commissionRate: number;
  buyQuantity: number;
  sellQuantity: number;
  consecutiveHighEntryThreshold: number;
  consecutiveHighExitThreshold: number;
  consecutiveLowExitThreshold: number;
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
const PERIOD: string = '1d';
const BUY_QUANTITY = 1;
const SELL_QUANTITY = 1;
const CONSECUTIVE_HIGH_EXIT_THRESHOLD = 8;
const CONSECUTIVE_HIGH_ENTRY_THRESHOLD = 5;
const CONSECUTIVE_LOW_EXIT_THRESHOLD = 3;

const coinConfigs: { [key: string]: CoinConfig } = {
  'bitcoin': { symbol: 'bitcoin', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  'ethereum': { symbol: 'ethereum', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
  'ripple': { symbol: 'ripple', period: PERIOD, commissionRate: COMMISSION_RATE, buyQuantity: BUY_QUANTITY, sellQuantity: SELL_QUANTITY, consecutiveHighEntryThreshold: CONSECUTIVE_HIGH_ENTRY_THRESHOLD, consecutiveHighExitThreshold: CONSECUTIVE_HIGH_EXIT_THRESHOLD, consecutiveLowExitThreshold: CONSECUTIVE_LOW_EXIT_THRESHOLD },
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

  let previousCoin: CoinData | undefined;
  let high = 0;
  let low = 0;
  let saveAmount = 0;
  let startIndex: number | undefined = undefined;

  let coinCount = 0;
  let sellCount = 0;
  let buyCount = 0;
  let sellActionCount = 0;
  let buyActionCount = 0;
  let lastCoinData: CoinData | undefined;

  for (let i = 0; i < coinData.length; i++) {
    const currentCoin = coinData[i];
    lastCoinData = currentCoin;
    let direction = `- ${ ''.padStart(20)}`;

    if (previousCoin) {
      const diff = currentCoin.close - previousCoin.close;
      if (currentCoin.close > previousCoin.close) {
        direction = `⬆️${String(diff).padStart(20)}`;
        high++;
        low = 0;
      } else if (currentCoin.close < previousCoin.close) {
        direction = `🔻${String(diff).padStart(20)}`;
        low++;
        if (startIndex === undefined) {
          high = 0;
        }
      } else {
        direction = `- ${String(diff).padStart(20)}`;
      }

      let action = '-';
      if (startIndex === undefined && high === config.consecutiveHighEntryThreshold) {
        startIndex = i;
        buyActionCount++;
        buyCount += config.buyQuantity;
        coinCount += config.buyQuantity;
        const buyPrice = config.buyQuantity * currentCoin.close;
        const commission = buyPrice * config.commissionRate;
        saveAmount -= buyPrice + commission;
        action = `buy(quantity:${config.buyQuantity}, price:${currentCoin.close}, commission: ${commission})`;
        console.log(`BUY ACTION: ${action}`);
        low = 0;
      }

      if (high > config.consecutiveHighExitThreshold) {
        if (startIndex !== undefined && startIndex > 0 && coinCount > 0) {
          if (true) { // Always sell when high > consecutiveHighExitThreshold (volume logic removed)
            sellActionCount++;
            const sellQuantity = Math.min(coinCount, config.sellQuantity);
            sellCount += sellQuantity;
            coinCount -= sellQuantity;
            const sellPrice = sellQuantity * currentCoin.close;
            const commission = sellPrice * config.commissionRate;
            saveAmount += sellPrice - commission;
            action = `sell High (quantity:${sellQuantity}, price:${currentCoin.close}, commission: ${commission})`;
            console.log(`SELL ACTION (HIGH): ${action}`);
          }
        }
        startIndex = undefined;
        high = 0;
        low = 0;
      }

      if (low === config.consecutiveLowExitThreshold) {
        if (startIndex !== undefined && startIndex > 0 && coinCount > 0) {
          sellActionCount++;
          const sellQuantity = Math.min(coinCount, config.sellQuantity);
          sellCount += sellQuantity;
          coinCount -= sellQuantity;
          const sellPrice = sellQuantity * currentCoin.close;
          const commission = sellPrice * config.commissionRate;
          saveAmount += sellPrice - commission;
          action = `sell Low (quantity:${sellQuantity}, price:${currentCoin.close}, commission: ${commission})`;
          console.log(`SELL ACTION (LOW): ${action}`);
        }
        startIndex = undefined;
        high = 0;
        low = 0;
      }
    console.log(`i: ${String(i).padStart(3, ' ')}, t: ${currentCoin.timestamp}, d:${direction}, close: ${currentCoin.close}, v:${currentCoin.volume}, high: ${high}, low: ${low}, startIndex: ${startIndex??'-'}, amount:${saveAmount}, action: ${action}`);
    }

    previousCoin = currentCoin;
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
    console.log(`symbol: ${coinResult.config.symbol}\t: coinCount:${coinResult.coinCount}(Valuation amount: ${valuation} ${afterValuation}) (sell:(${coinResult.sellCount}), buy:(${coinResult.buyCount})),\tsaveAmount: ${coinResult.saveAmount} => a: ${amount + afterValuation}`);
  }
  console.log(`amount: ${amount}, afterValuation:${afterValuation}, result: ${amount + afterValuation}`);
}).catch(console.error);
