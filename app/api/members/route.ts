import { NextResponse } from 'next/server';
import { memberService } from '@/lib/db';

export async function GET() {
    try {
        const members = memberService.getAll();
        return NextResponse.json(members);
    } catch (error) {
        console.error('Error fetching members:', error);
        return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { role, name, avatar, system_prompt, can_generate_images, can_log_screenshots } = body;

        // Validation
        if (!role || !name || !system_prompt) {
            return NextResponse.json(
                { error: 'Missing required fields: role, name, system_prompt' },
                { status: 400 }
            );
        }

        const newMember = memberService.create({
            role,
            name,
            avatar,
            system_prompt,
            can_generate_images: can_generate_images === true || can_generate_images === 1,
            can_log_screenshots: can_log_screenshots === true || can_log_screenshots === 1
        });
        return NextResponse.json(newMember, { status: 201 });
    } catch (error) {
        console.error('Error creating member:', error);
        return NextResponse.json({ error: 'Failed to create member' }, { status: 500 });
    }
}
