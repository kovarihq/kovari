export interface RegistrationVerificationEmailParams {
  code: string;
}

/**
 * Premium HTML template for registration verification (OTP)
 */
export const registrationVerificationEmail = ({
  code,
}: RegistrationVerificationEmailParams): string => {
  const currentYear = new Date().getFullYear();
  
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
      <h2 style="color: #0f172a; margin-bottom: 16px;">Verify your email</h2>
      <p style="color: #4b5563; line-height: 1.5; margin-bottom: 24px;">
        Welcome to Kovari! Use the following 6-digit code to complete your registration. This code will expire in 15 minutes.
      </p>
      <div style="background: #f8fafc; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #3b82f6;">${code}</span>
      </div>
      <p style="color: #9ca3af; font-size: 14px;">
        If you didn't request this, you can safely ignore this email.
      </p>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #64748b; font-size: 12px; text-align: center;">
        &copy; ${currentYear} Kovari. All rights reserved.
      </p>
    </div>
  `;
};
