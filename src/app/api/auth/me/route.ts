import { NextResponse } from 'next/server';
import { getCurrentUser, publicUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user: user ? publicUser(user) : null });
}
