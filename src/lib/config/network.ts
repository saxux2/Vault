export const NETWORK_CONFIG = {
  contractId:
    import.meta.env.VITE_CONTRACT_ID ??
    "CAWSR2X6Z3ZDCS34OTPHY3WHSWO7BMU56GQR427UZ2CP7Q6ZANJ4RMDX",
  marketId: 3003,
  network: "testnet",
  horizonUrl: "https://horizon-testnet.stellar.org",
  rpcUrl: "https://soroban-testnet.stellar.org",
  maxRangeWidth: 1000,
  maxMultiplier: 10,
  minStakeXlm: 5,
  treasuryAddress:
    import.meta.env.VITE_TREASURY_ADDRESS ??
    "GBVMM2SUURDY4QEZVCRVYKMZ3OZ6ORAGNRA27PFI5NVMKTWCNYHY2RDR",
} as const;
