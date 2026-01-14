import { NextRequest, NextResponse } from 'next/server';
import { ticketService, memberService } from '@/lib/db';

/**
 * PM Agent API - Create tickets with automatic assignment
 * 
 * The PM Agent analyzes the ticket content and automatically assigns
 * it to the most appropriate team member based on keywords and task type.
 */

// Keywords mapping for auto-assignment
const ROLE_KEYWORDS: Record<string, string[]> = {
    FE_DEV: [
        'frontend', 'ui', 'ux', 'react', 'component', 'css', 'style', 'design',
        'button', 'form', 'page', 'layout', 'responsive', 'animation', 'tailwind',
        '프론트엔드', 'UI', '컴포넌트', '디자인', '스타일', '화면', '페이지'
    ],
    BACKEND_DEV: [
        'backend', 'api', 'database', 'db', 'server', 'endpoint', 'rest',
        'authentication', 'auth', 'sql', 'query', 'migration', 'model',
        '백엔드', 'API', '데이터베이스', '서버', '인증'
    ],
    QA: [
        'test', 'testing', 'qa', 'quality', 'bug', 'fix', 'verify', 'validation',
        'e2e', 'integration', 'unit test', 'playwright', 'automation',
        '테스트', 'QA', '버그', '검증', '품질'
    ],
    DEVOPS: [
        'deploy', 'deployment', 'ci', 'cd', 'pipeline', 'docker', 'kubernetes',
        'infrastructure', 'monitoring', 'logging', 'aws', 'cloud', 'server',
        '배포', '인프라', '파이프라인', '모니터링'
    ],
};

function analyzeAndAssign(title: string, description?: string): string | null {
    const text = `${title} ${description || ''}`.toLowerCase();

    // Count keyword matches for each role
    const scores: Record<string, number> = {
        FE_DEV: 0,
        BACKEND_DEV: 0,
        QA: 0,
        DEVOPS: 0,
    };

    for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
        for (const keyword of keywords) {
            if (text.includes(keyword.toLowerCase())) {
                scores[role] += 1;
            }
        }
    }

    // Find the role with highest score
    let maxScore = 0;
    let assignedRole: string | null = null;

    for (const [role, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            assignedRole = role;
        }
    }

    // If no clear match, default to FE_DEV for general tasks
    if (maxScore === 0) {
        assignedRole = 'FE_DEV';
    }

    // Get the member with this role
    const member = memberService.getByRole(assignedRole!);
    return member?.id || null;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.title) {
            return NextResponse.json(
                { error: 'Title is required' },
                { status: 400 }
            );
        }

        // Get PM member
        const pmMember = memberService.getByRole('PM');

        // Auto-assign based on content analysis
        let assigneeId = body.assignee_id;
        let autoAssigned = false;

        if (!assigneeId && body.auto_assign !== false) {
            assigneeId = analyzeAndAssign(body.title, body.description);
            autoAssigned = true;
        }

        // Create ticket with PM as creator
        const ticket = ticketService.create({
            title: body.title,
            description: body.description,
            priority: body.priority || 'MEDIUM',
            assignee_id: assigneeId,
            created_by: pmMember?.id,
        });

        // Get assignee info for response
        const assignee = assigneeId ? memberService.getById(assigneeId) : null;

        return NextResponse.json({
            ...ticket,
            assignee,
            auto_assigned: autoAssigned,
            created_by_pm: true,
        }, { status: 201 });
    } catch (error) {
        console.error('Error in PM create ticket:', error);
        return NextResponse.json(
            { error: 'Failed to create ticket' },
            { status: 500 }
        );
    }
}

// GET endpoint to get PM agent info and capabilities
export async function GET() {
    try {
        const pmMember = memberService.getByRole('PM');
        const allMembers = memberService.getAll();

        return NextResponse.json({
            pm: pmMember,
            team: allMembers.filter(m => m.role !== 'PM'),
            capabilities: {
                auto_assignment: true,
                supported_roles: Object.keys(ROLE_KEYWORDS),
                keywords: ROLE_KEYWORDS,
            },
        });
    } catch (error) {
        console.error('Error fetching PM info:', error);
        return NextResponse.json(
            { error: 'Failed to fetch PM info' },
            { status: 500 }
        );
    }
}
