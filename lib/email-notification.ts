import crypto from 'crypto';

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

// AWS Signature Version 4 implementation
function hmac(key: Buffer | string, data: string): Buffer {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256(data: string): string {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
    const kDate = hmac('AWS4' + secretKey, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    return kSigning;
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

    const region = config.region!;
    const accessKeyId = config.accessKeyId!;
    const secretAccessKey = config.secretAccessKey!;
    const fromEmail = config.fromEmail!;

    // Build SES API request body
    const formParams = new URLSearchParams();
    formParams.append('Action', 'SendEmail');
    formParams.append('Source', fromEmail);
    formParams.append('Destination.ToAddresses.member.1', params.to);
    formParams.append('Message.Subject.Data', params.subject);
    formParams.append('Message.Subject.Charset', 'UTF-8');
    formParams.append('Message.Body.Text.Data', params.body);
    formParams.append('Message.Body.Text.Charset', 'UTF-8');
    if (params.html) {
        formParams.append('Message.Body.Html.Data', params.html);
        formParams.append('Message.Body.Html.Charset', 'UTF-8');
    }
    formParams.append('Version', '2010-12-01');

    const requestBody = formParams.toString();
    const host = `email.${region}.amazonaws.com`;
    const endpoint = `https://${host}/`;
    const service = 'ses';
    const method = 'POST';

    // Create date strings
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    // Create canonical request
    const canonicalUri = '/';
    const canonicalQueryString = '';
    const contentType = 'application/x-www-form-urlencoded';
    const payloadHash = sha256(requestBody);

    const canonicalHeaders = [
        `content-type:${contentType}`,
        `host:${host}`,
        `x-amz-date:${amzDate}`,
    ].join('\n') + '\n';

    const signedHeaders = 'content-type;host;x-amz-date';

    const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');

    // Create string to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        sha256(canonicalRequest),
    ].join('\n');

    // Calculate signature
    const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = hmac(signingKey, stringToSign).toString('hex');

    // Create authorization header
    const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': contentType,
                'X-Amz-Date': amzDate,
                'Authorization': authorizationHeader,
            },
            body: requestBody,
        });

        const responseText = await response.text();

        if (response.ok) {
            return { success: true };
        } else {
            // Parse error from XML response
            const errorMatch = responseText.match(/<Message>(.*?)<\/Message>/);
            const errorMessage = errorMatch ? errorMatch[1] : `HTTP ${response.status}`;
            console.error('SES API error:', responseText);
            return { success: false, error: errorMessage };
        }
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
    const subject = `[Olly Molly] ${params.agentName} completed: ${params.ticketTitle}`;

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
            <h1 style="margin: 0;">Task Completed!</h1>
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
