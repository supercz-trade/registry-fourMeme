// monitoring/detectSell.js
// FINAL ENGINE — deterministic sell detection

import { ethers } from "ethers";
import { resolveBondingPrice } from "../services/helper.js";
import { getPairPriceUSD } from "../price/pairPriceCache.js";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const TOKEN_DECIMALS = 18;
const TOTAL_SUPPLY = 1_000_000_000;

const PAIR_WHITELIST = {
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": { symbol: "USD1", decimals: 18, stable: true },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18, stable: true },
  "0x8965349fb649a33a30cbfda057d8ec2c48abe2a2": { symbol: "USDC", decimals: 18, stable: true },
  "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82": { symbol: "CAKE", decimals: 18, stable: false },
  "0x000ae314e2a2172a039b26378814c252734f556a": { symbol: "ASTER", decimals: 18, stable: false }
};

function addrFromTopic(topic) {
  return "0x" + topic.slice(26);
}

function detectExecutedReceive(receipt, managerAddr) {
  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const meta = PAIR_WHITELIST[log.address.toLowerCase()];
    if (!meta) continue;

    const from = addrFromTopic(log.topics[1]).toLowerCase();
    if (from !== managerAddr) continue;

    const amount = Number(
      ethers.formatUnits(BigInt(log.data), meta.decimals)
    );

    if (amount <= 0) continue;

    const usd = meta.stable
      ? amount
      : amount * (getPairPriceUSD(meta.symbol) || 0);

    return {
      receiveAmount: amount,
      receiveUSD: usd,
      receiveSymbol: meta.symbol,
      receiveType: "EXECUTED"
    };
  }

  return null;
}

export async function detectSell({
  tx,
  receipt,
  manager,
  creator,
  blockTime,
  bnbUSD
}) {
  const events = [];
  if (!tx || !receipt || !manager) return events;

  const managerAddr = manager.toLowerCase();
  const creatorAddr = creator?.toLowerCase() ?? null;

  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC) continue;

    const tokenAddr = log.address.toLowerCase();
    if (PAIR_WHITELIST[tokenAddr]) continue;

    const from = addrFromTopic(log.topics[1]).toLowerCase();
    const to = addrFromTopic(log.topics[2]).toLowerCase();

    if (to !== managerAddr) continue;

    const tokenAmount = Number(
      ethers.formatUnits(BigInt(log.data), TOKEN_DECIMALS)
    );
    if (tokenAmount <= 0) continue;

    let receive = detectExecutedReceive(receipt, managerAddr);

    let priceUSD;
    let marketcapUSD;

    if (!receive) {
      const helper = await resolveBondingPrice(tokenAddr, bnbUSD);
      if (!helper || !helper.priceUSD) continue;

      priceUSD = helper.priceUSD;
      marketcapUSD = helper.marketcapUSD;

      const receiveUSD = priceUSD * tokenAmount;

      receive = {
        receiveAmount: receiveUSD / bnbUSD,
        receiveUSD,
        receiveSymbol: "BNB",
        receiveType: "STATE_INFERRED"
      };
    } else {
      priceUSD = receive.receiveUSD / tokenAmount;
      marketcapUSD = priceUSD * TOTAL_SUPPLY;
    }

    events.push({
      type: "TRADE",
      side: "SELL",
      txHash: tx.hash,
      tokenAddress: tokenAddr,
      wallet: from,
      isDev: creatorAddr ? from === creatorAddr : false,
      tokenAmount,
      spendAmount: receive.receiveAmount,
      spendSymbol: receive.receiveSymbol,
      spendUSD: receive.receiveUSD,
      priceUSD,
      marketcapAtTxUSD: marketcapUSD,
      time: blockTime
    });
  }

  return events;
}
