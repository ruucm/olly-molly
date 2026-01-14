import { NextRequest, NextResponse } from 'next/server';
import { memberService } from '@/lib/db';

export const dynamic = 'force-static';


export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (id) {
            const member = memberService.getById(id);
            if (!member) {
                return NextResponse.json({ error: 'Member not found' }, { status: 404 });
            }
            return NextResponse.json(member);
        }

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

export async function PATCH(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const body = await request.json();
        const updates: any = {};
        if (body.system_prompt) updates.system_prompt = body.system_prompt;
        if (body.profile_image) updates.profile_image = body.profile_image;
        if (body.is_default !== undefined) updates.is_default = body.is_default;
        if (body.can_generate_images !== undefined) updates.can_generate_images = body.can_generate_images ? 1 : 0;
        if (body.can_log_screenshots !== undefined) updates.can_log_screenshots = body.can_log_screenshots ? 1 : 0;

        memberService.update(id, updates);

        return NextResponse.json(memberService.getById(id));
    } catch (error) {
        console.error('Error updating member:', error);
        return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 });
        }

        const result = memberService.delete(id);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error },
                { status: result.error === 'Member not found' ? 404 : 403 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting member:', error);
        return NextResponse.json({ error: 'Failed to delete member' }, { status: 500 });
    }
}
