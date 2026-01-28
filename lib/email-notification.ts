import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

interface EmailConfig {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    fromEmail?: string;
}

function getEmailConfig(): EmailConfig {
    return {
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        fromEmail: process.env.SES_FROM_EMAIL,
    };
}

export function isEmailConfigured(): boolean {
    const config = getEmailConfig();
    return !!(config.region && config.accessKeyId && config.secretAccessKey && config.fromEmail);
}

export function getEmailStatus(): { configured: boolean; fromEmail?: string } {
    const config = getEmailConfig();
    return {
        configured: isEmailConfigured(),
        fromEmail: config.fromEmail,
    };
}

interface SendEmailParams {
    to: string;
    subject: string;
    body: string;
    html?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
    const config = getEmailConfig();

    if (!isEmailConfigured()) {
        return {
            success: false,
            error: 'Email not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and SES_FROM_EMAIL environment variables.',
        };
    }

    const client = new SESClient({
        region: config.region!,
        credentials: {
            accessKeyId: config.accessKeyId!,
            secretAccessKey: config.secretAccessKey!,
        },
    });

    const command = new SendEmailCommand({
        Source: config.fromEmail!,
        Destination: {
            ToAddresses: [params.to],
        },
        Message: {
            Subject: {
                Data: params.subject,
                Charset: 'UTF-8',
            },
            Body: {
                Text: {
                    Data: params.body,
                    Charset: 'UTF-8',
                },
                ...(params.html && {
                    Html: {
                        Data: params.html,
                        Charset: 'UTF-8',
                    },
                }),
            },
        },
    });

    try {
        await client.send(command);
        return { success: true };
    } catch (error) {
        console.error('Failed to send email:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send email',
        };
    }
}

interface TaskCompletedEmailParams {
    to: string;
    agentName: string;
    agentRole: string;
    ticketTitle: string;
    ticketId: string;
    projectName: string;
    commitHash?: string;
}

export async function sendTaskCompletedEmail(params: TaskCompletedEmailParams) {
    const subject = `✅ ${params.agentName} completed: ${params.ticketTitle}`;

    const body = `
Task Completed!

Agent: ${params.agentName} (${params.agentRole})
Ticket: ${params.ticketTitle}
Project: ${params.projectName}
${params.commitHash ? `Commit: ${params.commitHash}` : ''}

The task has been moved to "In Review" status.

---
Sent from Olly Molly - Your AI Development Team
`.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
        .badge { display: inline-block; background: #28a745; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; }
        .info-row { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }
        .label { color: #666; font-size: 12px; text-transform: uppercase; }
        .value { font-weight: 600; color: #333; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 style="margin: 0;">✅ Task Completed!</h1>
        </div>
        <div class="content">
            <div class="badge">In Review</div>

            <div class="info-row">
                <div class="label">Agent</div>
                <div class="value">${params.agentName} (${params.agentRole})</div>
            </div>

            <div class="info-row">
                <div class="label">Ticket</div>
                <div class="value">${params.ticketTitle}</div>
            </div>

            <div class="info-row">
                <div class="label">Project</div>
                <div class="value">${params.projectName}</div>
            </div>

            ${params.commitHash ? `
            <div class="info-row">
                <div class="label">Commit</div>
                <div class="value"><code>${params.commitHash}</code></div>
            </div>
            ` : ''}

            <div class="footer">
                Sent from <strong>Olly Molly</strong> - Your AI Development Team
            </div>
        </div>
    </div>
</body>
</html>
`.trim();

    return sendEmail({
        to: params.to,
        subject,
        body,
        html,
    });
}
