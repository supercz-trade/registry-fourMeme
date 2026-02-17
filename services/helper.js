// services/helperFourMeme.js
// FOUR.MEME Helper3 — Bonding Price Resolver
// READY FOR ENGINE USE

import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

// ================= CONFIG =================
const RPC = (process.env.BSC_RPC);
const HELPER3 = "0xF251F83e40a78868FcfA3FA4599Dad6494E46034";

// ================= PROVIDER =================
const provider = new ethers.JsonRpcProvider(RPC);

const ABI = [
  "function getTokenInfo(address token) view returns (uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)"
];

const helper = new ethers.Contract(HELPER3, ABI, provider);

// ================= SAFE CALL =================
async function safeGetTokenInfo(tokenAddress) {
  try {
    const res = await helper.getTokenInfo(tokenAddress);
    if (!res || res.length === 0) return null;
    return res;
  } catch {
    return null;
  }
}

// ================= PUBLIC API =================
/**
 * Resolve bonding price for four.meme token via Helper3
 * @param {string} tokenAddress
 * @param {number} bnbUSD
 * @returns {object|null}
 */
export async function resolveBondingPrice(tokenAddress, bnbUSD) {
  if (!tokenAddress || !bnbUSD) return null;

  const info = await safeGetTokenInfo(tokenAddress);
  if (!info) return null;

  const priceBNB = Number(ethers.formatEther(info[3]));
  if (priceBNB <= 0) return null;

  const priceUSD = priceBNB * bnbUSD;

  return {
    source: "HELPER3",
    version: Number(info[0]),
    manager: info[1],
    creator: info[2],
    priceBNB,
    priceUSD,
    marketcapUSD: priceUSD * 1_000_000_000,
    offers: Number(info[7]),
    maxOffers: Number(info[8]),
    fundsBNB: Number(ethers.formatEther(info[9])),
    maxFundsBNB: Number(ethers.formatEther(info[10])),
    liquidityAdded: info[11]
  };
}
