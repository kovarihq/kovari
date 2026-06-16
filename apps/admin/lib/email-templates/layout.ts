
export interface EmailLayoutProps {
  content: string;
  previewText?: string;
  hideLogo?: boolean;
}

export const emailLayout = ({ content, previewText, hideLogo = false }: EmailLayoutProps): string => {
  return `
<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <meta charset="utf-8">
    <meta name="x-apple-disable-message-reformatting">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
    <!--[if mso]>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
    <style>
      td,th,div,p,a,h1,h2,h3,h4,h5,h6 {font-family: "Segoe UI", sans-serif; mso-line-height-rule: exactly;}
    </style>
    <![endif]-->
    <title>${previewText || 'Kovari'}</title>
    <style>
      /* 
       * NOTE: Most email clients (Gmail, Outlook) strip custom web fonts.
       * For consistent branding across all clients, replace the text logo below with an image:
       * <img src="https://your-domain.com/logo.png" alt="Kovari" width="120" style="display: block; width: 120px; max-width: 100%; height: auto;">
       */
      @font-face {
        font-family: 'Clash Display';
        src: url('https://cdn.fontshare.com/wf/2GQIT54GKQY3JRFTSHS4ARTRNRQISSAA/3CIP5EBHRRHE5FVQU3VFROPUERNDSTDF/JTSL5QESUXATU47LCPUNHZQBDDIWDOSW.woff2') format('woff2'),
             url('https://cdn.fontshare.com/wf/2GQIT54GKQY3JRFTSHS4ARTRNRQISSAA/3CIP5EBHRRHE5FVQU3VFROPUERNDSTDF/JTSL5QESUXATU47LCPUNHZQBDDIWDOSW.woff') format('woff'),
             url('https://cdn.fontshare.com/wf/2GQIT54GKQY3JRFTSHS4ARTRNRQISSAA/3CIP5EBHRRHE5FVQU3VFROPUERNDSTDF/JTSL5QESUXATU47LCPUNHZQBDDIWDOSW.ttf') format('truetype');
        font-weight: 500;
        font-display: swap;
        font-style: normal;
      }

      /* Reset */
      body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
      
      /* Typography */
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'; }
      
      /* Utilities */
      .hover-bg-primary-dark:hover { background-color: #111827 !important; }
      
      /* Mobile */
      @media screen and (max-width: 600px) {
        .email-container { width: 100% !important; margin: 0 auto; }
        .fluid-img { width: 100% !important; max-width: 100% !important; height: auto !important; }
        .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; direction: ltr !important; }
        .stack-column-center { display: block !important; width: 100% !important; max-width: 100% !important; text-align: center !important; direction: ltr !important; }
        .center-on-mobile { text-align: center !important; }
        .padding-mobile { padding: 24px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; word-spacing: normal; background-color: #f9fafb;">
    ${previewText ? `<div style="display: none; max-height: 0px; overflow: hidden;">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>` : ''}
    
    <div role="article" aria-roledescription="email" lang="en" style="text-size-adjust: 100%; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #f9fafb;">
      <table role="presentation" style="width: 100%; border: none; border-spacing: 0;">
        <tr>
          <td align="center" style="padding: 40px 0;">
            <!--[if mso]>
            <table role="presentation" align="center" style="width:600px;">
            <tr>
            <td>
            <![endif]-->
            <div class="email-container" style="max-width: 600px; margin: 0 auto;">
              
              ${!hideLogo ? `
              <!-- Header / Logo -->
              <table role="presentation" style="width: 100%; border: none; border-spacing: 0;">
                <tr>
                  <td align="center" style="padding: 0 0 24px; text-align: center;">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://kovari.in'}" style="text-decoration: none; display: inline-block;">
                      <img src="https://res.cloudinary.com/ds8vth6ci/image/upload/assets/kovari_email_logo_png.png" alt="Kovari" width="100" style="display: block; width: 100px; max-width: 100%; height: auto; outline: none; border: none; text-decoration: none;">
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Main Card -->
              <div style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); overflow: hidden;">
                <table role="presentation" style="width: 100%; border: none; border-spacing: 0;">
                  <tr>
                    <td class="padding-mobile" style="padding: 40px;">
                      ${content}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Footer -->
              <table role="presentation" style="width: 100%; border: none; border-spacing: 0;">
                <tr>
                  <td style="padding: 32px 20px; text-align: center; color: #6b7280; font-size: 12px; line-height: 18px;">
                    <p style="margin: 0 0 8px;">&copy; ${new Date().getFullYear()} Kovari. All rights reserved.</p>
                  </td>
                </tr>
              </table>

            </div>
            <!--[if mso]>
            </td>
            </tr>
            </table>
            <![endif]-->
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>
  `;
};

// Reusable components for inside content
export const button = (url: string, text: string) => `
  <table role="presentation" style="margin: 32px auto; border: none; border-spacing: 0;">
    <tr>
      <td align="center" style="background-color: #000000; border-radius: 9999px;">
        <a href="${url}" style="display: inline-block; padding: 12px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 9999px; background-color: #000000; border: 1px solid #000000;">${text}</a>
      </td>
    </tr>
  </table>
`;

export const paragraph = (text: string) => `
  <p style="margin: 0 0 24px; font-size: 16px; line-height: 26px; color: #374151;">${text}</p>
`;

export const heading = (text: string) => `
  <h1 style="margin: 0 0 24px; font-size: 18px; font-weight: 500; color: #111827; letter-spacing: -0.5px; text-align: center;">${text}</h1>
`;

export const smallText = (text: string) => `
  <p style="margin: 0; font-size: 14px; line-height: 22px; color: #374151; text-align: center;">${text}</p>
`;

export const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
};
