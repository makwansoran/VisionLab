import type { ReactNode } from "react";
import { PLANS } from "../account/plans";
import type { UsageSummary } from "../account/summary";
import { FEATURE_NAMES, STATUS_NAMES } from "../account/types";
import type { Plan, Subscription } from "../account/types";
import { useAccount } from "../hooks/useAccount";

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function AccountSettings() {
  const { loading, subscription, plan, summary, now } = useAccount();
  const account = !loading && subscription && plan && summary ? { subscription, plan, summary } : null;
  const missing = loading ? "Loading" : "No subscription";
  const empty = <p className="settings-empty">{loading ? "Loading your account." : "You have no subscription."}</p>;

  return (
    <>
      <Fold
        title="Plan"
        line={account ? `${account.plan.name} · ${STATUS_NAMES[account.subscription.status]} · ${renewalText(account.subscription, account.summary.period.to, now)}` : missing}
      >
        {account ? <PlanRows plan={account.plan} subscription={account.subscription} renewsAt={account.summary.period.to} /> : empty}
      </Fold>
      <Fold title="Usage" line={account ? `${account.summary.left.toLocaleString("en-GB")} tokens left this month` : missing}>
        {account ? <UsageRows summary={account.summary} subscription={account.subscription} now={now} /> : empty}
      </Fold>
    </>
  );
}

function Fold({ title, line, children }: { title: string; line: string; children: ReactNode }) {
  return (
    <details className="settings-group settings-fold">
      <summary>
        <h2>{title}</h2>
        <span>{line}</span>
        <IconChevron />
      </summary>
      <div className="settings-card">{children}</div>
    </details>
  );
}

function PlanRows({ plan, subscription, renewsAt }: { plan: Plan; subscription: Subscription; renewsAt: number }) {
  const warn = subscription.status === "past_due" || subscription.status === "canceled";
  const others = PLANS.filter((item) => item.id !== plan.id)
    .map((item) => `${item.name} ${item.price.toLocaleString("en-GB")} kr a month with ${item.monthlyTokens.toLocaleString("en-GB")} tokens`)
    .join(" · ");

  return (
    <>
      <Row title="Plan" detail={`${plan.price.toLocaleString("en-GB")} kr a month · ${plan.monthlyTokens.toLocaleString("en-GB")} tokens`}>
        <span className="settings-value">{plan.name}</span>
      </Row>
      <Row title="Status" detail={`Since ${dayMonthYear.format(Date.parse(subscription.startedAt))}`}>
        <span className={warn ? "settings-value account-warn" : "settings-value"}>{STATUS_NAMES[subscription.status]}</span>
      </Row>
      <Row
        title={subscription.status === "canceled" ? "Ends" : subscription.status === "trial" ? "Trial ends" : "Renews"}
        detail={subscription.status === "canceled" ? "The plan stops on this date" : "Tokens start over on this date"}
      >
        <span className="settings-value">{dayMonthYear.format(renewsAt)}</span>
      </Row>
      <Row title="Included" detail={plan.features.join(" · ")} />
      <Row title="Other plans" detail={`${others}. To change plan, contact Spectr.`} />
    </>
  );
}

function UsageRows({ summary, subscription, now }: { summary: UsageSummary; subscription: Subscription; now: number }) {
  const renewal = renewalText(subscription, summary.period.to, now);
  const max = Math.max(0, ...summary.perDay.map((day) => day.tokens));
  const peak = summary.perDay.findIndex((day) => day.tokens === max);

  return (
    <>
      <Row title="Tokens left this month" detail={summary.share >= 1 ? `Limit reached · ${renewal}` : `${summary.limit.toLocaleString("en-GB")} a month · ${renewal}`}>
        <span className="settings-value settings-value-big">{summary.left.toLocaleString("en-GB")}</span>
      </Row>
      <div className="settings-block">
        <div
          className="account-meter"
          role="meter"
          aria-label="Tokens used"
          aria-valuemin={0}
          aria-valuemax={summary.limit}
          aria-valuenow={Math.min(summary.used, summary.limit)}
        >
          <div
            className={summary.share >= 0.9 ? "account-meter-fill is-high" : "account-meter-fill"}
            style={{ width: `${Math.min(summary.share, 1) * 100}%` }}
          />
        </div>
      </div>
      <Row title="Last 30 days" detail={max === 0 ? "No tokens used yet." : "Tokens a day"} />
      {max > 0 ? (
        <div className="settings-block">
          <div className="account-bars">
            {summary.perDay.map((day, index) => (
              <div key={day.from} className="account-bar-col" title={`${dayMonth.format(day.from)} · ${day.tokens.toLocaleString("en-GB")} tokens`}>
                {index === peak && <span className="account-bar-value">{day.tokens.toLocaleString("en-GB")}</span>}
                <div className="account-bar" style={{ height: `${(day.tokens / max) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="account-bar-days" aria-hidden="true">
            {summary.perDay.map((day, index) => (
              <span key={day.from}>{(summary.perDay.length - 1 - index) % 5 === 0 ? dayMonth.format(day.from) : ""}</span>
            ))}
          </div>
        </div>
      ) : null}
      <Row title="By feature this month" detail="Share of the tokens used so far" />
      <div className="settings-block">
        <table className="account-table">
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Tokens</th>
              <th scope="col">Share</th>
              <th scope="col">Cost</th>
            </tr>
          </thead>
          <tbody>
            {summary.perFeature.map((item) => (
              <tr key={item.feature}>
                <td>{FEATURE_NAMES[item.feature]}</td>
                <td>{item.tokens.toLocaleString("en-GB")}</td>
                <td>{Math.round(item.share * 100)}%</td>
                <td>{costText(item.cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>{summary.used.toLocaleString("en-GB")}</td>
              <td />
              <td>{costText(summary.cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function Row({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className="settings-row">
      <div>
        <p>{title}</p>
        {detail ? <p>{detail}</p> : null}
      </div>
      {children ? <div className="settings-control">{children}</div> : null}
    </div>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function costText(cost: number) {
  return `${cost.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

function renewalText(subscription: Subscription, to: number, now: number) {
  const date = dayMonth.format(to);
  if (subscription.status === "canceled") return `${to <= now ? "ended" : "ends"} ${date}`;
  if (subscription.status === "trial") return `trial ends ${date}`;
  return `renews ${date}`;
}
