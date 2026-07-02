import { emailLayout, button, paragraph, heading } from "./layout";

export const matchInterestEmail = ({
  fromName,
  destinationName,
  ctaLink,
}: {
  fromName: string;
  destinationName: string;
  ctaLink: string;
}) => {
  const content = `
    ${heading("New Match Interest")}
    ${paragraph(`Great news! <strong>${fromName}</strong> is interested in traveling with you to <strong>${destinationName}</strong>.`)}
    ${paragraph("Click below to view their profile and start planning:")}
    ${button(ctaLink, "View Interest")}
  `;

  return emailLayout({
    content,
    previewText: `${fromName} is interested in traveling with you`,
  });
};
