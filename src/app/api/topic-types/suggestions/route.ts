import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizePersian, suggestionScore } from '@/lib/persian-text';

export const dynamic = 'force-dynamic';

const MAX_SUGGESTIONS = 6;
const MIN_SCORE = 0.55;

/**
 * GET /api/topic-types/suggestions?q=…
 * Approved topic-type labels that best match the query (fuzzy, top N).
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';

    if (!query) {
      return NextResponse.json({ suggestions: [] });
    }

    const normalized = normalizePersian(query);

    const labels = await prisma.topicTypeSuggestion.findMany({
      where: { status: 'APPROVED' },
      select: { id: true, label: true },
    });

    const suggestions = labels
      .map((suggestion) => ({
        id: suggestion.id,
        label: suggestion.label,
        score: suggestionScore(normalized, suggestion.label),
      }))
      .filter((suggestion) => suggestion.score >= MIN_SCORE)
      .sort(
        (a, b) =>
          b.score - a.score || a.label.length - b.label.length || a.label.localeCompare(b.label)
      )
      .slice(0, MAX_SUGGESTIONS)
      .map(({ id, label }) => ({ id, label }));

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Failed to fetch topic type suggestions:', error);

    return NextResponse.json(
      { error: 'Failed to fetch topic type suggestions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/topic-types/suggestions
 * Record a user-entered topic type as a PENDING_REVIEW suggestion for admin
 * review. Existing labels keep their current status; brand-new labels start
 * PENDING_REVIEW and are NOT added to the canonical (approved) pool.
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const label = typeof data.label === 'string' ? data.label.trim() : '';

  if (!label) {
    return NextResponse.json({ error: 'label is required.' }, { status: 400 });
  }

  if (label.length > 60) {
    return NextResponse.json(
      { error: 'label must be 60 characters or fewer.' },
      { status: 400 }
    );
  }

  try {
    const suggestion = await prisma.topicTypeSuggestion.upsert({
      where: { label },
      update: {},
      create: { label, status: 'PENDING_REVIEW' },
      select: { id: true, label: true, status: true },
    });

    return NextResponse.json(suggestion, {
      status: suggestion.status === 'PENDING_REVIEW' ? 201 : 200,
    });
  } catch (error) {
    console.error('Failed to save topic type suggestion:', error);

    return NextResponse.json(
      { error: 'Failed to save topic type suggestion.' },
      { status: 500 }
    );
  }
}
