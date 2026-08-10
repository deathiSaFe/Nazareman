import { prisma } from '@/lib/prisma';

/** Round an average to one decimal place (4.666 → 4.7). */
export function roundAverage(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Aggregate rating stats for a topic. Returns null average when there are no
 * ratings. The stored rating values remain integers 1–5.
 */
export async function getTopicRatingStats(topicId: string): Promise<{
  averageRating: number | null;
  ratingCount: number;
}> {
  const aggregation = await prisma.rating.aggregate({
    where: { topicId },
    _avg: { value: true },
    _count: true,
  });

  const ratingCount = aggregation._count;
  const averageRating =
    ratingCount > 0 && aggregation._avg.value !== null
      ? roundAverage(aggregation._avg.value)
      : null;

  return { averageRating, ratingCount };
}
