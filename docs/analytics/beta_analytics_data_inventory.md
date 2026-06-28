# KOVARI BETA ANALYTICS DATA INVENTORY

This document provides a comprehensive Data Source Audit of the Kovari platform during the closed beta phase. It details the schema, purpose, usage, admin screens, query locations, relationships, and metrics associated with every audited data source.

---

# users

## Exists
Yes

## Table Name
`public.users`

## Schema Location
- [20260617000000_closed_beta_tooling.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260617000000_closed_beta_tooling.sql#L6-L10) (Adds columns `beta_status`, `invite_date`, and `activation_date`)
- [20260617000001_cohort_activity_funnel.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260617000001_cohort_activity_funnel.sql#L11-L24) (Adds columns `beta_batch` and `last_seen_at` with performance indexes)
- [20260528212000_consolidate_database_schemas.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260528212000_consolidate_database_schemas.sql#L2) (Manages email constraints and unique constraints)

## Purpose
Maintains core identity record for authenticated users. Resolves external credentials (Clerk, Google, or direct credentials) to a internal UUID, and tracks invitation and cohort/batch boundaries.

## Current Usage
- Enforces access gates for the closed beta: only users whose emails are in the `waitlist` with status `'beta_invited'` or `'beta_active'` are auto-provisioned.
- Performs session/request validation and identity resolution for almost all authenticated routes.
- Tracks cohort activity funnel stages.

## Existing Admin Usage
- Main dashboard overview aggregates total registered users, invited users, activated users, and activation rates from this table ([page.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/page.tsx#L117-L155)).
- User detail views display invitation date, activation date, beta status, and ban/suspension status ([users/[id]/page.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/users/%5Bid%5D/page.tsx#L93-L100)).
- Suspension dashboard tools update banned states on this table.

## Available Metrics
- **Total Users** (excluding admins)
- **Beta Activation Rate** (Activated Users / Invited Users)
- **Beta Batch breakdown** (Activated users grouped by cohort batch)
- **Onboarding Completion Rate** (Users with `onboarding_completed = true` vs total activated users)
- **Suspended/Banned User Count**

## Missing Metrics
- **DAU / WAU / MAU**: Currently broken because `last_seen_at` is only updated once at user signup/sync and never updated on subsequent app sessions.
- **Cohort Retention**: Broken for the same reason (calculates to 0% after Day 1).
- **User Churn Rate**

## Existing Queries / Repositories
- [getUserUuidByClerkId.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/packages/api/src/getUserUuidByClerkId.ts#L10-L24) (checks active user UUIDs)
- [resolveUser.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/lib/auth/resolveUser.ts#L98-L115) (resolves user ID from database)
- [sync-user route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/supabase/sync-user/route.ts#L96-L125) (syncs identity via `sync_user_identity` RPC, updates beta status, activation dates, batch, and last seen timestamps)
- [beta_analytics_queries.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/docs/analytics/beta_analytics_queries.sql#L33-L70) (funnel stage 2 and 3 queries)

## Read Operations
- [resolveUser.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/lib/auth/resolveUser.ts#L98-L102)
```typescript
const { data: dbUser } = await supabase
  .from("users")
  .select("id, email")
  .eq("clerk_user_id", clerkUserId)
  .maybeSingle();
```
- [sync-user route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/supabase/sync-user/route.ts#L96-L100)
```typescript
const { data: user, error: fetchError } = await supabase
  .from("users")
  .select('id, "isDeleted"')
  .eq("id", userIdFromRpc)
  .single();
```
- [supabase.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/packages/api/src/supabase.ts#L96-L101)
```typescript
const { data, error } = await supabase
  .from("users")
  .select("id")
  .eq("clerk_user_id", clerkId)
  .eq("isDeleted", false)
  .maybeSingle();
```

## Write Operations
- [sync-user route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/supabase/sync-user/route.ts#L109-L125)
```typescript
const { error: userUpdateError } = await supabase
  .from("users")
  .update({
    beta_status: "activated",
    activation_date: new Date().toISOString()
  })
  .eq("id", userIdFromRpc);

await supabase
  .from("users")
  .update({ last_seen_at: new Date().toISOString() })
  .eq("id", userIdFromRpc);
```
- [send-beta-invites route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/api/admin/send-beta-invites/route.ts#L137-L154)
```typescript
const userUpdatePayload: Record<string, unknown> = {
  beta_status: "invited",
  invite_date: new Date().toISOString()
};
if (beta_batch) userUpdatePayload.beta_batch = beta_batch;

await supabase
  .from("users")
  .update(userUpdatePayload)
  .eq("id", userRow.id);
```

## Relationships
- Referenced by: `public.profiles(user_id) REFERENCES users(id) ON DELETE CASCADE`
- Referenced by: `public.blocked_users(blocker_id) REFERENCES users(id) ON DELETE CASCADE`
- Referenced by: `public.blocked_users(blocked_id) REFERENCES users(id) ON DELETE CASCADE`
- Referenced by: `public.conversations(user_a_id) REFERENCES users(id) ON DELETE CASCADE`
- Referenced by: `public.conversations(user_b_id) REFERENCES users(id) ON DELETE CASCADE`
- Referenced by: `public.notifications(user_id) REFERENCES users(id) ON DELETE CASCADE`
- Referenced by: `public.fcm_device_tokens(user_id) REFERENCES users(id) ON DELETE CASCADE`
- Referenced by: `public.feedback(user_id) REFERENCES users(id) ON DELETE SET NULL`

## Notes
> [!CAUTION]
> **DAU/WAU Telemetry Failure**:
> Retention calculations are completely non-functional. `last_seen_at` is only updated once during the onboarding/sync process and never refreshed during subsequent user actions.

---

# profiles

## Exists
Yes

## Table Name
`public.profiles`

## Schema Location
- [20260614000000_add_travel_intentions_to_profiles.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260614000000_add_travel_intentions_to_profiles.sql#L2-L4) (Adds travel intentions jsonb column)
- [20260528212000_consolidate_database_schemas.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260528212000_consolidate_database_schemas.sql#L3) (Drops duplicate constraints)

## Purpose
Maintains user-facing display metadata, demographics (age, gender, nationality), matching attributes (personality, lifestyle parameters, interests, languages), and geographical settings.

## Current Usage
- Displaying profiles in search, feeds, and messaging routes.
- Providing matching candidates to the solo/group recommendation engine.
- Storing active travel intent attributes.

## Existing Admin Usage
- Aggregates "Total Users" count in the dashboard where `deleted = false` ([page.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/page.tsx#L186-L197)).
- Renders detailed profile data inside the User Detail view component ([users/[id]/page.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/users/%5Bid%5D/page.tsx#L68-L92)).

## Available Metrics
- **Total Registered User Profiles**
- **Demographic distributions** (Nationality, Religion, Age distribution, Gender)
- **Top User Interests and Languages**
- **Profile Completeness indicators** (e.g. bio length, avatar presence)

## Missing Metrics
- **Profile Completion Funnel**: Tracking the time elapsed or step drop-off during user onboarding forms.

## Existing Queries / Repositories
- [profileMapper.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/lib/mappers/profileMapper.ts#L9-L96) (Normalizes columns into DTO structure)
- [profile update route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/profile/update/route.ts#L38-L56) (Updates profiles interests and demography)
- [matching-service supabase.go](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/matching-service/internal/repository/supabase.go#L207-L359) (`FetchProfilesBatch` hydration method)
- [matching-service postgres.go](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/matching-service/internal/repository/postgres.go#L38-L125) (`FetchProfilesBatch` raw SQL query)

## Read Operations
- [supabase.go](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/matching-service/internal/repository/supabase.go#L210)
```go
profilesURL := fmt.Sprintf("%s/rest/v1/profiles?select=user_id,name,age,gender,personality,location,smoking,drinking,religion,interests,languages,nationality,job,profile_photo,bio,food_preference,travel_intentions,users!inner(clerk_user_id)&users.clerk_user_id=in.%s", r.url, idsParam)
```
- [profile page route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/profile/update/route.ts#L188-L193)
```typescript
const { data: existingProfile } = await supabase
  .from("profiles")
  .select("user_id")
  .ilike("username", value)
  .not("user_id", "eq", user.id)
  .maybeSingle();
```

## Write Operations
- [profile update route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/profile/update/route.ts#L223-L226)
```typescript
const { error: profileUpdateError } = await supabase
  .from("profiles")
  .update(profileUpdates)
  .eq("user_id", user.id);
```

## Relationships
- `user_id` UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE
- Referenced by: `feedback_notes` and `admin_actions` (indirectly via users table references).

## Notes
- Display names (`profiles.name`) and username changes are automatically synchronized to Clerk public metadata.
- Geographical coordinates are self-healed in background Redis caches when missing.

---

# travel_intentions

## Exists
No (not a standalone table) / Yes (embedded as JSONB array column in `public.profiles`)

## Table Name
`public.profiles.travel_intentions`

## Schema Location
- [20260614000000_add_travel_intentions_to_profiles.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260614000000_add_travel_intentions_to_profiles.sql#L2-L4) (Adds travel intentions jsonb column)

## Purpose
Embeds user travel plans directly inside the profile schema to facilitate matching calculations without the overhead of additional database queries.

## Current Usage
- User configures travel intentions during profile setup.
- Candidate profiles are filtered during matching by checking if their destination name or intentions overlap with the requester's target destinations.

## Existing Admin Usage
- Exhibited on the user detail card.

## Available Metrics
- **Most Popular Destinations**
- **Proportion of Users with Active Travel Intent** (at least one plan)
- **Budget distribution** for matching cohorts

## Missing Metrics
- **Intent Creation Conversion**: Drop-offs or timeline trends for travel intent updates.
- **Average Lead Time**: The average time between intent creation and planned travel dates.

## Existing Queries / Repositories
- [beta_activation_funnel.md](file:///c:/Users/Dell/Desktop/Coding/kovari/docs/analytics/beta_activation_funnel.md#L83-L95) -> Stage 4 funnel query
- [matching-service main.go](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/matching-service/main.go#L344-L353) (Computes intent overlap score)
- [profileMapper.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/lib/mappers/profileMapper.ts#L94)

## Read Operations
- [beta_activation_funnel.md](file:///c:/Users/Dell/Desktop/Coding/kovari/docs/analytics/beta_activation_funnel.md#L83-L95)
```sql
SELECT COUNT(DISTINCT p.user_id) AS count
FROM public.profiles p
JOIN public.users u ON p.user_id = u.id
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND p.travel_intentions IS NOT NULL 
  AND jsonb_array_length(p.travel_intentions) > 0
```

## Write Operations
- Written during profile setup/update patches modifying the `travel_intentions` JSONB field.

## Relationships
- Attribute of the `profiles` table.

## Notes
> [!NOTE]
> **JSONB Storage Trade-offs**:
> While storage within `profiles` avoids database joins for single-user reads, it limits the ability to perform performant database-level analytics across destinations (requires unnesting JSON arrays).

---

# match_interests

## Exists
Yes

## Table Name
`public.match_interests`

## Schema Location
- [20260616000000_sre_performance_indexes_and_views.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260616000000_sre_performance_indexes_and_views.sql) (Optimizes indices for from/to lookups)
- [20260528212000_consolidate_database_schemas.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260528212000_consolidate_database_schemas.sql)

## Purpose
Records unilateral interest signals sent from one user to another for solo or group matches, determining pending match states and triggering notifications.

## Current Usage
- Matching system stores outgoing matching requests.
- Checks reverse interest matching. If mutual interest exists, updates state to `'accepted'` and provisions a row in the mutual `matches` table.

## Existing Admin Usage
- Dashboard monitors "Matches (24h)" showing number of accepted matching interests ([page.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/page.tsx#L97-L104)).

## Available Metrics
- **Total Interests Sent**
- **Pending / Accepted / Rejected Breakdown**
- **Match Acceptance Rate**
- **Average Pending Decision Time** (critical bottleneck tracker)

## Missing Metrics
- **Match-to-Chat Conversion Rate** (signals how many matched pairs actually started exchanging direct messages)

## Existing Queries / Repositories
- [interest_funnel_metrics.md](file:///c:/Users/Dell/Desktop/Coding/kovari/docs/analytics/interest_funnel_metrics.md#L18-L80) (queries 1 to 6)
- [interest route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/matching/interest/route.ts#L61-L89) (creates interests)

## Read Operations
- [matching interest route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/matching/interest/route.ts#L133-L141)
```typescript
const { data: allInterestsBetween } = await supabaseAdmin
  .from("match_interests")
  .select("id, status, destination_id, match_type, from_user_id, to_user_id")
  .or(`and(from_user_id.eq.${fromUuid},to_user_id.eq.${toUuid}),and(from_user_id.eq.${toUuid},to_user_id.eq.${fromUuid})`)
  .eq("match_type", "solo");
```

## Write Operations
- [matching interest route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/matching/interest/route.ts#L77-L87)
```typescript
const { data, error } = await supabaseAdmin
  .from("match_interests")
  .insert([{
    from_user_id: fromUuid,
    to_user_id: toUuid,
    destination_id: destinationId,
    match_type: "solo",
    status: "pending",
  }])
```

## Relationships
- `from_user_id` UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE
- `to_user_id` UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE
- `destination_id` REFERENCES `destinations(id)`

## Notes
- Cache invalidation (`invalidateMatchingCache`) is triggered upon writing to this table to refresh recommendations.

---

# notifications

## Exists
Yes

## Table Name
`public.notifications`

## Schema Location
- [20260622180000_notifications_push_observability.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260622180000_notifications_push_observability.sql#L1-L15) (Adds columns `push_attempted_at` and `push_status` with constraints)

## Purpose
Maintains records of in-app alerts and traces FCM push notification delivery status outcomes.

## Current Usage
- Dispatches in-app notifications and manages read/unread status.
- Traces push notification delivery bottlenecks (`no_token`, `failed`, `delivered`).

## Existing Admin Usage
- Renders system push notification reliability metrics (missing token rates, FCM failures).

## Available Metrics
- **Total Notifications Dispatched**
- **Notification Read Rate**
- **FCM Push Success / Failure Rates**
- **Missing Token (`no_token`) Rates**

## Missing Metrics
- **Notification CTR (Click-Through Rate)**: Clicking notifications is not tracked on the client.

## Existing Queries / Repositories
- [notification_metrics.md](file:///c:/Users/Dell/Desktop/Coding/kovari/docs/analytics/notification_metrics.md#L19-L109) (queries 1 to 6)
- [createNotification.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/lib/notifications/createNotification.ts#L76-L91) (notification write entrypoint)

## Read Operations
- [notifications route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/notifications/route.ts#L47-L50)
```typescript
const { data, error } = await supabase
  .from("notifications")
  .select("*")
  .eq("user_id", currentUserId)
  .order("created_at", { ascending: false });
```

## Write Operations
- [createNotification.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/lib/notifications/createNotification.ts#L78-L91)
```typescript
const { data: notifData, error } = await supabaseAdmin
  .from("notifications")
  .insert({
    user_id: supabaseId,
    type,
    title,
    message,
    entity_type: entityType,
    entity_id: entityId,
    image_url: imageUrl,
    is_read: false,
  })
```
- [createNotification.ts](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/lib/notifications/createNotification.ts#L164-L170)
```typescript
await supabaseAdmin
  .from("notifications")
  .update({
    push_attempted_at: new Date().toISOString(),
    push_status: pushResult.pushStatus,
  })
  .eq("id", notificationId);
```

## Relationships
- `user_id` UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE

## Notes
- Push status constraints check: `push_status IN ('delivered', 'suppressed', 'no_token', 'failed', 'skipped_low_priority')`.

---

# direct_messages

## Exists
Yes

## Table Name
`public.direct_messages`

## Schema Location
- [20260619000000_messaging_conversations_and_sequences.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260619000000_messaging_conversations_and_sequences.sql#L11-L15) (Adds columns `conversation_id`, `conversation_sequence`, and `global_sequence`)

## Purpose
Stores direct encrypted messaging interactions between users.

## Current Usage
- Powers real-time chat between users.
- Stores client IDs to avoid duplicates.
- Generates transactional conversation sequence IDs via a database trigger.

## Existing Admin Usage
- Monitored to calculate total message volume, active conversation trends, and to filter out administrative tester activity.

## Available Metrics
- **Total Messages** (excluding `'init'`)
- **Average Messages per Chat Thread**
- **7-day Active Chats**

## Missing Metrics
- **Average Response Delay**
- **Attachments Ratio**

## Existing Queries / Repositories
- [messaging_metrics.md](file:///c:/Users/Dell/Desktop/Coding/kovari/docs/analytics/messaging_metrics.md#L17-L89) (queries 1 to 6)
- [messages route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/direct-chat/messages/route.ts#L62-L89) (delivers message history and paginates using cursor timestamp)

## Read Operations
- [messages route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/direct-chat/messages/route.ts#L62-L85)
```typescript
let query = supabase
  .from("direct_messages")
  .select(`*, sender:users(id, clerk_user_id, profiles(name, username, profile_photo, deleted)), receiver:users(id, clerk_user_id)`)
  .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${resolvedPartnerId}),and(sender_id.eq.${resolvedPartnerId},receiver_id.eq.${currentUserId})`)
```

## Write Operations
- [messages route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/direct-chat/messages/route.ts#L181-L201)
```typescript
const { data, error } = await supabase
  .from("direct_messages")
  .insert([insertPayload])
```

## Relationships
- `sender_id` UUID REFERENCES `users(id)` ON DELETE CASCADE/SET NULL
- `receiver_id` UUID REFERENCES `users(id)` ON DELETE CASCADE/SET NULL
- `conversation_id` UUID REFERENCES `conversations(id)` ON DELETE CASCADE

## Notes
- End-to-end encryption keys are generated client-side from alphabetically sorted participant UUID combinations.

---

# feedback

## Exists
Yes

## Table Name
`public.feedback`

## Schema Location
- [20260604000000_create_feedback.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260604000000_create_feedback.sql#L1-L9) (Initial table definition)
- [20260617000000_closed_beta_tooling.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260617000000_closed_beta_tooling.sql#L12-L23) (Adds `status` column and creates `feedback_notes` table)

## Purpose
Maintains bugs, feedback requests, and suggest logs entered by closed beta participants.

## Current Usage
- Client dialog triggers posts to `/api/feedback`.
- Triggers SMTP alerts through Brevo to engineering.

## Existing Admin Usage
- Renders unique feedback contributors card ([page.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/page.tsx#L135-L142)).
- Renders interactive feedback review queues with status transitions and notes attachment ([feedback/page.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/feedback/page.tsx)).

## Available Metrics
- **Total Feedback Count**
- **Breakdown by Category** (bug, suggestion, other) and **Status**
- **Notes per feedback item**

## Missing Metrics
- **Average Resolve Duration**: Time elapsed between creation and resolved state change.

## Existing Queries / Repositories
- [feedback route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/feedback/route.ts#L78-L83) (creates feedback entries)
- [admin feedback route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/api/admin/feedback/route.ts)

## Read Operations
- [dashboard page](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/page.tsx#L135-L137)
```typescript
const { data: feedbackData } = await supabaseAdmin
  .from('feedback')
  .select('user_id');
```

## Write Operations
- [feedback route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/feedback/route.ts#L78-L83)
```typescript
const { error: insertError } = await supabase.from("feedback").insert({
  user_id: user?.id ?? null,
  type,
  message,
  page_url: page_url || null,
});
```

## Relationships
- `user_id` UUID REFERENCES `users(id)` ON DELETE SET NULL
- Referenced by: `public.feedback_notes(feedback_id) REFERENCES feedback(id) ON DELETE CASCADE`

## Notes
- Admin internal note records are appended in `public.feedback_notes`.

---

# waitlist

## Exists
Yes

## Table Name
`public.waitlist`

## Schema Location
- [20260603000000_beta_invites.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260603000000_beta_invites.sql#L18-L22) (Indexes definition)
- [20260617000000_closed_beta_tooling.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260617000000_closed_beta_tooling.sql#L1-L4) (Adds `invite_sent_at` and `activated_at` columns)
- [20260617000001_cohort_activity_funnel.sql](file:///c:/Users/Dell/Desktop/Coding/kovari/supabase/migrations/20260617000001_cohort_activity_funnel.sql#L8-L9) (Adds `beta_batch` column)

## Purpose
Maintains collection of landing page registration emails, orchestrating the invitations and activation lifecycle.

## Current Usage
- Landing page inserts prospective lead details.
- Dispatches Brevo confirmation emails asynchronously.
- Retried by cron job `/api/cron/send-waitlist-emails`.

## Existing Admin Usage
- Waitlist dashboard reports total growth trends, daily signups, traffic sources, and conversion funnels ([waitlist/page.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/waitlist/page.tsx)).
- Beta panel triggers cohort batch invites ([BetaInvitePanel.tsx](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/components/BetaInvitePanel.tsx)).

## Available Metrics
- **Total Waitlist Leads**
- **Landing Views Conversion Rate**
- **Confirmation Pipeline Delay / Success**
- **Campaign traffic source distribution**

## Missing Metrics
- **Batch cohort retention progression**: How long users wait from invite before completing onboarding, tracked by batch.

## Existing Queries / Repositories
- [waitlist-analytics route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/api/admin/waitlist-analytics/route.ts#L25-L38) (Growth timeline and traffic sources)
- [send-beta-invites route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/api/admin/send-beta-invites/route.ts#L62-L67) (Batch selection)

## Read Operations
- [send-waitlist-emails cron](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/cron/send-waitlist-emails/route.ts#L30-L37)
```typescript
const { data: pending, error } = await supabase
  .from("waitlist")
  .select("id, email")
  .is("confirmation_email_sent_at", null)
  .lt("created_at", minCreated)
  .gt("created_at", maxCreated)
```

## Write Operations
- [waitlist public route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/waitlist/route.ts#L102-L107)
```typescript
const { data, error } = await supabase
  .from("waitlist")
  .insert({ 
    email: normalizedEmail,
    source: source 
  })
```

## Relationships
- None (independent lead generation table, linked by email to user accounts upon signup).

## Notes
- Valid statuses checking constraint: `'new'`, `'beta_invited'`, `'beta_active'`.

---

# analytics_events

## Exists
Yes

## Table Name
`public.analytics_events`

## Schema Location
🔴 **Missing Schema Migration File**: This table is not created or referenced in any SQL migration files in the repo. It is built directly inside the database, but its model representation is missing in code.

## Purpose
Maintains client-side raw activity telemetry (landing pageviews, waitlist buttons click events) for computing traffic funnels.

## Current Usage
- Web client calls `/api/analytics/track` to post event data.
- Stores `event_name`, `event_data` (JSONB payload), and `session_id`.

## Existing Admin Usage
- Queried by waitlist analytics controller to fetch `landing_view` and `waitlist_click` aggregates ([waitlist-analytics route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/api/admin/waitlist-analytics/route.ts#L94-L102)).

## Available Metrics
- **Total Landing Page Views**
- **Waitlist CTA Button Clicks**
- **Landing Conversion CTR**

## Missing Metrics
- **Full-funnel in-app conversion**: In-app actions (explore tab visits, profile edit views, chat starts) are not logged to this table.
- **User attribution**: No `user_id` links events back to registered user accounts.

## Existing Queries / Repositories
- [analytics track route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/analytics/track/route.ts#L16-L22) (event insert handler)
- [analytics.ts utility](file:///c:/Users/Dell/Desktop/Coding/kovari/packages/utils/src/analytics.ts#L7-L31) (`trackEvent` client tracking wrapper)

## Read Operations
- [waitlist-analytics route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/admin/app/api/admin/waitlist-analytics/route.ts#L94-L97)
```typescript
const { count: landingViews } = await supabaseAdmin
  .from('analytics_events')
  .select('*', { count: 'exact', head: true })
  .eq('event_name', 'landing_view');
```

## Write Operations
- [analytics track route](file:///c:/Users/Dell/Desktop/Coding/kovari/apps/web/src/app/api/analytics/track/route.ts#L16-L22)
```typescript
const logPromise = createAdminSupabaseClient()
  .from("analytics_events")
  .insert({
    event_name,
    event_data: event_data || {},
    session_id: session_id || null,
  });
```

## Relationships
- None (flat logging collection).

## Notes
> [!WARNING]
> **Fresh Database Setup Risk**:
> Since no migration file defines `public.analytics_events` in the repository, setting up a fresh development environment or staging instance will cause analytics tracking writes to fail.

---

# Cross-Table Analytics Assessment

This assessment reviews Kovari's current capabilities to generate cross-table dashboard insights, identifies gaps, and outlines improvements.

## Metrics Available Today

The following metrics can be constructed by joining the verified data sources:

1. **Invite-to-Onboarding Conversion Funnel**:
   - Compares Waitlist invitations sent (`waitlist` status = `'beta_invited'`) -> Users Activated (`users` status = `'activated'`) -> Onboarding Completed (`users.onboarding_completed = true`) -> Profiles with Travel Intentions (`profiles.travel_intentions` count > 0).
2. **Organic Match Engagement Rate**:
   - Joins `match_interests` with `profiles` and `admins` (via anti-joins) to track total matching interest requests between two organic stranger users, filtering out admin test accounts.
3. **Push Notification Suppression / Failure Rate**:
   - Compares push outcomes (`push_status` = `'delivered'` vs `'failed'` vs `'no_token'`) grouped by the notification type triggers (like message vs match notifications).
4. **Strangers vs. Founders Communication Ratio**:
   - Joins `conversations` with the `admins` table to split chat activity metrics into organic stranger chats vs. admin-to-admin test chats.

## Metrics Missing Today

The following critical business metrics are currently impossible to calculate:

1. **Daily / Weekly / Monthly Active Users (DAU / WAU / MAU)**:
   - *Reason*: `users.last_seen_at` is only updated once upon user signup/sync and never updated during active user requests. All active user counters will return 0 or fall to zero after cohort activation day.
2. **User Retention & Churn Rates**:
   - *Reason*: Requires tracking user session logs or updating `last_seen_at` on subsequent request cycles.
3. **Notification CTR (Click-Through Rate)**:
   - *Reason*: Client-side notification click actions are not instrumented or sent to `analytics_events`.
4. **Complete Activation Funnel (Explore Viewed)**:
   - *Reason*: Exploring solo/group profiles is a client-side action only. There is no backend logging in `audit_logs` or `analytics_events` when users visit the Explore tab.
5. **Session Length / Screen Duration**:
   - *Reason*: No user session tracking or page engagement events exist inside `analytics_events`.

## Recommended Tracking Improvements

To enable complete closed-beta observability, the following modifications are recommended:

### 1. Fix `last_seen_at` Telemetry Gap
Update `last_seen_at` on every authenticated API request in `apps/web/src/middleware.ts` (throttled to once per day/hour using a Redis cache to prevent database write storms).

### 2. Formally Define `analytics_events` Schema
Create a new migration `supabase/migrations/20260624000000_create_analytics_events.sql` to track clickstream events:
```sql
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb NOT NULL,
    session_id VARCHAR(255) NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);
```

### 3. Instrument Key Analytics Events
Call the `trackEvent` helper in the client application to fire the following events:
- **`user_logged_in`**: Logged upon session initiation.
- **`profile_completed`**: Logged when the user completes onboarding.
- **`explore_viewed`**: Logged when the user visits the Explore feed (resolves the Funnel Stage 5 gap).
- **`match_created`**: Logged when a mutual match is formed.
- **`message_sent`**: Logged when a direct message is successfully sent.
- **`notification_clicked`**: Logged when a user clicks on an in-app or push notification.
- **`feedback_submitted`**: Logged upon feedback dispatch.
