import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import { createClient } from '@/lib/supabase/server';
import {
  buildMediaPath,
  resourceTypeForMime,
  splitMediaPath,
} from '@/lib/storage/cloudinary';

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

  const form = await request.formData();
  const file = form.get('file');
  const subfolder = String(form.get('subfolder') ?? '');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  const fullPath = buildMediaPath(
    profile.account_id as string,
    file.name,
    Date.now(),
    subfolder
  );
  const { folder, publicId } = splitMediaPath(fullPath);
  const resourceType = resourceTypeForMime(file.type || null);
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const result = await cloudinary.uploader.upload(
      `data:${file.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`,
      { public_id: publicId, folder, resource_type: resourceType }
    );
    return NextResponse.json({ publicUrl: result.secure_url, path: fullPath });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed.' },
      { status: 500 }
    );
  }
}
