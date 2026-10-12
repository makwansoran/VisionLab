export type UsageFeature = "labeling" | "training" | "inference" | "assistant";

export const USAGE_FEATURES: readonly UsageFeature[] = ["labeling", "training", "inference", "assistant"];

export const FEATURE_NAMES: Record<UsageFeature, string> = {
  labeling: "Labeling",
  training: "Training",
  inference: "Inference",
  assistant: "Assistant",
};

export type UsageEvent = {
  id: string;
  at: string;
  feature: UsageFeature;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
};

export type PlanId = "starter" | "pro" | "max";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  monthlyTokens: number;
  features: string[];
};

export type SubscriptionStatus = "trial" | "active" | "past_due" | "canceled";

export const STATUS_NAMES: Record<SubscriptionStatus, string> = {
  trial: "Trial",
  active: "Active",
  past_due: "Payment due",
  canceled: "Canceled",
};

export type Subscription = {
  planId: PlanId;
  startedAt: string;
  renewsAt: string;
  status: SubscriptionStatus;
};
