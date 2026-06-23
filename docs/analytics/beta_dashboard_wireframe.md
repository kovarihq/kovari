# Beta Dashboard Wireframe & Specification (`admin.kovari.in`)

This document is a visual markdown wireframe for the new **Beta Analytics Dashboard** in `admin.kovari.in`. It maps visual components 1:1 to metric queries defined in the other specification documents.

---

## 🎨 Dashboard Theme & Layout Principles
- **Grid Layout**: Three main visual regions — Top Row (Metrics Cards), Left Column (Funnel Visuals & Notifications), Right Column (Interests & Messaging).
- **Theme**: Premium Sleek Dark Mode (harmonious dark grays, electric blues, neon greens, and alert reds).
- **No Placeholders**: Real visual widgets bound directly to SQL queries.

---

## 🖥️ Layout Wireframe

```
+-------------------------------------------------------------------------------------------------------------------+
|  KOVARI ADMIN  |  [Dashboard]  [Users]  [Waitlist]  [Settings]                                   [Beta Batch: All v] |
+-------------------------------------------------------------------------------------------------------------------+
|                                                                                                                   |
|  [SECTION 1: BETA OVERVIEW CARD GRID]                                                                             |
|  +------------------+  +------------------+  +------------------+  +------------------+  +------------------+     |
|  | TOTAL USERS      |  | ACTIVATED USERS  |  | RETURNED USERS   |  | D1 RETENTION %   |  | DORMANT USERS    |     |
|  |      [ 15 ]      |  |      [ 14 ]      |  |      [ 2 ]       |  |     [ 14.3% ]    |  |      [ 12 ]      |     |
|  | +0% last 7d      |  | 93% waitlist conv|  | 14.2% return rate|  | Daily cohort view|  | 85.7% of active  |     |
|  +------------------+  +------------------+  +------------------+  +------------------+  +------------------+     |
|                                                                                                                   |
|                                                                                                                   |
|  [SECTION 2: ACTIVATION FUNNEL (LEFT)]                   |  [SECTION 3: INTERESTS FUNNEL (RIGHT)]                 |
|  +-----------------------------------------------------+ |  +---------------------------------------------------+ |
|  | ACTIVATION STAGES (CONVERSION BAR CHART)            | |  | MUTUAL INTEREST & DECISION RATES                   | |
|  |                                                     | |  |                                                   | |
|  | Invited     [████████████████████] 100% (15)        | |  | Sent:     [ 5 ]                                   | |
|  | Activated   [███████████████████░] 93.3% (14)       | |  | Pending:  [ 5 ]  <-- ⚠️ CURRENT BETA BOTTLENECK    | |
|  | Onboarded   [█████████████░░░░░░░] 66.7% (10)       | |  | Accepted: [ 0 ]                                   | |
|  | Trv. Intent [█████████████░░░░░░░] 66.7% (10)       | |  | Rejected: [ 0 ]                                   | |
|  | Explore View[░░░░░░░░░░░░░░░░░░░░] N/A (No Data)    | |  |                                                   | |
|  | Int. Sent   [██████░░░░░░░░░░░░░░] 33.3% (5)        | |  | Acceptance Rate:  [ 0.0% ]                         | |
|  | Int. Accept [░░░░░░░░░░░░░░░░░░░░] 0.0% (0)         | |  | Avg. Pending Age: [ 7.2 Days ]                    | |
|  | Conversated [░░░░░░░░░░░░░░░░░░░░] 0.0% (0)         | |  +---------------------------------------------------+ |
|  | Msg Sent    [░░░░░░░░░░░░░░░░░░░░] 0.0% (0)         | |                                                     | |
|  +-----------------------------------------------------+ |  [SECTION 4: MESSAGING HEALTH (RIGHT)]                | |
|                                                          |  +---------------------------------------------------+ |
|                                                          |  | MESSAGING ENGAGEMENT & RETENTION DATA              | |
|  [SECTION 5: NOTIFICATION & PUSH HEALTH (LEFT)]          |  |                                                   | |
|  +-----------------------------------------------------+ |  | Total Conversations:      [ 0 ]                   | |
|  | SYSTEM DISPATCH & OBSERVABILITY STACK               | |  | Total Messages Sent:      [ 0 ]                   | |
|  |                                                     | |  | Messages Per Conversation: [ 0.0 ]                 | |
|  | Created:   [ 45 ]                                   | |  | Active Conversations (7d): [ 0 ]                   | |
|  | Read Rate: [ 42.2% ]                                | |  |                                                   | |
|  | Push Att.: [ 40 ] (88.9%)                           | |  | Stranger Conversations:   [ 0 ]                   | |
|  | Success:   [ 12 ] (30.0%)                           | |  | Founder Conversations:    [ 0 ]                   | |
|  | Failed:    [ 3 ]  (7.5%)                            | |  +---------------------------------------------------+ |
|  | No Token:  [ 25 ] (62.5%) <-- 🚨 MAIN ALERT TRIGGER | |                                                     | |
|  +-----------------------------------------------------+ |                                                     | |
|                                                          |                                                     | |
+-------------------------------------------------------------------------------------------------------------------+
```

---

## 📊 Component-to-Query Mappings

### SECTION 1: Beta Overview Card Grid
- **Total Users Card**: Binds to `beta_activation_funnel.md` -> Stage 1 query.
- **Activated Users Card**: Binds to `beta_activation_funnel.md` -> Stage 2 query.
- **Returned Users Card**: Binds to `beta_retention_metrics.md` -> Metric 4 (Returned Users) query. Shows `(returned / activated * 100.0)%` sub-label.
- **D1 Retention % Card**: Binds to `beta_retention_metrics.md` -> Cohort query (retains Day 1 retention %).
- **Dormant Users Card**: Binds to `beta_retention_metrics.md` -> Metric 3 (Dormant Users) query.

### SECTION 2: Activation Funnel Component
- **Funnel Progression Bar Chart**: Binds sequentially to `beta_activation_funnel.md` stages 1 through 9.
  - *Explore Viewed* is marked with a grey warning tooltip: `"Explore Views require client instrumentation. View documentation to enable."`

### SECTION 3: Interest Funnel Component
- **Metric Cards (Sent/Pending/Accepted/Rejected)**: Binds to `interest_funnel_metrics.md` queries 1 through 4.
- **Acceptance Rate Widget**: Binds to `interest_funnel_metrics.md` Query 5.
- **Average Pending Age Widget**: Binds to `interest_funnel_metrics.md` Query 6.
  - *Visual Cue*: Render in yellow/red warning states if the average pending age exceeds 48 hours.

### SECTION 4: Messaging Health Component
- **Summary Metrics Grid**: Binds to `messaging_metrics.md` queries 1 through 4.
- **Stranger vs. Founder Chat Chart**: Binds to `messaging_metrics.md` queries 5 & 6 (rendered as a pie/donut chart showing organic vs developer conversations).

### SECTION 5: Notification & Push Health Component
- **observability Funnel Card**: Binds to `notification_metrics.md` queries 1 through 6.
- **No Token Warning Flag**: Binds to `notification_metrics.md` Deep Dive query. 
  - *Visual Cue*: Highlight in **Bright Red** if `no_token_rate_pct` is above **15%** (as verified in our audit where a significant portion of notifications lacked tokens).
