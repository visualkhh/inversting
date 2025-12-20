import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { StockLoader } from '../stock/StockLoader';

const broadcomTicker = 'AVGO';
const samsungTicker = '005930.KS';
const intelTicker = 'INTC';
const amdTicker = 'AMD';
const micronTicker = 'MU';
const oracleTicker = 'ORCL';
const nebiusTicker = 'NBIS';
const coreWeaveTicker = 'CRWV';
const irenTicker = 'IREN';
const nvidiaTicker = 'NVDA';
const tsmcTicker = '2330.TW';
const skhynixTicker = '000660.KS';
const goldTicker = 'GOLD';
const bitUsdTicker = 'BTC-USD';
const ethereumUsdTicker = 'ETH-USD';
const xrpUsdTicker = 'XRP-USD';
// 기본 심볼 목록 (stock-diff와 동일)
// const symbols = [bitUsdTicker, ethereumUsdTicker, xrpUsdTicker];
// const symbols = [oracleTicker,nebiusTicker, coreWeaveTicker, irenTicker];
// const symbols = [broadcomTicker, samsungTicker, intelTicker, amdTicker, micronTicker, oracleTicker, nvidiaTicker, tsmcTicker, skhynixTicker, bitUsdTicker, ethereumUsdTicker, xrpUsdTicker];
const symbols = [broadcomTicker, samsungTicker, amdTicker, micronTicker, nvidiaTicker, skhynixTicker];

// 날짜 범위 (stock-diff와 동일)
const from = '2024-01-01';
const to = '2025-12-27';

async function main() {
  const loader = new StockLoader({ from, to, interval: '1d' });
  console.log(`Exporting symbols: ${symbols.join(', ')} (${from} ~ ${to})`);

  // 실제 주식 데이터 및 이벤트 가져오기 (chart + quoteSummary 모두)
  const dataMap = await loader.loadStocks(symbols);
  const allEvents = await loader.loadAllEvents(symbols);
  // allEvents.push({timestamp: '2025-09-23 23:00:00',  label: 'Micron Technology Q4'})

  const outDir = path.resolve(__dirname, 'data');
  mkdirSync(outDir, { recursive: true });

  // 티커별로 이벤트 분류
  const eventsByTicker = new Map<string, any[]>();
  symbols.forEach(ticker => {
    eventsByTicker.set(ticker, []);
  });

  // 이벤트를 티커별로 분류 (label에 티커명이 포함되어 있으면 해당 티커에 할당)
  allEvents.forEach(event => {
    // timestamp를 x (밀리초)로 변환
    const convertedEvent = {
      ...event,
      x: event.timestamp,
      timestamp: undefined // timestamp 필드 제거
    };
    
    // undefined 필드 제거
    Object.keys(convertedEvent).forEach(key => {
      // @ts-ignore
      if (convertedEvent[key] === undefined) {
        // @ts-ignore
        delete convertedEvent[key];
      }
    });
    
    let assigned = false;
    symbols.forEach(ticker => {
      // 이벤트 label에 티커명이 포함되어 있는지 확인
      if (event.label && event.label.includes(ticker)) {
        eventsByTicker.get(ticker)?.push(convertedEvent);
        assigned = true;
      }
    });
    
    // 특정 티커에 할당되지 않은 이벤트는 모든 티커에 추가
    if (!assigned) {
      symbols.forEach(ticker => {
        eventsByTicker.get(ticker)?.push(convertedEvent);
      });
    }
  });

  // 티커별로 데이터 파일 생성
  dataMap.forEach((data, ticker) => {
    const tickerPath = path.join(outDir, `${ticker}.json`);
    writeFileSync(tickerPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Saved: ${tickerPath} (${data.length} records)`);
  });

  // 티커별로 이벤트 파일 생성
  eventsByTicker.forEach((events, ticker) => {
    const eventsPath = path.join(outDir, `${ticker}_events.json`);
    writeFileSync(eventsPath, JSON.stringify(events, null, 2), 'utf-8');
    console.log(`Saved: ${eventsPath} (${events.length} events)`);
  });

  // 티커 목록 파일 생성
  const tickersPath = path.join(outDir, 'tickers.json');
  const tickers = Array.from(dataMap.keys());
  writeFileSync(tickersPath, JSON.stringify(tickers, null, 2), 'utf-8');
  console.log(`Saved: ${tickersPath} (${tickers.length} tickers)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
