# Beta Metrics Implementation Priority

This document groups the required analytics metrics into implementation tiers (P0, P1, and P2) to help guide development of the `admin.kovari.in` dashboard.

---

## Tiers Breakdown

### 🚨 P0 — Must Ship for Closed Beta
These metrics are essential for immediate go/no-go decisions regarding the product's viability and directly address the bottleneck found in the June 23 audit.

* **Total Users & Activated Users**
  - *Justification*: Required to verify waitlist conversion and track absolute sign-up growth.
* **Returned Users & Retention %**
  - *Justification*: Directly tracks the core product hypothesis bottleneck (users sign up once but do not return to the app).
* **Interests Sent & Pending Interests**
  - *Justification*: Measures match creation intent and tracks the size of unanswered requests, which is the current matching loop bottleneck.
* **Accepted Interests**
  - *Justification*: Counts the absolute number of successful matching loops completed.
* **Push No Token (`push_status = no_token`)**
  - *Justification*: Monitors the major delivery leak identified in the audit where users are registered but cannot receive push alerts.
* **Conversations & Messages**
  - *Justification*: Measures the final conversion state of the app; without chats, matches are considered dead.

---

### 📈 P1 — Important Next Layer
These metrics provide necessary detail for optimization and tracking user behavior trends once the core activation problem is resolved.

* **Daily Active Users (DAU) & Weekly Active Users (WAU)**
  - *Justification*: Measures engagement density over time, helping to separate recurring usage from one-off signups.
* **Dormant Users**
  - *Justification*: Critical for tracking churn and identifying users who require re-engagement push notifications or email outreach.
* **Acceptance Rate**
  - *Justification*: Helps assess the compatibility engine's performance (how likely a user is to accept a suggested match).
* **Notification Read Rate**
  - *Justification*: Evaluates whether user attention is successfully captured when push notifications do manage to deliver.
* **Return Rate Trends**
  - *Justification*: Evaluates engagement behavior shifts over time, indicating if updates improve overall app stickiness.

---

### 🔮 P2 — Future Analytics
Advanced analytics that are valuable for scaling the app but are not required during the initial closed beta launch phase.

* **Cohort Analysis & Retention Curves**
  - *Justification*: Necessary for comparing different marketing batches or feature versions, but requires a larger user volume than the current beta.
* **Time-Series Funnel Charts**
  - *Justification*: Visualizes micro-step dropoff trends over time, which is useful once thousands of users are progressing through onboarding.
* **Advanced Behavioral Analytics**
  - *Justification*: Details click maps, session durations, and user explore scroll-depth, which are nice-to-have parameters for UI polishing.
