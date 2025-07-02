import { writeFileSync, existsSync } from 'fs';
import { Parser } from 'json2csv';

const COIN_OHLC_API_URL = 'https://api.coingecko.com/api/v3/coins/{id}/ohlc';
const COIN_MARKET_CHART_API_URL = 'https://api.coingecko.com/api/v3/coins/{id}/market_chart/range';

// OHLCV data interface
interface CoinOHLCV {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  obv?: number;
}

export async function getCoinData(coinId: string, { period = '7d' }: { period?: string } = {}): Promise<string> {
  const days = parseInt(period.replace('d', ''), 10);
  let fileName = '';
  let combinedData: CoinOHLCV[] = [];

  try {
    if (days <= 3) { // Use /ohlc API for 3 days or less
      let intervalLabel = '';
      if (days === 1) intervalLabel = '30m'; // 1일은 30분 간격
      else if (days === 3) intervalLabel = '4h'; // 3일은 4시간 간격
      fileName = `${coinId}_${period}_${intervalLabel}_ohlc_data.csv`;

      if (existsSync(fileName)) {
        return fileName;
      }

      const searchParameter = new URLSearchParams({
        vs_currency: 'usd',
        days: String(days),
      });

      const response = await fetch(`${COIN_OHLC_API_URL.replace('{id}', coinId)}?${searchParameter.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      combinedData = data.map((ohlc: number[]) => {
        return {
          timestamp: new Date(ohlc[0]).toISOString(),
          open: ohlc[1],
          high: ohlc[2],
          low: ohlc[3],
          close: ohlc[4],
          volume: 0, // OHLC API는 볼륨을 제공하지 않음
          obv: 0,     // OBV 계산을 위해 볼륨이 필요하므로 0으로 설정
        };
      });

    } else { // Use /market_chart/range API for more than 3 days
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - days * 24 * 60 * 60; // Calculate start time based on period

      fileName = `${coinId}_${period}_hourly_market_data.csv`; // Renamed for clarity
      if (existsSync(fileName)) {
        return fileName;
      }

      const searchParameter = new URLSearchParams({
        vs_currency: 'usd',
        from: String(startTime),
        to: String(endTime),
      });

      const response = await fetch(`${COIN_MARKET_CHART_API_URL.replace('{id}', coinId)}?${searchParameter.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      const volumeMap = new Map<number, number>(data.total_volumes.map(([timestamp, volume]: [number, number]) => [timestamp, volume]));

      combinedData = data.prices.map(([timestamp, price]: [number, number]) => {
        return {
          timestamp: new Date(timestamp).toISOString(),
          open: price,
          high: price,
          low: price,
          close: price,
          volume: volumeMap.get(timestamp) || 0,
        };
      });

      // Calculate OBV for market_chart/range data
      let obv = 0;
      for (let i = 0; i < combinedData.length; i++) {
        if (i === 0) {
          combinedData[i].obv = 0;
        } else {
          const prevClose = combinedData[i - 1].close;
          const currentClose = combinedData[i].close;
          const sign = currentClose > prevClose ? 1 : currentClose < prevClose ? -1 : 0;
          obv += sign * combinedData[i].volume;
          combinedData[i].obv = obv;
        }
      }
    }

    // Save to CSV
    const fields = ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'obv'];
    const parser = new Parser({ fields });
    const csv = parser.parse(combinedData);

    writeFileSync(fileName, csv);
    console.log(`${fileName} saved successfully.`);
    return fileName;

  } catch (error) {
    console.error(`Error fetching coin data for ${coinId}:`, error);
    throw error;
  }
}
