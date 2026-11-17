export type MarketToken = {
  address: string;
  name: string;
  symbol: string;
  price: number;
  change1h: number;
  volume24h: number;
  marketCap: number;
  holders: number;
  liquidity?: number;
  ageHours: number;
  ageLabel: string;
  color: string;
  sparkline: number[];
};

export const mockTokens: MarketToken[] = [
  { address: "7xKXtg2CW87d97TXJSDpbD5jBkheT5Qf6HH83R8xq2Y", name: "Bonk", symbol: "BONK", price: 0.00002483, change1h: 8.42, volume24h: 84200000, marketCap: 1820000000, holders: 784210, ageHours: 7000, ageLabel: "2y 4m", color: "#f6a43b", sparkline: [9, 10, 8, 12, 11, 16, 13, 19, 17, 25, 22, 27, 24, 29, 26, 30] },
  { address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLkG8n8S5G6V", name: "dogwifhat", symbol: "WIF", price: 2.184, change1h: 5.76, volume24h: 68700000, marketCap: 2180000000, holders: 220540, ageHours: 4000, ageLabel: "1y 4m", color: "#d69a72", sparkline: [10, 13, 11, 15, 13, 17, 14, 20, 18, 19, 23, 21, 25, 22, 27, 29] },
  { address: "7GCihgDB8sNWX6sZpz6dH4VVGFbNn7u8K9YpXw2n6VJ", name: "Popcat", symbol: "POPCAT", price: 0.4182, change1h: 12.18, volume24h: 21400000, marketCap: 409000000, holders: 87420, ageHours: 25, ageLabel: "25m", color: "#e5bf74", sparkline: [8, 11, 10, 15, 12, 14, 11, 18, 15, 23, 20, 26, 22, 25, 30, 29] },
  { address: "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82", name: "BOME", symbol: "BOME", price: 0.00691, change1h: -2.35, volume24h: 18600000, marketCap: 477000000, holders: 104800, ageHours: 3000, ageLabel: "1y 1m", color: "#68a8a2", sparkline: [28, 26, 29, 23, 25, 19, 21, 17, 20, 14, 16, 12, 15, 11, 13, 9] },
  { address: "MEW1gQW9CHuQ8d2i3Hq7tJY8dGQp8bR5K2xC8nA6sV3", name: "cat in a dogs world", symbol: "MEW", price: 0.00473, change1h: 3.64, volume24h: 14200000, marketCap: 421000000, holders: 182300, ageHours: 220, ageLabel: "9h", color: "#c98e67", sparkline: [12, 14, 11, 17, 15, 18, 16, 20, 19, 24, 21, 23, 25, 22, 27, 29] },
  { address: "HhJp6aTT2awqs3K7yM5hG8nA9dFqR4bZ7sL3cV1xP6K", name: "Myro", symbol: "MYRO", price: 0.0812, change1h: -6.42, volume24h: 9800000, marketCap: 78600000, holders: 48960, ageHours: 3400, ageLabel: "1y 2m", color: "#90b67a", sparkline: [30, 27, 29, 23, 26, 21, 23, 17, 19, 15, 18, 12, 16, 11, 13, 8] },
  { address: "A8C3k2n7mV5rQ9xL4dF1sT6pH8jW2yG5bN3eK7uZ9qM", name: "Slerf", symbol: "SLERF", price: 0.147, change1h: 1.82, volume24h: 7340000, marketCap: 74100000, holders: 61240, ageHours: 240, ageLabel: "10h", color: "#76aeb1", sparkline: [13, 12, 15, 14, 17, 16, 19, 17, 20, 18, 23, 21, 24, 22, 26, 28] },
  { address: "D8f3hJ6kL2pQ9mN5vX1cR7tA4sW8yG3bE6uZ2qM5nK9", name: "Ponke", symbol: "PONKE", price: 0.286, change1h: -1.08, volume24h: 5910000, marketCap: 147000000, holders: 72180, ageHours: 3200, ageLabel: "1y 1m", color: "#d29d63", sparkline: [26, 23, 25, 21, 24, 19, 22, 18, 20, 16, 19, 17, 18, 14, 16, 13] },
  { address: "C4e8xK2mN7pR1vQ5tA9sW3yG6bD4uZ8fH2jL7nM5qP9", name: "Michi", symbol: "MICHI", price: 0.0924, change1h: 4.93, volume24h: 4520000, marketCap: 81300000, holders: 38760, ageHours: 170, ageLabel: "7h", color: "#c6a2c9", sparkline: [9, 12, 10, 14, 13, 18, 16, 21, 19, 22, 20, 26, 23, 27, 25, 30] },
  { address: "F7nQ3xL9bR2vK5mT8aW1yG4cD6uZ3pH9jM2eA7sP5kC", name: "MOTHER", symbol: "MOTHER", price: 0.0361, change1h: -3.27, volume24h: 3870000, marketCap: 36100000, holders: 24920, ageHours: 260, ageLabel: "11h", color: "#8e9cb9", sparkline: [27, 28, 24, 25, 22, 24, 19, 21, 17, 19, 14, 16, 13, 15, 11, 9] },
  { address: "G2mV8pK4xQ1nR6tA9sW3yL7bD5uZ2fH8jM4cE6qP1k", name: "Wen", symbol: "WEN", price: 0.000112, change1h: 0.72, volume24h: 2210000, marketCap: 8920000, holders: 39840, ageHours: 2800, ageLabel: "1y", color: "#83b4cb", sparkline: [14, 17, 15, 18, 17, 19, 16, 20, 18, 21, 19, 20, 22, 21, 23, 24] },
  { address: "J6kP2xN8mV4qR1tA7sW9yG3bD5uZ8fH2jL4cE6nQ7pM", name: "Billy", symbol: "BILLY", price: 0.0418, change1h: -8.16, volume24h: 1860000, marketCap: 41800000, holders: 15320, ageHours: 230, ageLabel: "9h", color: "#d4ad72", sparkline: [30, 29, 25, 27, 23, 24, 19, 22, 16, 18, 14, 16, 11, 13, 8, 7] },
];