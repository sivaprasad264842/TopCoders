import nodemailer from "nodemailer";
import { Resend } from "resend";
import { optionalEnv } from "./env.js";

const FROM = process.env.EMAIL_FROM || "TopCoders <support@topcoders.online>";
let resend;
let smtp;

/**
 * Sends an email through the first configured provider:
 *   1. Resend (RESEND_API_KEY)   - production
 *   2. Gmail SMTP (EMAIL_USER + EMAIL_PASS)
 *   3. Development only: prints the email to the console
 */
const sendEmail = async ({ to, subject, html, text }) => {
    const resendKey = optionalEnv("RESEND_API_KEY");
    const smtpUser = optionalEnv("EMAIL_USER");
    const smtpPass = optionalEnv("EMAIL_PASS");

    if (resendKey) {
        resend ??= new Resend(resendKey);
        // Resend reports failures in the result instead of throwing.
        const { error } = await resend.emails.send({ from: FROM, to, subject, html, text });
        if (error) throw new Error(`Email provider error: ${error.message}`);
        return;
    }

    if (smtpUser && smtpPass) {
        smtp ??= nodemailer.createTransport({
            service: "gmail",
            auth: { user: smtpUser, pass: smtpPass },
        });
        await smtp.sendMail({ from: smtpUser, to, subject, html, text });
        return;
    }

    if (process.env.NODE_ENV !== "production") {
        console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n${text}\n`);
        return;
    }

    throw new Error("No email provider configured (set RESEND_API_KEY).");
};

export default sendEmail;
