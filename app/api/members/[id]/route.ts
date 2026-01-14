import { NextRequest, NextResponse } from 'next/server';
import { memberService } from '@/lib/db';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const member = memberService.getById(id);
        if (!member) {
            return NextResponse.json({ error: 'Member not found' }, { status: 404 });
        }
        return NextResponse.json(member);
    } catch (error) {
        console.error('Error fetching member:', error);
        return NextResponse.json({ error: 'Failed to fetch member' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
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

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
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
