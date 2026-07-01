export interface DirectChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  message_content?: string | null;
  status?: "sending" | "failed" | "sent" | "persisted" | "delivered" | "seen";
  tempId?: string;
  client_id?: string;
  read_at?: string;
  sender_profile?: {
    name?: string;
    username?: string;
    profile_photo?: string;
    deleted?: boolean;
  };
  mediaUrl?: string;
  mediaType?: "image" | "video";
  conversationSequence?: number;
  serverSequence?: number;
}

export const STATUS_PRIORITY: Record<string, number> = {
  failed: 0,
  sending: 1,
  sent: 2,
  persisted: 2,
  delivered: 3,
  seen: 4,
};

export class MessageStatusReconciler {
  private tempIdToServerId = new Map<string, string>();

  // Telemetry counters for status auditing
  public telemetry = {
    remaps: 0,
    transitions: 0,
    stale_rejects: 0,
    duplicate_acks: 0,
    optimistic_merges: 0,
  };

  public registerMapping(tempId: string, serverId: string) {
    if (tempId && serverId && tempId !== serverId) {
      this.tempIdToServerId.set(tempId, serverId);
      this.telemetry.remaps++;
      console.log(`[Reconciler] Registered mapping: ${tempId} -> ${serverId}. Telemetry remaps: ${this.telemetry.remaps}`);
    }
  }

  public areSameMessage(msgA: DirectChatMessage, msgB: DirectChatMessage | Partial<DirectChatMessage>): boolean {
    // 1. Server UUID match
    if (msgA.id && msgB.id && msgA.id === msgB.id) return true;

    // 2. client_id match
    const clientA = msgA.client_id || msgA.tempId;
    const clientB = msgB.client_id || msgB.tempId;
    if (clientA && clientB && clientA === clientB) return true;

    // 3. Registry mapping lookup
    if (msgA.id && clientB && this.tempIdToServerId.get(clientB) === msgA.id) return true;
    if (msgB.id && clientA && this.tempIdToServerId.get(clientA) === msgB.id) return true;

    return false;
  }

  public getStatusPriority(status?: string): number {
    if (!status) return STATUS_PRIORITY.sending;
    return STATUS_PRIORITY[status] ?? STATUS_PRIORITY.sending;
  }

  /**
   * Monotonically merges properties of two message records.
   * If no changes occur, returns the exact `existing` reference.
   */
  public merge(existing: DirectChatMessage, incoming: Partial<DirectChatMessage>): DirectChatMessage {
    // Register mapping if database server ID resolved
    if (incoming.id && (existing.tempId || existing.client_id)) {
      const temp = existing.tempId || existing.client_id;
      if (temp) {
        this.registerMapping(temp, incoming.id);
      }
    }

    // Stale sequence check
    const existingSeq = existing.conversationSequence || 0;
    const incomingSeq = incoming.conversationSequence || 0;
    if (incomingSeq > 0 && existingSeq > 0 && incomingSeq < existingSeq) {
      this.telemetry.stale_rejects++;
      console.warn(`[Reconciler] Rejected incoming sequence ${incomingSeq} as stale compared to existing sequence ${existingSeq}`);
      return existing;
    }

    // Stale timestamp check
    const existingTime = existing.read_at
      ? new Date(existing.read_at).getTime()
      : (existing.created_at ? new Date(existing.created_at).getTime() : 0);
    const incomingTime = incoming.read_at
      ? new Date(incoming.read_at).getTime()
      : (incoming.created_at ? new Date(incoming.created_at).getTime() : 0);

    if (incomingSeq === 0 && incomingTime > 0 && existingTime > 0 && incomingTime < existingTime) {
      this.telemetry.stale_rejects++;
      console.warn(`[Reconciler] Rejected incoming event update time ${incomingTime} as stale compared to existing ${existingTime}`);
      return existing;
    }

    // Monotonic status check
    const existingPriority = this.getStatusPriority(existing.status);
    const incomingPriority = this.getStatusPriority(incoming.status);

    if (incoming.status && incomingPriority === existingPriority) {
      if (incoming.status === existing.status) {
        this.telemetry.duplicate_acks++;
      }
    }

    const finalStatus = incomingPriority > existingPriority
      ? (incoming.status as any)
      : existing.status;

    if (incomingPriority > existingPriority) {
      this.telemetry.transitions++;
      console.log(`[Reconciler] Status upgraded monotonically: ${existing.status} (${existingPriority}) -> ${finalStatus} (${incomingPriority})`);
    }

    // Check if any fields changed to avoid duplicate renders
    const hasIdChange = incoming.id !== undefined && incoming.id !== existing.id;
    const hasStatusChange = finalStatus !== existing.status;
    const hasContentChange = incoming.message_content !== undefined && incoming.message_content !== existing.message_content;
    const hasSequenceChange = incoming.conversationSequence !== undefined && incoming.conversationSequence !== existing.conversationSequence;
    const hasReadAtChange = incoming.read_at !== undefined && incoming.read_at !== existing.read_at;

    if (!hasIdChange && !hasStatusChange && !hasContentChange && !hasSequenceChange && !hasReadAtChange) {
      return existing; // Preserves object reference identity
    }

    return {
      ...existing,
      id: incoming.id || existing.id,
      status: finalStatus,
      message_content: incoming.message_content !== undefined ? incoming.message_content : existing.message_content,
      conversationSequence: incoming.conversationSequence !== undefined ? incoming.conversationSequence : existing.conversationSequence,
      serverSequence: incoming.serverSequence !== undefined ? incoming.serverSequence : existing.serverSequence,
      read_at: incoming.read_at !== undefined ? incoming.read_at : existing.read_at,
      tempId: incoming.tempId || existing.tempId,
      client_id: incoming.client_id || existing.client_id,
      mediaUrl: incoming.mediaUrl !== undefined ? incoming.mediaUrl : existing.mediaUrl,
      mediaType: incoming.mediaType !== undefined ? incoming.mediaType : existing.mediaType,
    };
  }

  /**
   * Reconciles a list of existing messages with incoming updates.
   */
  public reconcileList(existingList: DirectChatMessage[], incomingList: (DirectChatMessage | Partial<DirectChatMessage>)[]): DirectChatMessage[] {
    const result = [...existingList];

    for (const incoming of incomingList) {
      const matchIndex = result.findIndex(m => this.areSameMessage(m, incoming));
      if (matchIndex !== -1) {
        result[matchIndex] = this.merge(result[matchIndex], incoming);
      } else {
        // If incoming is a complete DirectChatMessage (has sender_id, receiver_id, created_at), append it
        if (incoming.sender_id && incoming.receiver_id && incoming.created_at) {
          result.push(incoming as DirectChatMessage);
        }
      }
    }

    return result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
}
