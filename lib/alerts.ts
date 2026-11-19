export const alertConditions = ["price_above", "price_below", "liquidity_below", "volume_above", "risk_below"] as const;
export type AlertCondition = typeof alertConditions[number];
export type AlertChannels = { push?: boolean; telegram?: boolean; discord?: boolean; email?: boolean };
export type AlertDestination = { pushSubscription?: PushSubscriptionJSON; telegramChatId?: string; discordWebhook?: string; email?: string };
export type WalletAlert = { id: string; wallet_address: string; token_address: string; condition_type: AlertCondition; target_value: number; channels: AlertChannels; active: boolean; last_observed_value: number | null; last_triggered_at: string | null; created_at: string };

export function conditionLabel(condition: AlertCondition) {
  return ({ price_above: "Price rises above", price_below: "Price falls below", liquidity_below: "Liquidity falls below", volume_above: "24h volume rises above", risk_below: "RugCheck score falls below" } as Record<AlertCondition, string>)[condition];
}
