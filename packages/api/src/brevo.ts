if (typeof window !== "undefined") {
  throw new Error("Brevo service should only be used server-side.");
}
import * as Sentry from "@sentry/nextjs";

function maskEmail(email: string): string {
  if (!email) return "";
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] || ""}*@${domain}`;
  return `${local.substring(0, 2)}${"*".repeat(local.length - 2)}@${domain}`;
}

import { passwordResetEmail } from "./email-templates/password-reset";
import { groupInviteEmail } from "./email-templates/group-invite";
import { registrationVerificationEmail } from "./email-templates/registration-verification";
import { getEmailConfig } from "./email-config";
import { matchInterestEmail } from "./email-templates/match-interest";
import { matchAcceptedEmail } from "./email-templates/match-accepted";
import { offlineMessagesEmail, OfflineConversationGroup } from "./email-templates/offline-messages";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

interface BrevoEmailParams {
  to: Array<{ email: string }>;
  sender: { email: string; name: string };
  replyTo?: { email: string; name: string };
  subject: string;
  htmlContent: string;
}

/** Shared Brevo send with retries + extended timeout for reliable delivery */
async function sendBrevoWithRetry(
  params: BrevoEmailParams
): Promise<{ messageId?: string } | { error: string }> {
  // @ts-ignore
  const SibApiV3SdkImport = await import("sib-api-v3-sdk");
  const SibApiV3Sdk = SibApiV3SdkImport.ApiClient ? SibApiV3SdkImport : (SibApiV3SdkImport.default || SibApiV3SdkImport);
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications["api-key"];
  apiKey.apiKey = process.env.BREVO_API_KEY!;
  defaultClient.timeout = 15000; // 15 seconds per single attempt

  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.to = params.to;
  sendSmtpEmail.sender = params.sender;
  sendSmtpEmail.subject = params.subject;
  sendSmtpEmail.htmlContent = params.htmlContent;
  
  if (params.replyTo) {
    (sendSmtpEmail as any).replyTo = params.replyTo;
  }

  const isRetriable = (err: unknown) => {
    const e = err as { message?: string; code?: string; response?: { status?: number } };
    return (
      e?.message?.includes("Timeout") ||
      e?.code === "ECONNRESET" ||
      e?.code === "ETIMEDOUT" ||
      e?.code === "ENOTFOUND" ||
      (e?.response?.status != null && e.response.status >= 500)
    );
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
      return { messageId: data.messageId };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1 && isRetriable(err)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      } else {
        break;
      }
    }
  }

  const err = lastError as { response?: { body?: { message?: string } }; message?: string };
  const errorMessage =
    err?.response?.body?.message || err?.message || "Unknown error sending email";
  return { error: errorMessage };
}

export interface SendPasswordResetEmailParams {
  to: string;
  resetLink: string;
}

/**
 * Sends a password reset email via Brevo (sib-api-v3-sdk).
 * Uses dynamic import to avoid client bundling issues, matching waitlist implementation.
 */
export const sendPasswordResetEmail = async ({
  to,
  resetLink,
}: SendPasswordResetEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, error: "BREVO_API_KEY is not configured" };
  }

  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Password Reset Email",
    },
    async (span) => {
      span.setAttribute("recipient", to);
      const systemEmailConfig = getEmailConfig("system");
      span.setAttribute("sender", systemEmailConfig.email);

      const subject = "Reset your Kovari password";
      const html = passwordResetEmail({ resetLink });

      const sendSmtpEmail = {
        to: [{ email: to }],
        sender: { email: systemEmailConfig.email, name: systemEmailConfig.name },
        replyTo: { email: systemEmailConfig.replyTo, name: systemEmailConfig.name },
        subject,
        htmlContent: html,
      };

      const result = await sendBrevoWithRetry(sendSmtpEmail);

      if ("messageId" in result) {
        const messageId = result.messageId || "unknown";
        span.setAttribute("success", true);
        span.setAttribute("message_id", messageId);
        console.log("Password reset email sent successfully:", { to: maskEmail(to), messageId });
        return { success: true, messageId };
      }

      const errorMsg = "error" in result ? result.error : "Unknown error";
      Sentry.captureMessage("Password reset email send failed", {
        level: "error",
        extra: { error: errorMsg, recipient: to },
      });
      span.setAttribute("error", true);
      span.setAttribute("error_message", errorMsg);
      console.error("Error sending password reset email:", { to: maskEmail(to), error: errorMsg });
      return { success: false, error: errorMsg };
    }
  );
};

export interface SendGroupInviteEmailParams {
  to: string;
  groupName: string;
  inviteLink: string;
  senderName?: string;
}

/**
 * Sends a group invitation email via Brevo (formatted HTML).
 */
export const sendGroupInviteEmail = async ({
  to,
  groupName,
  inviteLink,
  senderName = "Someone",
}: SendGroupInviteEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, error: "BREVO_API_KEY is not configured" };
  }

  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Group Invite Email",
    },
    async (span) => {
      span.setAttribute("recipient", to);
      const systemEmailConfig = getEmailConfig("system");
      span.setAttribute("sender", systemEmailConfig.email);

      const subject = `You're invited to join ${groupName} on Kovari`;
      const html = groupInviteEmail({
        groupName,
        inviteLink,
        senderName,
      });

      const sendSmtpEmail = {
        to: [{ email: to }],
        sender: { email: systemEmailConfig.email, name: systemEmailConfig.name },
        replyTo: { email: systemEmailConfig.replyTo, name: systemEmailConfig.name },
        subject,
        htmlContent: html,
      };

      const result = await sendBrevoWithRetry(sendSmtpEmail);

      if ("messageId" in result) {
        const messageId = result.messageId || "unknown";
        span.setAttribute("success", true);
        span.setAttribute("message_id", messageId);
        console.log("Group invite email sent successfully:", {
          to: maskEmail(to),
          groupName,
          messageId,
        });
        return { success: true, messageId };
      }

      const errorMsg = "error" in result ? result.error : "Unknown error";
      Sentry.captureException(new Error(errorMsg), {
        tags: { scope: "email", type: "group_invite" },
        contexts: { email: { recipient: to } },
      });
      span.setAttribute("error", true);
      span.setAttribute("error_message", errorMsg);
      console.error("Error sending group invite email:", { to: maskEmail(to), error: errorMsg });
      return { success: false, error: errorMsg };
    }
  );
};

export interface SendRegistrationVerificationEmailParams {
  to: string;
  code: string;
}

/**
 * Sends a 6-digit registration verification OTP email.
 * Uses shared retry logic and premium HTML template.
 */
export const sendRegistrationVerificationEmail = async ({
  to,
  code,
}: SendRegistrationVerificationEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, error: "BREVO_API_KEY is not configured" };
  }

  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Registration Verification Email",
    },
    async (span) => {
      span.setAttribute("recipient", to);
      const systemEmailConfig = getEmailConfig("system");
      span.setAttribute("sender", systemEmailConfig.email);

      const subject = `${code} is your Kovari verification code`;
      const html = registrationVerificationEmail({ code });

      const sendSmtpEmail = {
        to: [{ email: to }],
        sender: { email: systemEmailConfig.email, name: systemEmailConfig.name },
        replyTo: { email: systemEmailConfig.replyTo, name: systemEmailConfig.name },
        subject,
        htmlContent: html,
      };

      const result = await sendBrevoWithRetry(sendSmtpEmail);

      if ("messageId" in result) {
        const messageId = result.messageId || "unknown";
        span.setAttribute("success", true);
        span.setAttribute("message_id", messageId);
        console.log("Registration verification email sent successfully:", { to: maskEmail(to), messageId });
        return { success: true, messageId };
      }

      const errorMsg = "error" in result ? result.error : "Unknown error";
      Sentry.captureMessage("Registration verification email send failed", {
        level: "error",
        extra: { error: errorMsg, recipient: to },
      });
      span.setAttribute("error", true);
      span.setAttribute("error_message", errorMsg);
      console.error("Error sending registration verification email:", { to: maskEmail(to), error: errorMsg });
      return { success: false, error: errorMsg };
    }
  );
};

import { passwordChangedAlertEmail } from "./email-templates/password-changed-alert";

export interface SendPasswordChangedAlertParams {
  to: string;
}

/**
 * Sends a security alert email after a successful password reset.
 */
export const sendPasswordChangedAlert = async ({
  to,
}: SendPasswordChangedAlertParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, error: "BREVO_API_KEY is not configured" };
  }

  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Password Changed Alert Email",
    },
    async (span) => {
      span.setAttribute("recipient", to);
      const systemEmailConfig = getEmailConfig("system");
      span.setAttribute("sender", systemEmailConfig.email);

      const subject = "Security Alert: Your Kovari password was changed";
      const html = passwordChangedAlertEmail();

      const sendSmtpEmail = {
        to: [{ email: to }],
        sender: { email: systemEmailConfig.email, name: systemEmailConfig.name },
        replyTo: { email: systemEmailConfig.replyTo, name: systemEmailConfig.name },
        subject,
        htmlContent: html,
      };

      const result = await sendBrevoWithRetry(sendSmtpEmail);

      if ("messageId" in result) {
        const messageId = result.messageId || "unknown";
        span.setAttribute("success", true);
        span.setAttribute("message_id", messageId);
        console.log("Password changed alert email sent successfully:", { to: maskEmail(to), messageId });
        return { success: true, messageId };
      }

      const errorMsg = "error" in result ? result.error : "Unknown error";
      Sentry.captureMessage("Password changed alert email send failed", {
        level: "error",
        extra: { error: errorMsg, recipient: to },
      });
      span.setAttribute("error", true);
      span.setAttribute("error_message", errorMsg);
      console.error("Error sending password changed alert email:", { to: maskEmail(to), error: errorMsg });
      return { success: false, error: errorMsg };
    }
  );
};

import { betaInviteEmail } from "./email-templates/beta-invite";

export interface SendBetaInviteEmailParams {
  to: string;
  position?: number;
}

/**
 * Sends a beta invite email via Brevo.
 */
export const sendBetaInviteEmail = async ({
  to,
  position,
}: SendBetaInviteEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, error: "BREVO_API_KEY is not configured" };
  }

  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Beta Invite Email",
    },
    async (span) => {
      span.setAttribute("recipient", to);
      const productEmailConfig = getEmailConfig("product");
      span.setAttribute("sender", productEmailConfig.email);

      const subject = "You're in 🎉";
      const html = betaInviteEmail({ recipientEmail: to });

      const sendSmtpEmail = {
        to: [{ email: to }],
        sender: { email: productEmailConfig.email, name: productEmailConfig.name },
        replyTo: { email: productEmailConfig.replyTo, name: productEmailConfig.name },
        subject,
        htmlContent: html,
      };

      const result = await sendBrevoWithRetry(sendSmtpEmail);

      if ("messageId" in result) {
        const messageId = result.messageId || "unknown";
        span.setAttribute("success", true);
        span.setAttribute("message_id", messageId);
        console.log("Beta invite email sent successfully:", { to: maskEmail(to), messageId });
        return { success: true, messageId };
      }

      const errorMsg = "error" in result ? result.error : "Unknown error";
      Sentry.captureMessage("Beta invite email send failed", {
        level: "error",
        extra: { error: errorMsg, recipient: to },
      });
      span.setAttribute("error", true);
      span.setAttribute("error_message", errorMsg);
      console.error("Error sending beta invite email:", { to: maskEmail(to), error: errorMsg });
      return { success: false, error: errorMsg };
    }
  );
};

export interface SendMatchInterestEmailParams {
  to: string;
  fromName: string;
  destinationName: string;
  ctaLink: string;
}

export const sendMatchInterestEmail = async ({
  to,
  fromName,
  destinationName,
  ctaLink,
}: SendMatchInterestEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, error: "BREVO_API_KEY is not configured" };
  }

  const startTime = performance.now();
  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Match Interest Email",
    },
    async (span) => {
      span.setAttribute("recipient", to);
      const systemEmailConfig = getEmailConfig("system");
      span.setAttribute("sender", systemEmailConfig.email);

      const subject = `${fromName} wants to travel with you`;
      const html = matchInterestEmail({ fromName, destinationName, ctaLink });

      const sendSmtpEmail = {
        to: [{ email: to }],
        sender: { email: systemEmailConfig.email, name: systemEmailConfig.name },
        replyTo: { email: systemEmailConfig.replyTo, name: systemEmailConfig.name },
        subject,
        htmlContent: html,
      };

      const result = await sendBrevoWithRetry(sendSmtpEmail);
      const duration = performance.now() - startTime;

      if ("messageId" in result) {
        const messageId = result.messageId || "unknown";
        span.setAttribute("success", true);
        span.setAttribute("message_id", messageId);
        console.log("EMAIL_MATCH_SENT", {
          duration: `${duration.toFixed(2)}ms`,
          recipient: maskEmail(to),
          template: "match-interest",
          provider: "brevo",
          messageId,
        });
        return { success: true, messageId };
      }

      const errorMsg = "error" in result ? result.error : "Unknown error";
      Sentry.captureMessage("Match interest email send failed", {
        level: "error",
        extra: { error: errorMsg, recipient: to },
      });
      span.setAttribute("error", true);
      span.setAttribute("error_message", errorMsg);
      console.error("EMAIL_FAILED", {
        duration: `${duration.toFixed(2)}ms`,
        recipient: maskEmail(to),
        template: "match-interest",
        provider: "brevo",
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  );
};

export interface SendMatchAcceptedEmailParams {
  to: string;
  partnerName: string;
  ctaLink: string;
}

export const sendMatchAcceptedEmail = async ({
  to,
  partnerName,
  ctaLink,
}: SendMatchAcceptedEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, error: "BREVO_API_KEY is not configured" };
  }

  const startTime = performance.now();
  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Match Accepted Email",
    },
    async (span) => {
      span.setAttribute("recipient", to);
      const systemEmailConfig = getEmailConfig("system");
      span.setAttribute("sender", systemEmailConfig.email);

      const subject = `You matched with ${partnerName}! 🎉`;
      const html = matchAcceptedEmail({ partnerName, ctaLink });

      const sendSmtpEmail = {
        to: [{ email: to }],
        sender: { email: systemEmailConfig.email, name: systemEmailConfig.name },
        replyTo: { email: systemEmailConfig.replyTo, name: systemEmailConfig.name },
        subject,
        htmlContent: html,
      };

      const result = await sendBrevoWithRetry(sendSmtpEmail);
      const duration = performance.now() - startTime;

      if ("messageId" in result) {
        const messageId = result.messageId || "unknown";
        span.setAttribute("success", true);
        span.setAttribute("message_id", messageId);
        console.log("EMAIL_MATCH_SENT", {
          duration: `${duration.toFixed(2)}ms`,
          recipient: maskEmail(to),
          template: "match-accepted",
          provider: "brevo",
          messageId,
        });
        return { success: true, messageId };
      }

      const errorMsg = "error" in result ? result.error : "Unknown error";
      Sentry.captureMessage("Match accepted email send failed", {
        level: "error",
        extra: { error: errorMsg, recipient: to },
      });
      span.setAttribute("error", true);
      span.setAttribute("error_message", errorMsg);
      console.error("EMAIL_FAILED", {
        duration: `${duration.toFixed(2)}ms`,
        recipient: maskEmail(to),
        template: "match-accepted",
        provider: "brevo",
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  );
};

export interface SendOfflineMessagesEmailParams {
  to: string;
  recipientName: string;
  conversations: OfflineConversationGroup[];
  ctaLink: string;
}

export const sendOfflineMessagesEmail = async ({
  to,
  recipientName,
  conversations,
  ctaLink,
}: SendOfflineMessagesEmailParams): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> => {
  if (!process.env.BREVO_API_KEY) {
    return { success: false, error: "BREVO_API_KEY is not configured" };
  }

  const startTime = performance.now();
  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Offline Messages Email",
    },
    async (span) => {
      span.setAttribute("recipient", to);
      const systemEmailConfig = getEmailConfig("system");
      span.setAttribute("sender", systemEmailConfig.email);

      const totalMessages = conversations.reduce((acc, c) => acc + c.messages.length, 0);
      const subject = `You have ${totalMessages} unread message${totalMessages > 1 ? "s" : ""} on KOVARI`;
      const html = offlineMessagesEmail({ recipientName, conversations, ctaLink });

      const sendSmtpEmail = {
        to: [{ email: to }],
        sender: { email: systemEmailConfig.email, name: systemEmailConfig.name },
        replyTo: { email: systemEmailConfig.replyTo, name: systemEmailConfig.name },
        subject,
        htmlContent: html,
      };

      const result = await sendBrevoWithRetry(sendSmtpEmail);
      const duration = performance.now() - startTime;

      if ("messageId" in result) {
        const messageId = result.messageId || "unknown";
        span.setAttribute("success", true);
        span.setAttribute("message_id", messageId);
        console.log("EMAIL_MATCH_SENT", {
          duration: `${duration.toFixed(2)}ms`,
          recipient: maskEmail(to),
          template: "offline-messages",
          provider: "brevo",
          messageId,
        });
        return { success: true, messageId };
      }

      const errorMsg = "error" in result ? result.error : "Unknown error";
      Sentry.captureMessage("Offline messages email send failed", {
        level: "error",
        extra: { error: errorMsg, recipient: to },
      });
      span.setAttribute("error", true);
      span.setAttribute("error_message", errorMsg);
      console.error("EMAIL_FAILED", {
        duration: `${duration.toFixed(2)}ms`,
        recipient: maskEmail(to),
        template: "offline-messages",
        provider: "brevo",
        error: errorMsg,
      });
      return { success: false, error: errorMsg };
    }
  );
};
