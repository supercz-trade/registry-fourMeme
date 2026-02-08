// price/bnbPrice.js
import axios from "axios";

let BNB_USD = 0;
let lastUpdate = 0;

export async function getBNBPrice() {
  const now = Date.now();

  // cache 60 detik
  if (BNB_USD > 0 && now - lastUpdate < 60_000) {
    return BNB_USD;
  }

  try {
    const res = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: {
          ids: "binancecoin",
          vs_currencies: "usd"
        },
        timeout: 8000
      }
    );

    BNB_USD = Number(res.data.binancecoin.usd);
    lastUpdate = now;
    return BNB_USD;

  } catch (err) {
    console.error("[PRICE ERROR] CoinGecko failed");
    return BNB_USD; // fallback ke cache lama
  }
}
