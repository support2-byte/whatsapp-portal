// src/app/api/media/delete/route.ts

import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { createClient } from '@/lib/supabase/server';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!profile?.account_id) {
    return NextResponse.json(
      { error: 'Could not resolve your account.' },
      { status: 403 }
    );
  }

  const { publicId, resourceType } = await request.json();
  if (
    typeof publicId !== 'string' ||
    !publicId.startsWith(`wa-crm/account-${profile.account_id}/`)
  ) {
    return NextResponse.json({ error: 'Not permitted.' }, { status: 403 });
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType ?? 'image',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed.' },
      { status: 500 }
    );
  }
}
