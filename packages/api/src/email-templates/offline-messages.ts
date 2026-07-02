import { emailLayout, button, paragraph, heading } from "./layout";

export interface OfflineConversationGroup {
  senderName: string;
  messages: string[];
}

export const offlineMessagesEmail = ({
  recipientName,
  conversations,
  ctaLink,
}: {
  recipientName: string;
  conversations: OfflineConversationGroup[];
  ctaLink: string;
}) => {
  const totalMessages = conversations.reduce((acc, c) => acc + c.messages.length, 0);

  const conversationRows = conversations
    .map(
      (c) => {
        return `<div style="margin-bottom: 16px; padding: 16px; background-color: #f3f4f6; border-radius: 8px; text-align: left;">
          <strong style="color: #111827; font-size: 15px; display: block;">${c.senderName} (${c.messages.length} unread message${c.messages.length > 1 ? "s" : ""})</strong>
        </div>`;
      }
    )
    .join("");

  const content = `
    ${heading("You have unread messages")}
    ${paragraph(`Hi ${recipientName || "there"},`)}
    ${paragraph("You have received unread messages from:")}
    <div style="margin: 24px 0;">
      ${conversationRows}
    </div>
    ${paragraph("Click below to open your chat inbox and reply:")}
    ${button(ctaLink, "Open Conversation")}
  `;

  return emailLayout({
    content,
    previewText: `You have ${totalMessages} unread message${totalMessages > 1 ? "s" : ""} on KOVARI`,
  });
};
