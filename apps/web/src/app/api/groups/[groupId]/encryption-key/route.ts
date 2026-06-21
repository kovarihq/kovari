import { resolveUser } from "@/lib/auth/resolveUser";
import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@kovari/api";
import {
  generateGroupKey,
  generateKeyFingerprint,
} from "@kovari/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const authResult = await resolveUser(req, { mode: "protected" });
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.message || "Unauthorized" },
        { status: 401 },
      );
    }
    const resolvedUserId = authResult.user.userId;

    const { groupId } = await params;
    if (!groupId) {
      return NextResponse.json({ error: "Missing groupId" }, { status: 400 });
    }

    const supabase = createAdminSupabaseClient();

    // Group existence + basic access rules
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, status, creator_id")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (group.status === "removed") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const isCreator = group.creator_id === resolvedUserId;
    if (group.status === "pending" && !isCreator) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("status")
        .eq("group_id", groupId)
        .eq("user_id", resolvedUserId)
        .maybeSingle();

      if (membership?.status !== "accepted") {
        return NextResponse.json(
          { error: "Not a member of this group" },
          { status: 403 },
        );
      }
    }

    // Fetch existing shared key for this group (if any)
    const { data: existingKey, error: existingErr } = await supabase
      .from("group_encryption_keys")
      .select("group_id, encryption_key, key_fingerprint, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      console.error("[encryption-key] fetch existing failed", {
        code: existingErr.code,
        message: existingErr.message,
      });
      return NextResponse.json(
        { error: "Failed to fetch encryption key" },
        { status: 500 },
      );
    }

    if (existingKey) {
      return NextResponse.json(
        {
          groupId: existingKey.group_id,
          key: existingKey.encryption_key,
          fingerprint: existingKey.key_fingerprint,
          createdAt: existingKey.created_at,
        },
        { status: 200 },
      );
    }

    // Create a new shared key for the group
    const newKeyData = generateGroupKey();
    const fingerprint = generateKeyFingerprint(newKeyData.key);

    const insertPayload = {
      group_id: groupId,
      user_id: resolvedUserId,
      encryption_key: newKeyData.key,
      key_fingerprint: fingerprint,
      created_at: newKeyData.createdAt,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("group_encryption_keys")
      .insert(insertPayload)
      .select("group_id, encryption_key, key_fingerprint, created_at")
      .single();

    if (insertErr || !inserted) {
      // If another member created it concurrently, refetch.
      console.error("[encryption-key] insert failed", {
        code: insertErr?.code,
        message: insertErr?.message,
      });

      const { data: retryKey } = await supabase
        .from("group_encryption_keys")
        .select("group_id, encryption_key, key_fingerprint, created_at")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (retryKey) {
        return NextResponse.json(
          {
            groupId: retryKey.group_id,
            key: retryKey.encryption_key,
            fingerprint: retryKey.key_fingerprint,
            createdAt: retryKey.created_at,
          },
          { status: 200 },
        );
      }

      return NextResponse.json(
        { error: "Failed to create encryption key" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        groupId: inserted.group_id,
        key: inserted.encryption_key,
        fingerprint: inserted.key_fingerprint,
        createdAt: inserted.created_at,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[encryption-key GET error]", error);
    return NextResponse.json(
      { 
        error: "Internal Server Error", 
        message: error?.message, 
        stack: error?.stack 
      },
      { status: 500 },
    );
  }
}
