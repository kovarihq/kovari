import { emailLayout, button, paragraph, heading } from "./layout";

export const matchAcceptedEmail = ({
  partnerName,
  ctaLink,
}: {
  partnerName: string;
  ctaLink: string;
}) => {
  const content = `
    ${heading("It's a Match! 🎉")}
    ${paragraph(`You and <strong>${partnerName}</strong> matched! You can now start planning your trip together.`)}
    ${paragraph("Click below to open the conversation and say hello:")}
    ${button(ctaLink, "Start Chatting")}
  `;

  return emailLayout({
    content,
    previewText: `You matched with ${partnerName}!`,
  });
};
