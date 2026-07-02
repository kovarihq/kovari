if (typeof window !== "undefined") {
  throw new Error("Waitlist confirmation should only be used server-side.");
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

import { waitlistConfirmationEmail } from "./email-templates/waitlist-confirmation";
import { createAdminSupabaseClient } from "./supabase-admin";
import { getEmailConfig } from "./email-config";

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 4000, 8000];

export interface SendWaitlistConfirmationParams {
  to: string;
  /** If provided, updates waitlist row on success (for confirmation_email_sent_at) */
  waitlistId?: string;
}

/**
 * Sends waitlist confirmation email using Brevo with retries.
 * Retries on timeout, network errors, and Brevo 5xx.
 * Updates waitlist.confirmation_email_sent_at on success when waitlistId is provided.
 * @returns true if sent successfully, false otherwise
 */
export async function sendWaitlistConfirmation({
  to,
  waitlistId,
}: SendWaitlistConfirmationParams): Promise<boolean> {
  if (!process.env.BREVO_API_KEY) {
    console.warn("BREVO_API_KEY is not set. Skipping email send.");
    return false;
  }

  return Sentry.startSpan(
    {
      op: "email.send",
      name: "Send Waitlist Confirmation Email",
    },
    async (span) => {
      try {
        // @ts-ignore
        const SibApiV3SdkImport = await import("sib-api-v3-sdk");
        const SibApiV3Sdk = SibApiV3SdkImport.ApiClient ? SibApiV3SdkImport : (SibApiV3SdkImport.default || SibApiV3SdkImport);

        const defaultClient = SibApiV3Sdk.ApiClient.instance;
        const apiKey = defaultClient.authentications["api-key"];
        apiKey.apiKey = process.env.BREVO_API_KEY!;
        defaultClient.timeout = 90000;

        const productEmailConfig = getEmailConfig("product");

        span.setAttribute("recipient", to);
        span.setAttribute("sender", productEmailConfig.email);

        const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        sendSmtpEmail.to = [{ email: to }];
        sendSmtpEmail.sender = { email: productEmailConfig.email, name: productEmailConfig.name };
        sendSmtpEmail.subject = "You're early 👀";

        (sendSmtpEmail as any).replyTo = {
          email: productEmailConfig.replyTo,
          name: productEmailConfig.name,
        };
        sendSmtpEmail.htmlContent = waitlistConfirmationEmail();

        const isRetriable = (err: unknown) => {
          const e = err as {
            message?: string;
            code?: string;
            response?: { status?: number };
          };
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
            const emailData =
              await apiInstance.sendTransacEmail(sendSmtpEmail);
            span.setAttribute("success", true);
            span.setAttribute("message_id", emailData.messageId || "unknown");
            console.log("Waitlist confirmation email sent successfully:", {
              to: maskEmail(to),
              messageId: emailData.messageId,
              attempt: attempt + 1,
            });

            if (waitlistId) {
              const supabase = createAdminSupabaseClient();
              await supabase
                .from("waitlist")
                .update({ confirmation_email_sent_at: new Date().toISOString() })
                .eq("id", waitlistId);
            }
            return true;
          } catch (err) {
            lastError = err;
            if (attempt < MAX_RETRIES - 1 && isRetriable(err)) {
              await new Promise((r) =>
                setTimeout(r, RETRY_DELAYS_MS[attempt])
              );
            } else {
              break;
            }
          }
        }

        const errorMessage =
          (lastError as {
            response?: { body?: { message?: string } };
            message?: string;
          })?.response?.body?.message ||
          (lastError as { message?: string })?.message ||
          "Unknown error sending email";
        console.error("Error sending waitlist confirmation email:", {
          to: maskEmail(to),
          error: errorMessage,
          attempts: MAX_RETRIES,
        });

        Sentry.captureException(lastError, {
          tags: { scope: "email", type: "waitlist_confirmation" },
          contexts: { email: { recipient: to } },
        });

        span.setAttribute("error", true);
        span.setAttribute("error_message", errorMessage);
        return false;
      } catch (error: unknown) {
        const errorMessage =
          (error as { message?: string })?.message ||
          "Unknown error sending email";
        console.error("Error sending waitlist confirmation email:", {
          to: maskEmail(to),
          error: errorMessage,
        });
        Sentry.captureException(error, {
          tags: { scope: "email", type: "waitlist_confirmation" },
          contexts: { email: { recipient: to } },
        });
        span.setAttribute("error", true);
        span.setAttribute("error_message", errorMessage);
        return false;
      }
    }
  );
}

