import type { Plan, PlanId } from "./types";

export const PLANS: readonly Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 490,
    monthlyTokens: 250_000,
    features: ["1 camera", "Argus 1.0", "Labeling assist", "Email support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 1490,
    monthlyTokens: 2_000_000,
    features: ["5 cameras", "Argus 1.0 and updates", "Labeling and training assist", "Priority support"],
  },
  {
    id: "max",
    name: "Max",
    price: 4990,
    monthlyTokens: 10_000_000,
    features: ["Unlimited cameras", "Every Argus model", "Everything in Pro", "Dedicated support and on-site help"],
  },
];

export function planById(id: PlanId): Plan {
  // A record with a plan we no longer know must not take the page down with it.
  return PLANS.find((plan) => plan.id === id) ?? PLANS[0];
}

// NOK per 1000 tokens.
export const MODEL_PRICES: Record<string, { tokensIn: number; tokensOut: number }> = {
  "Argus 1.0": { tokensIn: 0.02, tokensOut: 0.06 },
};

export function costOf(model: string, tokensIn: number, tokensOut: number): number {
  const price = MODEL_PRICES[model] ?? MODEL_PRICES["Argus 1.0"];
  const cost = (tokensIn * price.tokensIn + tokensOut * price.tokensOut) / 1000;
  return Math.round(cost * 10_000) / 10_000;
}
