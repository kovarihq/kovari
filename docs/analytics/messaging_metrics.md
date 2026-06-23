# Messaging Metrics Specification

This document defines the metrics and SQL queries for evaluating messaging volume, user chat engagement, and distinguishing organic user interactions from administrative/founder testing.

---

## Distinguishing "Founder" vs. "Stranger" Conversations
To filter out administrative developer testing and measure organic user activity during the closed beta:
- **Founder**: A user whose registered profile email exists in the `public.admins` table.
- **Founder Conversation**: A conversation where **at least one** of the participants is a Founder/Admin.
- **Stranger Conversation**: A conversation between two organic beta users, where **neither** participant is in the `public.admins` table.

---

## Messaging Metrics & Queries

### 1. Total Conversations
* **Definition**: Total direct chat threads initialized.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_conversations
  FROM public.conversations;
  ```

### 2. Total Messages
* **Definition**: Total messages sent between users, excluding auto-generated phantom initialization messages.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_messages
  FROM public.direct_messages
  WHERE media_type IS DISTINCT FROM 'init';
  ```

### 3. Messages Per Conversation
* **Definition**: The average number of messages in a conversation.
* **SQL Query (Robust to conversations with 0 messages)**:
  ```sql
  SELECT 
    AVG(COALESCE(msg_count, 0))::numeric(10,2) AS avg_messages_per_conversation
  FROM public.conversations c
  LEFT JOIN (
    SELECT conversation_id, COUNT(*) AS msg_count
    FROM public.direct_messages
    WHERE media_type IS DISTINCT FROM 'init'
    GROUP BY conversation_id
  ) m ON c.id = m.conversation_id;
  ```

### 4. Active Conversations
* **Definition**: Conversations where at least one message (excluding 'init') was sent in the last 7 days.
* **SQL Query**:
  ```sql
  SELECT COUNT(DISTINCT conversation_id) AS active_conversations
  FROM public.direct_messages
  WHERE media_type IS DISTINCT FROM 'init'
    AND created_at >= NOW() - INTERVAL '7 days';
  ```

### 5. Stranger Conversations
* **Definition**: Conversations where neither participant is an admin/founder.
* **SQL Query**:
  ```sql
  WITH admin_users AS (
    SELECT DISTINCT u.id AS admin_id
    FROM public.users u
    JOIN public.profiles p ON u.id = p.user_id
    JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
  )
  SELECT COUNT(*) AS stranger_conversations
  FROM public.conversations c
  WHERE c.user_a_id NOT IN (SELECT admin_id FROM admin_users)
    AND c.user_b_id NOT IN (SELECT admin_id FROM admin_users);
  ```

### 6. Founder Conversations
* **Definition**: Conversations where at least one participant is an admin/founder.
* **SQL Query**:
  ```sql
  WITH admin_users AS (
    SELECT DISTINCT u.id AS admin_id
    FROM public.users u
    JOIN public.profiles p ON u.id = p.user_id
    JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
  )
  SELECT COUNT(*) AS founder_conversations
  FROM public.conversations c
  WHERE c.user_a_id IN (SELECT admin_id FROM admin_users)
     OR c.user_b_id IN (SELECT admin_id FROM admin_users);
  ```
