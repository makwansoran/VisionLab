import { useEffect, useMemo, useState } from "react";
import { loadAccount, peekAccount } from "../account";
import { planById } from "../account/plans";
import { summarizeUsage } from "../account/summary";
import type { UsageEvent } from "../account/types";

const noEvents: UsageEvent[] = [];

export function useAccount() {
  const [now] = useState(Date.now);
  const [account, setAccount] = useState(peekAccount);
  const [loading, setLoading] = useState(account === null);

  useEffect(() => {
    if (account) return;
    let live = true;
    loadAccount(now).then(
      (next) => {
        if (!live) return;
        setAccount(next);
        setLoading(false);
      },
      () => {
        // Storage that cannot be read or written: the page says there is no subscription rather than loading forever.
        if (live) setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [now, account]);

  const subscription = account ? account.subscription : null;
  const events = account ? account.events : noEvents;
  const plan = subscription ? planById(subscription.planId) : null;
  const summary = useMemo(() => (plan && subscription ? summarizeUsage(events, plan, subscription, now) : null), [events, plan, subscription, now]);

  return { loading, subscription, plan, events, summary, now };
}
