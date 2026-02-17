import nodemailer from 'nodemailer';

const EMAIL_USER = process.env.EMAIL_USER as string;
const EMAIL_PASS = process.env.EMAIL_PASS as string;

// Validate email credentials are configured
if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('⚠️  Warning: EMAIL_USER or EMAIL_PASS environment variables are not configured');
}

export const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

export const sendEmail = async (to: string, subject: string, html: string) => {
    if (!EMAIL_USER || !EMAIL_PASS) {
        throw new Error('Email service is not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.');
    }

    const mailOptions = {
        from: `PairUp <${EMAIL_USER}>`,
        to,
        subject,
        html,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent successfully:', info.messageId);
        return info;
    } catch (error: any) {
        console.error('❌ Failed to send email:', error.message);
        throw error;
    }
};