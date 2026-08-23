'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BubbleIcon, CheckIcon, HeartIcon, PenIcon, PlusIcon, TrashIcon, UserIcon, XIcon } from '@/components/icons';
import { ContactIcon } from '@/components/contact-icons';
import { ActivityAreaPicker } from '@/components/add-topic/ActivityAreaPicker';
import { TopicTypesField } from '@/components/add-topic/TopicTypesField';
import { CommentComposer } from '@/components/topic/CommentComposer';
import { ReplyForm } from '@/components/topic/ReplyForm';
import { StarRow } from '@/components/topic/RatingStars';
import { OwnershipRequestPanel } from '@/components/ownership/OwnershipRequestPanel';
import { OnboardingPopup } from '@/components/page/OnboardingPopup';
import { SuggestionPanel } from '@/components/suggestion/SuggestionPanel';
import { toPersianDecimal, toPersianDigits } from '@/lib/persian-digits';
import {
  CONTACT_PLATFORM_LABELS,
  type ActivityAreaValue,
  type ContactPlatform,
  type PageData,
  type SelectedTopicType,
} from '@/types/topic';

interface PageViewProps {
  page: PageData;
  /** Show the inline contribution editors (image/intro/hours/contact/social/address
   *  and, for the creator, identity). True for the verified creator of an
   *  editable page and for admins. */
  editable?: boolean;
  /** Whether the viewer (creator) may submit the page for review. */
  canSubmit?: boolean;
  /** The admin's decision note for CHANGES_REQUESTED / REJECTED pages. */
  decisionNote?: string | null;
  /** Whether the viewer may submit a suggestion (verified user on an APPROVED page). */
  canSuggest?: boolean;
  /** Whether the viewer may submit a new comment (signed-in + phone-verified). */
  canComment?: boolean;
  /** Whether the viewer may reply to comments (signed-in + phone-verified). */
  canReply?: boolean;
  /** Rating/favorite state (APPROVED topics; viewer-scoped). */
  averageRating?: number | null;
  ratingCount?: number;
  myRating?: number | null;
  isFavorited?: boolean;
  canRate?: boolean;
  canFavorite?: boolean;
  /** Ownership-request state (APPROVED topics; viewer-scoped). */
  canRequestOwnership?: boolean;
  viewerIsOwner?: boolean;
  myOwnershipRequest?: {
    id: string;
    status: 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED';
    decisionNote: string | null;
  } | null;
  /** Whether the viewer already left a comment on this page. */
  hasCommented?: boolean;
  /** Admin mode: additionally exposes identity editing, publish controls and
   *  inline moderation. */
  admin?: boolean;
  /** Intent carried back after quick verification, e.g. `comment`, `rating`,
   *  `favorite`, `suggestion`, `ownership`. Auto-opens/focuses that action. */
  initialAction?: string | null;
}

const SOCIAL_PLATFORMS = (
  Object.keys(CONTACT_PLATFORM_LABELS) as ContactPlatform[]
).filter((platform) => platform !== 'WEBSITE' && platform !== 'PHONE');

type DraftLink = { platform: ContactPlatform; label: string | null; value: string };

const inputClass =
  'w-full rounded-2xl bg-white px-4 py-3 text-[15px] font-medium text-ink-900 outline-none ring-1 ring-ink-900/10 transition-all duration-200 placeholder:font-normal placeholder:text-ink-900/30 focus:ring-2 focus:ring-turquoise-600/70';

/** Compact Persian date for a comment timestamp. */
function formatCommentDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/** Session key that remembers the onboarding popup was dismissed this session. */
const onboardingDismissedKey = (topicId: string) => `nazareman_onboarding_dismissed_${topicId}`;

/** sessionStorage doesn't emit same-tab events; an empty subscription suffices. */
function subscribeSessionStorage(): () => void {
  return () => {};
}

/** Whether the onboarding popup was dismissed in this tab session. */
function readOnboardingDismissed(topicId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.sessionStorage.getItem(onboardingDismissedKey(topicId)));
  } catch {
    return false;
  }
}

/** A compact, inviting add-action — used for empty sections. */
function CompactInvite({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-ink-900/20 bg-white/50 px-3 py-2.5 text-sm font-semibold text-ink-500 transition-colors hover:border-turquoise-600/50 hover:text-turquoise-700"
    >
      <PlusIcon strokeWidth={2.4} className="size-4 shrink-0" />
      {label}
    </button>
  );
}

function InlineEditor({
  onSave,
  onCancel,
  saving,
  saveLabel = 'ذخیره',
  children,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  saveLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-turquoise-50/60 p-4 ring-1 ring-turquoise-600/20">
      {children}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-turquoise-600 px-5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-turquoise-700 disabled:opacity-50"
        >
          {saving ? 'در حال ذخیره...' : saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-full bg-white px-5 py-2 text-[13px] font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5 disabled:opacity-50"
        >
          انصراف
        </button>
      </div>
    </div>
  );
}

/** Icon-only edit trigger (pen), placed on the left (end) of a row/section. */
function EditButton({ label, onClick, className = '' }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-7 shrink-0 place-items-center rounded-full text-ink-900/40 transition-colors hover:bg-ink-900/5 hover:text-ink-900/70 ${className}`}
    >
      <PenIcon strokeWidth={2.2} className="size-3.5" />
    </button>
  );
}

/** One compact information row: label on the right, value, edit action on the left. */
function InfoRow({
  label,
  value,
  muted = false,
  edit,
  onEdit,
}: {
  label: string;
  value: string;
  muted?: boolean;
  edit?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="shrink-0 text-[13px] font-medium text-ink-500">{label}</dt>
      <dd
        className={`min-w-0 flex-1 break-words text-end text-[14px] font-semibold ${
          muted ? 'font-medium text-ink-400' : 'text-ink-900'
        }`}
      >
        {value}
      </dd>
      {edit && onEdit && <EditButton label={`ویرایش ${label}`} onClick={onEdit} />}
    </div>
  );
}

/** One compact contact row: icon, label, value, then edit + remove on the left. */
function ContactRow({
  icon,
  label,
  value,
  href,
  onEdit,
  onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span aria-hidden className="grid w-6 shrink-0 place-items-center text-ink-500">
        {icon}
      </span>
      {label && <span className="shrink-0 text-[13px] font-medium text-ink-500">{label}</span>}
      <span dir="ltr" className="min-w-0 flex-1 break-words text-end text-[14px] font-semibold text-ink-900">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-turquoise-700 underline-offset-4 hover:underline"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </span>
      {onEdit && <EditButton label={`ویرایش ${label || 'تماس'}`} onClick={onEdit} />}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`حذف ${label || 'تماس'}`}
          className="grid size-7 shrink-0 place-items-center rounded-full text-ink-900/40 transition-colors hover:bg-ink-900/5 hover:text-ink-900/70"
        >
          <XIcon strokeWidth={2.4} className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function PageView({ page, editable = true, canSubmit = false, decisionNote = null, canSuggest = false, canComment = true, canReply = false, hasCommented = false, averageRating = null, ratingCount = 0, myRating = null, isFavorited = false, canRate = false, canFavorite = false, canRequestOwnership = false, viewerIsOwner = false, myOwnershipRequest = null, admin = false, initialAction = null }: PageViewProps) {
  const [name, setName] = useState(page.name);
  const [description, setDescription] = useState(page.description ?? '');
  const [workingHours, setWorkingHours] = useState(page.workingHours ?? '');
  const [imageUrl, setImageUrl] = useState(page.imageUrl ?? '');
  const [address, setAddress] = useState(page.address ?? '');
  const [types, setTypes] = useState<SelectedTopicType[]>(
    page.types.map((type) => ({ label: type.label, kind: type.kind }))
  );
  const [activity, setActivity] = useState<ActivityAreaValue>({
    scope: page.scope,
    provinceSlug: page.province?.slug,
    provinceName: page.province?.name,
    citySlug: page.city?.slug,
    cityName: page.city?.name,
    address: page.address ?? undefined,
  });
  const [links, setLinks] = useState<DraftLink[]>(
    page.links.map((link) => ({ platform: link.platform, label: link.label ?? null, value: link.value }))
  );
  const [comments, setComments] = useState(page.comments);
  const [status, setStatus] = useState(page.status);
  const [pendingTypes, setPendingTypes] = useState(
    page.types
      .filter(
        (type): type is typeof type & { suggestionId: string } =>
          type.suggestionStatus === 'PENDING_REVIEW' && Boolean(type.suggestionId)
      )
      .map((type) => ({ id: type.suggestionId, label: type.label }))
  );

  // Editor toggles
  const [imageOpen, setImageOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);

  // Admin decision note (reason for reject / message for request-changes).
  const [adminNote, setAdminNote] = useState('');

  // Suggestion drawer for APPROVED pages.
  const [suggestOpen, setSuggestOpen] = useState(false);

  // Ownership request panel for APPROVED pages.
  const [ownershipOpen, setOwnershipOpen] = useState(false);

  const router = useRouter();

  // Rating + favorite local state (mirrors the server values). `commentRating`
  // is the ONE shared rating selection used by the comment composer, so there
  // is never a second, independent rating.
  const [averageRatingState, setAverageRatingState] = useState<number | null>(averageRating);
  const [ratingCountState, setRatingCountState] = useState(ratingCount);
  const [commentRating, setCommentRating] = useState<number>(myRating ?? 0);
  const [isFavoritedState, setIsFavoritedState] = useState(isFavorited);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [focusCommentNonce, setFocusCommentNonce] = useState(0);
  const [commentComposerOpen, setCommentComposerOpen] = useState(false);

  /** Session key that remembers a star picked right before quick verification,
   *  so the intended rating can be applied once the user returns. */
  const intendedRatingKey = `nazareman_intended_rating_${page.id}`;

  /** Send a verified/authenticated user through the shared quick verification
   *  flow, returning to this page to continue the intended action. When a
   *  rating is included, it is stashed so it can be applied after returning. */
  function requireVerify(action: string, rating?: number) {
    if (rating !== undefined) {
      try {
        window.sessionStorage.setItem(intendedRatingKey, String(rating));
      } catch {
        // ignore — the return-intent simply continues without a stashed rating.
      }
    }
    const next = `/topic/${page.id}?action=${action}`;
    router.push(`/login?next=${encodeURIComponent(next)}`);
  }

  /** Read and clear a stashed pre-verification rating for this topic. */
  function readIntendedRating(): number | null {
    try {
      const raw = window.sessionStorage.getItem(intendedRatingKey);
      window.sessionStorage.removeItem(intendedRatingKey);
      if (raw === null) return null;
      const value = Number(raw);
      return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
    } catch {
      return null;
    }
  }

  /** Open the comment composer overlay and focus its textarea. */
  function openComposer() {
    setCommentComposerOpen(true);
    setFocusCommentNonce((n) => n + 1);
  }

  /** «ثبت نظر» — verified users open the composer (the composer enforces the
   *  mandatory star rating); everyone else goes through the existing quick
   *  verification flow first. */
  function handleCommentClick() {
    if (canRate) {
      openComposer();
    } else {
      requireVerify('comment');
    }
  }

  async function handleRate(value: number) {
    if (!canRate || ratingBusy) return;
    setRatingBusy(true);
    clearFeedback();

    // Keep the single rating selection in sync immediately.
    setCommentRating(value);

    try {
      const response = await fetch(`/api/topics/${page.id}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? 'ثبت امتیاز ممکن نشد.');
        return;
      }

      setAverageRatingState(payload?.averageRating ?? null);
      setRatingCountState(payload?.ratingCount ?? ratingCountState);

      // Encourage commenting: after choosing a rating, open the composer so the
      // user can immediately write their experience — never scroll past the
      // existing comments.
      if (!hasCommented && canComment && !commentSubmitted) {
        openComposer();
      }
    } catch {
      setError('ثبت امتیاز ممکن نشد.');
    } finally {
      setRatingBusy(false);
    }
  }

  async function handleToggleFavorite() {
    if (!canFavorite) return;
    clearFeedback();

    try {
      const response = isFavoritedState
        ? await fetch(`/api/favorites/${page.id}`, { method: 'DELETE' })
        : await fetch('/api/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicId: page.id }),
          });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? 'عملیات علاقه‌مندی ممکن نشد.');
        return;
      }

      setIsFavoritedState((current) => !current);
    } catch {
      setError('عملیات علاقه‌مندی ممکن نشد.');
    }
  }

  // Continue the intended action after quick verification (the topic page
  // re-renders server-side with the action query param once the user is back).
  // State updates are deferred so the effect body stays side-effect free.
  useEffect(() => {
    if (!initialAction) return;

    const timer = window.setTimeout(() => {
      if (initialAction === 'favorite' && canFavorite && !isFavoritedState) {
        void handleToggleFavorite();
      } else if (initialAction === 'suggestion' && canSuggest) {
        setSuggestOpen(true);
      } else if (initialAction === 'ownership' && canRequestOwnership) {
        setOwnershipOpen(true);
      } else if (initialAction === 'comment' && canRate) {
        openComposer();
      } else if (initialAction === 'rating' && canRate) {
        // Apply a star picked right before verification, when one was stashed.
        const intended = readIntendedRating();
        if (intended !== null && intended !== myRating) {
          void handleRate(intended);
        }
        document.getElementById('page-hero')?.scrollIntoView({ behavior: 'smooth' });
      }
    }, 0);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction]);

  // Once a comment is submitted, replace the form with the «already commented»
  // state immediately (the server enforces the one-contribution-per-topic rule).
  const [commentSubmitted, setCommentSubmitted] = useState(false);

  // Which top-level comment the reply form is currently open for.
  const [replyingToId, setReplyingToId] = useState<string | null>(null);

  // Contact editor (add or edit one row)
  const [contactDraft, setContactDraft] = useState<{ platform: ContactPlatform; label: string; value: string }>({
    platform: 'PHONE',
    label: '',
    value: '',
  });
  const [contactEditIndex, setContactEditIndex] = useState<number | null>(null);
  const [contactAddOpen, setContactAddOpen] = useState(false);

  // One-time onboarding nudge for a newly-created DRAFT page: it encourages
  // the creator to complete the info and leave the first comment. It is skipped
  // when the page is already complete, and dismissal is remembered in
  // sessionStorage so it does not reappear during the same editing session.
  // `useSyncExternalStore` keeps this SSR-safe (the server snapshot is «not
  // dismissed»), so no hydration mismatch occurs.
  const onboardingAlreadyComplete = (() => {
    const showAddress = page.scope !== 'NATIONAL';
    return (
      Boolean(page.imageUrl) &&
      Boolean(page.description?.trim()) &&
      Boolean(page.workingHours?.trim()) &&
      (Boolean(page.address?.trim()) || !showAddress) &&
      page.links.length > 0 &&
      page.comments.length > 0
    );
  })();
  const onboardingDismissed = useSyncExternalStore(
    subscribeSessionStorage,
    () => readOnboardingDismissed(page.id),
    () => false
  );
  const [onboardingDismissedNow, setOnboardingDismissedNow] = useState(false);
  const onboardingOpen =
    !admin && page.status === 'DRAFT' && !onboardingAlreadyComplete && !onboardingDismissed && !onboardingDismissedNow;

  function dismissOnboarding() {
    setOnboardingDismissedNow(true);
    try {
      window.sessionStorage.setItem(onboardingDismissedKey(page.id), '1');
    } catch {
      // ignore — the popup simply stays dismissed for this render session.
    }
  }

  // Final submission
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Introduction clamp/expand
  const introRef = useRef<HTMLParagraphElement>(null);
  const [introExpanded, setIntroExpanded] = useState(false);
  const [introCanExpand, setIntroCanExpand] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Admin comment editing
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditBody, setCommentEditBody] = useState('');

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [message]);

  // The success screen replaces the page content; make sure it opens at the top
  // so the user immediately sees the success message/header. Run after layout so
  // it survives any scroll-anchoring or browser scroll restoration.
  useEffect(() => {
    if (!submitted) return;
    const raf = requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    return () => cancelAnimationFrame(raf);
  }, [submitted]);

  useEffect(() => {
    if (introExpanded || !introRef.current) return;
    setIntroCanExpand(introRef.current.scrollHeight > introRef.current.clientHeight + 1);
  }, [description, introExpanded]);

  const secondaryTypes = types.slice(1);
  const showAddressBlock = activity.scope !== 'NATIONAL';

  const serviceAreaLabel = (() => {
    switch (activity.scope) {
      case 'PROVINCE':
        return `استان ${activity.provinceName ?? ''}`.trim();
      case 'CITY':
      case 'ADDRESS':
        return `شهر ${activity.cityName ?? ''}`.trim();
      case 'NATIONAL':
      default:
        return 'سراسر کشور';
    }
  })();

  const addressLabel = address
    ? [activity.provinceName, activity.cityName, address].filter(Boolean).join('، ')
    : null;

  // Contact rows ordered for a compact directory: phones → website → social.
  const orderedLinks = links
    .map((link, index) => ({ link, index }))
    .sort((a, b) => {
      const rank = (platform: ContactPlatform) =>
        platform === 'PHONE' ? 0 : platform === 'WEBSITE' ? 1 : 2;
      return rank(a.link.platform) - rank(b.link.platform) || a.index - b.index;
    });

  const contactLabel = (link: DraftLink): string => {
    if (link.platform === 'PHONE') return link.label ?? '';
    if (link.platform === 'WEBSITE') return link.label ?? CONTACT_PLATFORM_LABELS.WEBSITE;
    return CONTACT_PLATFORM_LABELS[link.platform];
  };

  const contactHref = (link: DraftLink): string | undefined => {
    if (link.platform === 'PHONE') return `tel:${link.value}`;
    if (link.platform === 'WEBSITE') {
      return /^https?:\/\//i.test(link.value) ? link.value : `https://${link.value}`;
    }
    return undefined;
  };

  // ——— Final review/submission ———
  // The submit-for-review action is available to the creator only while the
  // page is DRAFT, CHANGES_REQUESTED or REJECTED — never while under review or
  // approved.
  const showSendButton = Boolean(canSubmit && !submitted && status !== 'APPROVED');

  function handleCommentSubmitted(comment: {
    id: string;
    body: string;
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    authorName?: string | null;
  }) {
    setComments((prev) => [
      ...prev,
      // The freshly submitted comment joins the review list immediately (it is
      // still pending moderation server-side). Its rating is the selection the
      // composer used — the same shared rating state — and the author name
      // comes from the server so «علی» never shows as «کاربر».
      {
        ...comment,
        authorName: comment.authorName ?? null,
        rating: commentRating || null,
        isReply: false,
      },
    ]);
    // A user may only comment once per topic, so a successful submission marks
    // the «اولین نظر» step complete and the bar moves to the final review step
    // (derived from `comments.length`). The composer closes so the user lands
    // back on the page with the fresh comment in place.
    setCommentSubmitted(true);
    setCommentComposerOpen(false);
  }

  function handleReplySubmitted(reply: {
    id: string;
    body: string;
    status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
    createdAt: string;
    parentId: string;
  }) {
    setComments((prev) => [...prev, reply]);
  }

  /** One comment or reply card (replies are indented and labelled). The
   *  author name lives in the group header for top-level comments; replies
   *  show their own name inline. Each comment shows its author's rating. */
  function renderCommentCard(comment: (typeof comments)[number], isReply: boolean) {
    const isPending = comment.status === 'PENDING_REVIEW';
    const isEditing = editingCommentId === comment.id;

    return (
      <article
        className={`py-3 ${isPending ? 'border-s-4 border-red-400 ps-3' : ''} ${isReply ? 'ps-3' : ''}`}
      >
        {admin && isEditing ? (
          <div>
            <textarea
              value={commentEditBody}
              onChange={(event) => setCommentEditBody(event.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => void moderateComment(comment.id, { body: commentEditBody.trim() })}
                className="rounded-full bg-turquoise-600 px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-turquoise-700"
              >
                ذخیره
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingCommentId(null);
                  setCommentEditBody('');
                }}
                className="rounded-full bg-white px-5 py-2 text-xs font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5"
              >
                انصراف
              </button>
            </div>
          </div>
        ) : (
          <>
            {isReply && (comment.authorName || comment.isOwner) && (
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[11px] font-medium text-ink-400">پاسخ</span>
                <span className="text-[12px] font-bold text-ink-600">
                  {comment.authorName || 'کاربر'}
                </span>
                {comment.isOwner && (
                  <span className="rounded-full bg-turquoise-600/10 px-2.5 py-0.5 text-[10px] font-bold text-turquoise-700">
                    مالک صفحه
                  </span>
                )}
              </div>
            )}

            {/* Author rating + timestamp — the review metadata line. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {comment.rating ? (
                <StarRow value={comment.rating} className="text-[12px] leading-none" />
              ) : null}
              {comment.createdAt && (
                <span className="text-[11px] text-ink-400">
                  {formatCommentDate(comment.createdAt)}
                </span>
              )}
            </div>

            <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-7 text-ink-800">
              {comment.body}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {/* Like/dislike are visual-only controls for now — no votes,
                  no persistence, no ordering changes. */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="پسندیدن"
                  className="grid size-7 place-items-center rounded-full text-[13px] leading-none text-ink-400 transition-colors hover:bg-ink-900/5"
                >
                  👍
                </button>
                <button
                  type="button"
                  aria-label="نپسندیدن"
                  className="grid size-7 place-items-center rounded-full text-[13px] leading-none text-ink-400 transition-colors hover:bg-ink-900/5"
                >
                  👎
                </button>
              </div>

              {/* Moderation status badges are admin-only — public viewers must
                  not see «تأیید شد» / moderation states on comments. */}
              {admin && comment.status === 'PENDING_REVIEW' && (
                <span className="rounded-full bg-red-600/10 px-2.5 py-0.5 text-[12px] font-bold text-red-700">
                  در انتظار بررسی
                </span>
              )}
              {admin && comment.status === 'APPROVED' && (
                <span className="rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-[12px] font-bold text-emerald-700">
                  تأییدشده
                </span>
              )}
              {admin && comment.status === 'REJECTED' && (
                <span className="rounded-full bg-ink-900/5 px-2.5 py-0.5 text-[12px] font-bold text-ink-500">
                  رد شده
                </span>
              )}

              {/* Verified users may reply to a top-level comment. */}
              {canReply && !admin && !isReply && !replyingToId && (
                <button
                  type="button"
                  onClick={() => setReplyingToId(comment.id)}
                  className="text-[12px] font-semibold text-turquoise-700 transition-colors hover:text-turquoise-800"
                >
                  پاسخ
                </button>
              )}

              {admin && (
                <div className="ms-auto flex gap-2">
                  {comment.status !== 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => void moderateComment(comment.id, { status: 'APPROVED' })}
                      className="rounded-full bg-turquoise-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-turquoise-700"
                    >
                      تأیید
                    </button>
                  )}
                  {comment.status !== 'REJECTED' && (
                    <button
                      type="button"
                      onClick={() => void moderateComment(comment.id, { status: 'REJECTED' })}
                      className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-50"
                    >
                      رد
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCommentId(comment.id);
                      setCommentEditBody(comment.body);
                    }}
                    className="grid size-8 place-items-center rounded-full bg-ink-900/5 text-ink-600 transition-colors hover:bg-ink-900/10"
                    aria-label="ویرایش نظر"
                  >
                    <PenIcon strokeWidth={2.2} className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('این نظر برای همیشه حذف شود؟')) {
                        void deleteComment(comment.id);
                      }
                    }}
                    className="grid size-8 place-items-center rounded-full bg-red-50 text-red-600 transition-colors hover:bg-red-100"
                    aria-label="حذف نظر"
                    title="حذف نظر"
                  >
                    <TrashIcon strokeWidth={2.2} className="size-3.5" />
                  </button>
                </div>
              )}
            </div>

            {!admin && replyingToId === comment.id && (
              <div className="mt-2">
                <ReplyForm
                  topicId={page.id}
                  commentId={comment.id}
                  onSubmitted={handleReplySubmitted}
                  onCancel={() => setReplyingToId(null)}
                />
              </div>
            )}
          </>
        )}
      </article>
    );
  }

  /** Fallback display name for a comment author with no profile name. */
  function commentAuthorName(comment: (typeof comments)[number]): string {
    return comment.authorName || 'کاربر';
  }

  /** Top-level comments grouped by author — one review frame per user. */
  const commentGroups = comments
    .filter((comment) => !comment.isReply)
    .reduce<{ key: string; isOwner: boolean; comments: (typeof comments)[number][] }[]>(
      (groups, comment) => {
        const key = comment.authorId ?? `anon-${comment.id}`;
        const existing = groups.find((group) => group.key === key);
        if (existing) {
          existing.comments.push(comment);
          existing.isOwner = existing.isOwner || Boolean(comment.isOwner);
        } else {
          groups.push({
            key,
            isOwner: Boolean(comment.isOwner),
            comments: [comment],
          });
        }
        return groups;
      },
      []
    );

  async function handleConfirmSubmit() {
    setSubmitting(true);
    clearFeedback();

    // Everything is already saved incrementally; a final save of the current
    // state guarantees no in-editor text is lost before it goes for review.
    const saved = await savePage({
      description: description.trim(),
      workingHours: workingHours.trim(),
      imageUrl: imageUrl.trim(),
      address: address.trim(),
      links: links.map((link) => ({ platform: link.platform, label: link.label, value: link.value })),
    });

    if (!saved) {
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`/api/topics/${page.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? 'ارسال صفحه برای بررسی ممکن نشد.');
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      setConfirmOpen(false);
      clearFeedback();
      setStatus('PENDING_REVIEW');
      setSubmitted(true);
      // Scroll immediately so the success screen starts at the top regardless
      // of where the confirm action was clicked.
      window.scrollTo(0, 0);
    } catch {
      setError('ارسال صفحه برای بررسی ممکن نشد.');
      setSubmitting(false);
    }
  }

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  async function savePage(fields: Record<string, unknown>) {
    clearFeedback();
    setSaving(true);

    // In admin mode all saves go through the admin endpoint so editing works
    // for pages in any state (including rejected) and uses the session admin.
    const url = admin ? `/api/admin/topics/${page.id}` : `/api/topics/${page.id}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(fields),
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        setError('رمز مدیریت معتبر نیست.');
        return false;
      }

      if (!response.ok) {
        setError(payload?.error ?? 'ذخیره ممکن نشد.');
        return false;
      }

      setMessage('ذخیره شد.');
      return true;
    } catch {
      setError('ذخیره ممکن نشد.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** Save the identity fields (name / types / location) as the creator. */
  async function saveIdentity() {
    clearFeedback();
    setSaving(true);

    try {
      const response = await fetch(`/api/topics/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          types: types.map((type) => ({ label: type.label, kind: type.kind })),
          scope: activity.scope,
          provinceSlug: activity.provinceSlug,
          citySlug: activity.citySlug,
          address: address.trim(),
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setError(payload?.error ?? 'ذخیره ممکن نشد.');
        return false;
      }

      setMessage('ذخیره شد.');
      return true;
    } catch {
      setError('ذخیره ممکن نشد.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAdmin(
    nextStatus?: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED',
    note?: string
  ) {
    clearFeedback();
    setSaving(true);

    const payload = {
      name: name.trim(),
      types: types.map((type) => ({ label: type.label, kind: type.kind })),
      scope: activity.scope,
      provinceSlug: activity.provinceSlug,
      citySlug: activity.citySlug,
      address: address.trim(),
      description: description.trim(),
      workingHours: workingHours.trim(),
      imageUrl: imageUrl.trim(),
      links: links.map((link) => ({ platform: link.platform, label: link.label, value: link.value })),
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextStatus && nextStatus !== 'APPROVED' ? { decisionNote: note ?? '' } : {}),
    };

    try {
      const response = await fetch(`/api/admin/topics/${page.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const payloadResponse = await response.json().catch(() => null);

      if (response.status === 401) {
        setError('رمز مدیریت معتبر نیست.');
        return false;
      }

      if (!response.ok) {
        setError(payloadResponse?.error ?? 'ذخیره ممکن نشد.');
        return false;
      }

      if (nextStatus) {
        setStatus(nextStatus);
        setAdminNote('');
        setMessage(
          nextStatus === 'APPROVED'
            ? 'صفحه منتشر شد.'
            : nextStatus === 'REJECTED'
              ? 'صفحه رد شد.'
              : 'درخواست تغییر ثبت شد.'
        );
      } else {
        setMessage('تغییرات ذخیره شد.');
      }

      return true;
    } catch {
      setError('ذخیره ممکن نشد.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function moderateComment(
    id: string,
    changes: { status?: 'APPROVED' | 'REJECTED'; body?: string }
  ) {
    clearFeedback();

    try {
      const response = await fetch(`/api/admin/comments/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(changes),
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        setError('رمز مدیریت معتبر نیست.');
        return;
      }

      if (!response.ok) {
        setError(payload?.error ?? 'عملیات ممکن نشد.');
        return;
      }

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === id
            ? {
                ...comment,
                ...(changes.status !== undefined ? { status: changes.status } : {}),
                ...(changes.body !== undefined ? { body: changes.body } : {}),
              }
            : comment
        )
      );

      setEditingCommentId(null);
      setMessage('نظر به‌روزرسانی شد.');
    } catch {
      setError('عملیات ممکن نشد.');
    }
  }

  /** Admin permanently deletes a comment (server-enforced, audit-logged). */
  async function deleteComment(id: string) {
    clearFeedback();

    try {
      const response = await fetch(`/api/admin/comments/${id}`, {
        method: 'DELETE',
      });

      const payload = await response.json().catch(() => null);

      if (response.status === 401) {
        setError('رمز مدیریت معتبر نیست.');
        return;
      }

      if (!response.ok) {
        setError(payload?.error ?? 'حذف نظر ممکن نشد.');
        return;
      }

      setComments((prev) => prev.filter((comment) => comment.id !== id));
      setEditingCommentId(null);
      setMessage('نظر حذف شد.');
    } catch {
      setError('حذف نظر ممکن نشد.');
    }
  }

  async function approveType(suggestionId: string) {
    clearFeedback();

    try {
      const response = await fetch(`/api/admin/topic-types/${suggestionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'APPROVED' }),
      });

      if (!response.ok) {
        setError('تأیید نوع ممکن نشد.');
        return;
      }

      setPendingTypes((prev) => prev.filter((item) => item.id !== suggestionId));
      setMessage('نوع تأیید شد و به پیشنهادها اضافه شد.');
    } catch {
      setError('عملیات ممکن نشد.');
    }
  }

  const saveImage = async () => {
    const ok = await savePage({ imageUrl: imageUrl.trim() });
    if (ok) {
      setImageOpen(false);
    }
  };

  const saveIntro = async () => {
    const ok = await savePage({ description: description.trim() });
    if (ok) {
      setIntroOpen(false);
    }
  };

  const saveHours = async () => {
    const ok = await savePage({ workingHours: workingHours.trim() });
    if (ok) {
      setHoursOpen(false);
    }
  };

  const saveAddress = async () => {
    const ok = await savePage({ address: address.trim() });
    if (ok) {
      setAddressOpen(false);
    }
  };

  const startContactAdd = () => {
    setContactDraft({ platform: 'PHONE', label: '', value: '' });
    setContactEditIndex(null);
    setContactAddOpen(true);
    clearFeedback();
  };

  const startContactEdit = (index: number) => {
    const link = links[index];
    if (!link) return;
    setContactDraft({ platform: link.platform, label: link.label ?? '', value: link.value });
    setContactEditIndex(index);
    setContactAddOpen(false);
    clearFeedback();
  };

  const cancelContactEditor = () => {
    setContactEditIndex(null);
    setContactAddOpen(false);
  };

  const saveContactDraft = async () => {
    const value = contactDraft.value.trim();
    if (!value) {
      setError('مقدار تماس را وارد کنید.');
      return;
    }

    const next: DraftLink = {
      platform: contactDraft.platform,
      label: contactDraft.label.trim() || null,
      value,
    };

    const nextLinks =
      contactEditIndex !== null
        ? links.map((link, index) => (index === contactEditIndex ? next : link))
        : [...links, next];

    setLinks(nextLinks);
    const ok = await savePage({ links: nextLinks });
    if (ok) cancelContactEditor();
  };

  const removeLink = async (index: number) => {
    const nextLinks = links.filter((_, itemIndex) => itemIndex !== index);
    setLinks(nextLinks);
    await savePage({ links: nextLinks });
  };

  const statusLabel =
    status === 'APPROVED'
      ? 'منتشر شده'
      : status === 'REJECTED'
        ? 'رد شده'
        : status === 'CHANGES_REQUESTED'
          ? 'نیاز به اصلاح'
          : status === 'DRAFT'
            ? 'پیش‌نویس'
            : 'در انتظار بررسی';

  const resetIdentity = () => {
    setIdentityOpen(false);
    setName(page.name);
    setTypes(page.types.map((type) => ({ label: type.label, kind: type.kind })));
    setActivity({
      scope: page.scope,
      provinceSlug: page.province?.slug,
      provinceName: page.province?.name,
      citySlug: page.city?.slug,
      cityName: page.city?.name,
      address: page.address ?? undefined,
    });
    setAddress(page.address ?? '');
  };

  // Aggregate rating metadata (APPROVED pages): stars + decimal, comments
  // count (scrolls to the comments section) and the questions placeholder.
  // Shared by the desktop top-left pill and the phone compact row, so the
  // two presentations can never drift apart.
  const ratingMeta =
    page.status === 'APPROVED' ? (
      averageRatingState !== null && ratingCountState > 0 ? (
        <>
          <span className="flex items-center gap-1.5">
            <StarRow value={averageRatingState} className="text-[12px] leading-none" />
            <span className="text-[12px] font-bold leading-none">
              {toPersianDecimal(averageRatingState)}
            </span>
          </span>
          <span aria-hidden className="h-3.5 w-px bg-white/25" />
          <button
            type="button"
            onClick={() =>
              document.getElementById('page-comments')?.scrollIntoView({ behavior: 'smooth' })
            }
            aria-label="مشاهده نظرات"
            className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold leading-none text-ink-900 transition-colors hover:bg-white"
          >
            {toPersianDigits(ratingCountState)} نظر
          </button>
          <button
            type="button"
            aria-disabled="true"
            title="پرسش‌ها به‌زودی"
            className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold leading-none text-ink-900"
          >
            {toPersianDigits(3)} پرسش
          </button>
        </>
      ) : (
        <span className="text-[11px] font-medium leading-none text-white/80">
          هنوز امتیازی ثبت نشده
        </span>
      )
    ) : null;

  // Phone-only hero bottom row: «ثبت نظر» at the bottom-right and the
  // rating / comments / questions pill at the bottom-left, vertically centred
  // on the same line inside normal flex flow. On `md`+ it is hidden — the
  // desktop hero keeps the separate absolute «ثبت نظر» and the top-left pill
  // instead. Shares the same `ratingMeta` block as the pill.
  const heroActionStack =
    page.status === 'APPROVED' ? (
      <div className="flex w-full items-center justify-between gap-2 md:hidden">
        <button
          type="button"
          onClick={handleCommentClick}
          className="inline-flex items-center gap-2 rounded-full bg-black/55 px-5 py-1 text-[13px] font-bold text-white ring-1 ring-white/25 backdrop-blur-md shadow-[0_10px_28px_-10px_rgba(0,0,0,0.65)] transition-colors hover:bg-black/70 max-[359px]:px-4 max-[359px]:gap-1.5"
        >
          <BubbleIcon strokeWidth={2} className="size-4 shrink-0" />
          ثبت نظر
        </button>
        <div className="flex items-center gap-1 rounded-full bg-black/55 py-1 ps-2 pe-1 text-white ring-1 ring-white/20 backdrop-blur max-[359px]:gap-0.5 max-[359px]:ps-1.5">
          {ratingMeta}
        </div>
      </div>
    ) : null;

  if (submitted) {
    return (
      <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)]">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-turquoise-600/10">
          <CheckIcon strokeWidth={2.6} className="size-7 text-turquoise-700" />
        </div>

        <h2 className="mt-4 font-display text-2xl text-ink-900">
          اطلاعات شما با موفقیت ارسال شد
        </h2>

        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink-600">
          صفحه شما در انتظار بررسی است و پس از تأیید، برای دیگران قابل مشاهده خواهد بود.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-turquoise-600 px-8 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97]"
        >
          بازگشت به صفحه اصلی
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(admin || status !== 'APPROVED') && (
        <div className="flex justify-center">
          <span
            className={`rounded-full px-4 py-1.5 text-xs font-bold ${
              status === 'APPROVED'
                ? 'bg-emerald-600/10 text-emerald-700'
                : status === 'REJECTED'
                  ? 'bg-red-600/10 text-red-700'
                  : status === 'CHANGES_REQUESTED'
                    ? 'bg-saffron-500/10 text-saffron-700'
                    : status === 'DRAFT'
                      ? 'bg-ink-900/10 text-ink-600'
                      : 'bg-saffron-500/10 text-saffron-700'
            }`}
          >
            {statusLabel}
          </span>
        </div>
      )}

      {/* The admin's decision note shown to the creator of a CHANGES_REQUESTED
          or REJECTED page so they know what to correct. */}
      {!admin && decisionNote && (status === 'CHANGES_REQUESTED' || status === 'REJECTED') && (
        <div
          className={`rounded-3xl p-4 ring-1 ${
            status === 'REJECTED'
              ? 'bg-red-50 ring-red-200/60'
              : 'bg-saffron-50 ring-saffron-200/60'
          }`}
        >
          <p
            className={`text-[13px] font-bold ${
              status === 'REJECTED' ? 'text-red-700' : 'text-saffron-700'
            }`}
          >
            {status === 'REJECTED' ? 'دلیل رد از طرف مدیر:' : 'پیام مدیر:'}
          </p>
          <p className="mt-1 text-sm leading-7 text-ink-800 whitespace-pre-line">
            {decisionNote}
          </p>
        </div>
      )}

      {message && (
        <div className="rounded-2xl bg-turquoise-600/10 p-3 text-center text-sm text-turquoise-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 p-3 text-center text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Ownership request status cards (already-requested / owner states) —
          rendered inline. The request FORM opens in the modal overlay below,
          matching the suggestion modal presentation. */}
      {(viewerIsOwner || myOwnershipRequest) &&
        page.status === 'APPROVED' &&
        !admin &&
        !ownershipOpen && (
          <OwnershipRequestPanel
            topicId={page.id}
            canRequest={canRequestOwnership}
            isOwner={viewerIsOwner}
            request={myOwnershipRequest}
          />
        )}

      {/* ————————————————— TOPIC INFORMATION — ONE unified card ————————————————— */}
      <article className="overflow-hidden rounded-[28px] bg-white ring-1 ring-ink-900/[0.06] shadow-[0_10px_30px_-14px_rgba(21,67,63,0.3)]">
        <div id="page-hero" className="relative scroll-mt-20">
          {imageUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                id="tour-image"
                src={imageUrl}
                alt={name}
                className="h-52 w-full object-cover md:h-72"
              />

              {/* Readability gradient spans the whole cover so the identity stays
                  legible regardless of the image. */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/35 to-black/15" />

              {/* Header overlay — one normal-flow flex column covering the image:
                  topic name + type chips at the top-right; on phones the
                  bottom row holds «ثبت نظر» (bottom-right) and the
                  rating/comments/questions pill (bottom-left) on the same
                  line. A long name wraps inside its own row and can never
                  overlap the bottom row. */}
              <div
                id="tour-identity"
                className="absolute inset-0 flex flex-col justify-between p-3 md:px-5 md:pt-5 md:pb-3"
              >
                <div className="flex min-w-0 flex-col items-start gap-2">
                  <h1 className="break-words font-display text-[22px] leading-8 text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] md:text-[30px] md:leading-9">
                    {name}
                  </h1>
                  <div className="flex flex-col items-start gap-1">
                    <span className="rounded-full bg-white/20 px-3 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/25 backdrop-blur md:text-xs">
                      {types[0]?.label ?? 'بدون نوع'}
                    </span>
                    {secondaryTypes.map((type, index) => (
                      <span
                        key={`${type.label}-${index}`}
                        className="rounded-full bg-white/20 px-3 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/25 backdrop-blur md:text-xs"
                      >
                        {type.label}
                      </span>
                    ))}
                  </div>
                </div>
                {heroActionStack}
              </div>

              {editable && (
                <button
                  type="button"
                  onClick={() => setImageOpen(true)}
                  aria-label="ویرایش تصویر"
                  title="ویرایش تصویر"
                  className="absolute bottom-3 right-4 grid size-8 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-black/60"
                >
                  <PenIcon strokeWidth={2.2} className="size-3.5" />
                </button>
              )}
            </>
          ) : (
            <div
              id="tour-image"
              className="flex min-h-44 flex-col justify-between bg-gradient-to-br from-turquoise-900 via-turquoise-800 to-ink-900 px-3 pb-3 pt-3 md:min-h-56 md:px-5 md:pb-7 md:pt-5"
            >
              <div id="tour-identity" className="flex flex-col items-start gap-2">
                <div className="flex min-w-0 flex-col items-start">
                  <h1 className="self-start break-words font-display text-[22px] leading-8 text-white md:text-[30px] md:leading-9">
                    {name}
                  </h1>
                  <div className="mt-2 flex flex-col items-start gap-1">
                    <span className="rounded-full bg-white/15 px-3 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/20 backdrop-blur md:text-xs">
                      {types[0]?.label ?? 'بدون نوع'}
                    </span>
                    {secondaryTypes.map((type, index) => (
                      <span
                        key={`${type.label}-${index}`}
                        className="rounded-full bg-white/15 px-3 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/20 backdrop-blur md:text-xs"
                      >
                        {type.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2">
                {heroActionStack}
                {editable && !imageOpen && (
                  <button
                    type="button"
                    onClick={() => setImageOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-[13px] font-bold text-white ring-1 ring-white/25 backdrop-blur transition-colors hover:bg-white/25"
                  >
                    <PlusIcon strokeWidth={2.6} className="size-4" />
                    افزودن تصویر
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Public aggregate rating — top-left of the page image (APPROVED
              pages), only from `md` up. On phones the same three metadata
              items render, horizontal, inside the bottom-centre hero stack
              below. The average (stars + decimal) is READ-ONLY informational
              metadata, never a button. The «۲ نظر» button scrolls to the
              comments section; «۳ پرسش» is a visual placeholder for now. */}
          {page.status === 'APPROVED' && (
            <div className="absolute top-3 left-4 hidden items-center gap-1.5 rounded-full bg-black/55 py-1.5 pe-1.5 ps-3 text-white ring-1 ring-white/20 backdrop-blur md:flex">
              {ratingMeta}
            </div>
          )}

          {/* «ثبت نظر» — bottom-center of the page image (APPROVED pages), only from
              `md` up. On phones the in-hero bottom row above renders its own
              slimmer «ثبت نظر» alongside the rating row. Same dark translucent
              language as the aggregate pill, with a comment icon. The personal
              star rating selector lives inside the composer. */}
          {page.status === 'APPROVED' && (
            <button
              type="button"
              onClick={handleCommentClick}
              className="absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-5 py-2.5 text-[13px] font-bold text-white ring-1 ring-white/25 backdrop-blur-md shadow-[0_10px_28px_-10px_rgba(0,0,0,0.65)] transition-colors hover:bg-black/70 md:inline-flex"
            >
              <BubbleIcon strokeWidth={2} className="size-4 shrink-0" />
              ثبت نظر
            </button>
          )}
        </div>

        {/* Compact public action bar — immediately below the hero image,
            between the image and the introductory content. Visible to every
            viewer on APPROVED pages. Anonymous/unverified users are asked for
            quick verification only when they actually click an action. */}
        {page.status === 'APPROVED' && !admin && (
          <div className="flex flex-wrap items-center justify-center gap-1 border-t border-ink-900/[0.06] px-3 py-2.5 md:px-5">
            <button
              type="button"
              onClick={() => (canFavorite ? void handleToggleFavorite() : requireVerify('favorite'))}
              className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-1.5 text-[10px] font-semibold text-turquoise-700 ring-1 ring-turquoise-200/70 transition-colors hover:bg-turquoise-50"
            >
              <HeartIcon
                strokeWidth={2.2}
                className={`size-3 shrink-0 ${isFavoritedState ? 'text-rose-500' : ''}`}
                fill={isFavoritedState ? 'currentColor' : 'none'}
              />
              {isFavoritedState ? 'در علاقه‌مندی‌ها' : 'افزودن به علاقه‌مندی‌ها'}
            </button>

            <button
              type="button"
              onClick={() => (canSuggest ? setSuggestOpen(true) : requireVerify('suggestion'))}
              className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-1.5 text-[10px] font-semibold text-turquoise-700 ring-1 ring-turquoise-200/70 transition-colors hover:bg-turquoise-50"
            >
              <PenIcon strokeWidth={2.2} className="size-3 shrink-0" />
              ویرایش صفحه
            </button>

            {!viewerIsOwner && (
              <button
                type="button"
                onClick={() => (canRequestOwnership ? setOwnershipOpen(true) : requireVerify('ownership'))}
                className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-1.5 text-[10px] font-semibold text-turquoise-700 ring-1 ring-turquoise-200/70 transition-colors hover:bg-turquoise-50"
              >
                <UserIcon strokeWidth={2.2} className="size-3 shrink-0" />
                درخواست مالکیت
              </button>
            )}
          </div>
        )}

        {(editable && imageOpen) || admin ? (
          <div className="border-t border-ink-900/[0.06] p-4 md:p-5">
            {editable && imageOpen && (
              <InlineEditor onSave={() => void saveImage()} onCancel={() => setImageOpen(false)} saving={saving}>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder="https://..."
                  dir="ltr"
                  autoFocus
                  className={inputClass}
                />
              </InlineEditor>
            )}

            {(editable || admin) && (
              <>
                {!identityOpen ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-ink-500">
                      ویرایش هویت صفحه (نام، نوع‌ها و محدوده)
                    </span>
                    <EditButton
                      label="ویرایش نام، نوع‌ها و محدوده فعالیت"
                      onClick={() => setIdentityOpen(true)}
                    />
                  </div>
                ) : (
                  <div className="space-y-4 rounded-2xl bg-ink-900/[0.02] p-4 ring-1 ring-ink-900/[0.06]">
                    <label className="block">
                      <span className="mb-2 block text-[13px] font-bold text-ink-900">نام صفحه</span>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className={inputClass}
                      />
                    </label>

                    <TopicTypesField value={types} onChange={setTypes} />

                    <ActivityAreaPicker value={activity} onChange={setActivity} showAddress={false} />

                    <label className="block">
                      <span className="mb-2 block text-[13px] font-bold text-ink-900">آدرس</span>
                      <input
                        type="text"
                        value={address}
                        onChange={(event) => setAddress(event.target.value)}
                        className={inputClass}
                      />
                    </label>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void (admin ? saveAdmin() : saveIdentity())}
                        disabled={saving}
                        className="rounded-full bg-turquoise-600 px-5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-turquoise-700 disabled:opacity-50"
                      >
                        {saving ? 'در حال ذخیره...' : 'ذخیره'}
                      </button>
                      <button
                        type="button"
                        onClick={resetIdentity}
                        disabled={saving}
                        className="rounded-full bg-white px-5 py-2 text-[13px] font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5 disabled:opacity-50"
                      >
                        انصراف
                      </button>
                    </div>

                    {admin && pendingTypes.length > 0 && (
                      <div className="rounded-2xl bg-saffron-50 p-4 ring-1 ring-saffron-200/60">
                        <p className="text-[13px] font-bold text-ink-800">
                          این نوع‌ها جدید هستند و در انتظار بررسی‌اند:
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {pendingTypes.map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex items-center gap-2 rounded-full bg-white py-1.5 ps-3 pe-1.5 text-[13px] font-semibold text-ink-800 ring-1 ring-ink-900/10"
                            >
                              {item.label}
                              <button
                                type="button"
                                onClick={() => void approveType(item.id)}
                                className="grid size-5 place-items-center rounded-full bg-turquoise-600 text-white transition-colors hover:bg-turquoise-700"
                                aria-label={`تأیید نوع «${item.label}»`}
                              >
                                <CheckIcon strokeWidth={3} className="size-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {admin && (
                  <>
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        onClick={() => void saveAdmin()}
                        disabled={saving}
                        className="w-full rounded-full bg-white px-7 py-3 text-[15px] font-bold text-ink-900 ring-1 ring-ink-900/15 transition-all duration-200 hover:ring-turquoise-600/50 hover:text-turquoise-700 disabled:opacity-50"
                      >
                        {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
                      </button>

                      <button
                        type="button"
                        onClick={() => void saveAdmin('APPROVED')}
                        disabled={saving}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-turquoise-600 px-7 py-3 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all duration-200 hover:bg-turquoise-700 disabled:opacity-50"
                      >
                        <CheckIcon strokeWidth={2.6} className="size-5" />
                        انتشار صفحه
                      </button>
                    </div>

                    <div className="mt-3 rounded-2xl bg-ink-900/[0.02] p-4 ring-1 ring-ink-900/[0.06]">
                      <label className="block">
                        <span className="mb-2 block text-[13px] font-bold text-ink-900">
                          پیام / دلیل (برای «درخواست تغییر» یا «رد صفحه»)
                        </span>
                        <textarea
                          value={adminNote}
                          onChange={(event) => setAdminNote(event.target.value)}
                          rows={3}
                          placeholder="مثلاً: لطفاً شهر این مکان را مشخص کنید."
                          className={`${inputClass} resize-none leading-7`}
                        />
                      </label>

                      <div className="mt-2 space-y-2">
                        <button
                          type="button"
                          onClick={() => void saveAdmin('CHANGES_REQUESTED', adminNote)}
                          disabled={saving}
                          className="w-full rounded-full bg-white px-7 py-3 text-[15px] font-bold text-saffron-700 ring-1 ring-saffron-300 transition-all duration-200 hover:bg-saffron-50 disabled:opacity-50"
                        >
                          درخواست تغییر
                        </button>

                        <button
                          type="button"
                          onClick={() => void saveAdmin('REJECTED', adminNote)}
                          disabled={saving}
                          className="w-full rounded-full bg-white px-7 py-3 text-[15px] font-bold text-red-700 ring-1 ring-red-200 transition-all duration-200 hover:bg-red-50 disabled:opacity-50"
                        >
                          رد صفحه
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ) : null}
        {/* ————————————————— INTRODUCTION ————————————————— */}
        <section
          id="page-intro"
          className="scroll-mt-20 border-t border-ink-900/[0.06] px-4 py-2 md:px-5"
        >
          {description ? (
            editable && introOpen ? (
              <InlineEditor onSave={() => void saveIntro()} onCancel={() => setIntroOpen(false)} saving={saving}>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={12}
                  maxLength={2000}
                  className={`${inputClass} resize-y leading-7`}
                />
              </InlineEditor>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    ref={introRef}
                    className={`${introExpanded ? '' : 'line-clamp-3'} whitespace-pre-line break-words text-[14px] leading-7 text-ink-700`}
                  >
                    {description}
                  </p>
                  {introCanExpand && (
                    <button
                      type="button"
                      onClick={() => setIntroExpanded((open) => !open)}
                      className="mt-1 text-[12px] font-semibold text-turquoise-700 transition-colors hover:text-turquoise-800"
                    >
                      {introExpanded ? 'کمتر' : 'بیشتر'}
                    </button>
                  )}
                </div>
                {editable && <EditButton label="ویرایش معرفی" onClick={() => setIntroOpen(true)} />}
              </div>
            )
          ) : editable ? (
            introOpen ? (
              <InlineEditor onSave={() => void saveIntro()} onCancel={() => setIntroOpen(false)} saving={saving}>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={12}
                  maxLength={2000}
                  placeholder="درباره این صفحه بنویسید..."
                  className={`${inputClass} resize-y leading-7`}
                />
              </InlineEditor>
            ) : (
              <CompactInvite label="افزودن معرفی" onClick={() => setIntroOpen(true)} />
            )
          ) : (
            <p className="text-[14px] text-ink-400">معرفی‌ای ثبت نشده است.</p>
          )}
        </section>

        {/* ————————————————— AREA / HOURS / ADDRESS / CONTACTS ————————————————— */}
        {/* pt-0: the first info row's own py-2 provides the top spacing, so the
            section border sits like a divider between rows — otherwise the
            section padding would stack with the row padding and the
            introduction→service-area gap would grow beyond the row rhythm. */}
        <section id="page-info" className="scroll-mt-20 border-t border-ink-900/[0.06] px-4 pb-2 pt-0 md:px-5">
        <dl className="divide-y divide-ink-900/[0.06]">
          <InfoRow
            label="محدوده خدمات‌دهی"
            value={serviceAreaLabel}
            edit={editable || admin}
            onEdit={editable || admin ? () => setIdentityOpen(true) : undefined}
          />

          <div>
            <InfoRow
              label="ساعات کاری"
              value={workingHours || 'ثبت نشده'}
              muted={!workingHours}
              edit={editable}
              onEdit={() => setHoursOpen(true)}
            />
            {editable && hoursOpen && (
              <InlineEditor onSave={() => void saveHours()} onCancel={() => setHoursOpen(false)} saving={saving}>
                <textarea
                  value={workingHours}
                  onChange={(event) => setWorkingHours(event.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder={`شنبه تا چهارشنبه: ۹ تا ۱۸
پنجشنبه: ۹ تا ۱۳
جمعه: تعطیل`}
                  className={`${inputClass} resize-y leading-7`}
                />
              </InlineEditor>
            )}
          </div>

          <div>
            <InfoRow
              label="آدرس"
              value={addressLabel || 'آدرسی برای این مورد ثبت نشده.'}
              muted={!addressLabel}
              edit={editable && !admin && showAddressBlock}
              onEdit={() => setAddressOpen(true)}
            />
            {editable && !admin && showAddressBlock && addressOpen && (
              <InlineEditor onSave={() => void saveAddress()} onCancel={() => setAddressOpen(false)} saving={saving}>
                <input
                  type="text"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="خیابان، کوچه، پلاک"
                  className={inputClass}
                />
              </InlineEditor>
            )}
          </div>
        </dl>

        <div className="border-t border-ink-900/[0.06] pt-1">
          {orderedLinks.length > 0 && (
            <div className="divide-y divide-ink-900/[0.06]">
              {orderedLinks.map(({ link, index }) => (
                <ContactRow
                  key={`${link.platform}-${index}`}
                  icon={<ContactIcon platform={link.platform} className="size-4" />}
                  label={contactLabel(link)}
                  value={link.value}
                  href={contactHref(link)}
                  onEdit={editable ? () => startContactEdit(index) : undefined}
                  onRemove={editable ? () => void removeLink(index) : undefined}
                />
              ))}
            </div>
          )}

          {(contactEditIndex !== null || contactAddOpen) && (
            <div className="py-2">
              <InlineEditor
                onSave={() => void saveContactDraft()}
                onCancel={cancelContactEditor}
                saving={saving}
                saveLabel={contactEditIndex !== null ? 'ذخیره' : 'افزودن'}
              >
                <div className="space-y-3">
                  <select
                    value={contactDraft.platform}
                    onChange={(event) =>
                      setContactDraft((draft) => ({ ...draft, platform: event.target.value as ContactPlatform }))
                    }
                    aria-label="نوع راه ارتباطی"
                    className={`${inputClass} appearance-none`}
                  >
                    <optgroup label="تلفن">
                      <option value="PHONE">تلفن</option>
                    </optgroup>
                    <optgroup label="وب‌سایت">
                      <option value="WEBSITE">وب‌سایت</option>
                    </optgroup>
                    <optgroup label="شبکه‌های اجتماعی">
                      {SOCIAL_PLATFORMS.map((platform) => (
                        <option key={platform} value={platform}>
                          {CONTACT_PLATFORM_LABELS[platform]}
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  {(contactDraft.platform === 'PHONE' || contactDraft.platform === 'WEBSITE') && (
                    <input
                      type="text"
                      value={contactDraft.label}
                      onChange={(event) => setContactDraft((draft) => ({ ...draft, label: event.target.value }))}
                      placeholder="برچسب (اختیاری) — مثل: دفتر مرکزی، فکس، پشتیبانی"
                      className={inputClass}
                    />
                  )}

                  <input
                    type="text"
                    value={contactDraft.value}
                    onChange={(event) => setContactDraft((draft) => ({ ...draft, value: event.target.value }))}
                    placeholder={
                      contactDraft.platform === 'PHONE'
                        ? 'شماره تلفن'
                        : contactDraft.platform === 'WEBSITE'
                          ? 'نشانی وب‌سایت'
                          : 'نام کاربری یا نشانی'
                    }
                    dir="ltr"
                    className={inputClass}
                  />
                </div>
              </InlineEditor>
            </div>
          )}

          {editable && contactEditIndex === null && !contactAddOpen && (
            <div className="py-2">
              <CompactInvite label="تماس" onClick={startContactAdd} />
            </div>
          )}
        </div>
        </section>
      </article>

      {/* ————————————————— COMMENTS ————————————————— */}
      <section
        id="page-comments"
        className="scroll-mt-20 rounded-2xl border border-ink-900/10 bg-white px-4 py-3 md:px-5"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[12px] font-bold text-ink-500">نظرات</span>
          {comments.length > 0 && (
            <span className="text-[12px] font-medium text-ink-400">
              {toPersianDigits(comments.length)} نظر
            </span>
          )}
        </div>

        {/* «ثبت نظر» — immediately ABOVE the comments list so the action is
            always accessible without scrolling through existing comments.
            Same dark neutral language as the hero «ثبت نظر» (icon + pill);
            the mandatory star rating lives inside the comment composer.
            Visible to all visitors. */}
        <button
          type="button"
          onClick={handleCommentClick}
          className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink-900 px-6 py-2.5 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.35)] transition-colors hover:bg-ink-800"
        >
          <BubbleIcon strokeWidth={2} className="size-4 shrink-0" />
          ثبت نظر
        </button>

        {comments.length > 0 && (
          <div className="space-y-3">
            {commentGroups.map((group) => (
              <div
                key={group.key}
                className="overflow-hidden rounded-2xl bg-ink-900/[0.02] ring-1 ring-ink-900/[0.06]"
              >
                {/* Group header — one review frame per author. */}
                <div className="flex items-center gap-2 border-b border-ink-900/[0.06] bg-white/70 px-3 py-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-turquoise-600/10 text-[12px] font-bold text-turquoise-700">
                    {commentAuthorName(group.comments[0]).charAt(0)}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-bold text-ink-900">
                    {commentAuthorName(group.comments[0])}
                  </span>
                  {group.isOwner && (
                    <span className="shrink-0 rounded-full bg-turquoise-600/10 px-2.5 py-0.5 text-[10px] font-bold text-turquoise-700">
                      مالک صفحه
                    </span>
                  )}
                </div>

                <div className="divide-y divide-ink-900/[0.06] px-3">
                  {group.comments.map((comment) => {
                    const replies = comments.filter((reply) => reply.parentId === comment.id);

                    return (
                      <div key={comment.id}>
                        {renderCommentCard(comment, false)}

                        {replies.length > 0 && (
                          <div className="mb-2 space-y-1 border-s-2 border-ink-900/10 ps-3">
                            {replies.map((reply) => (
                              <div key={reply.id}>{renderCommentCard(reply, true)}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comment composer overlay — opens from the hero «ثبت نظر» and the
            bottom «ثبت نظر»; never scrolls the user through existing comments. */}
        <CommentComposer
          open={commentComposerOpen}
          onClose={() => setCommentComposerOpen(false)}
          topicId={page.id}
          requireRating={page.status === 'APPROVED'}
          rating={commentRating}
          onRatingChange={setCommentRating}
          focusNonce={focusCommentNonce}
          onSubmitted={handleCommentSubmitted}
        />
      </section>

      {/* ————————————————— FINAL SUBMISSION ————————————————— */}
      {showSendButton && (
        <div id="page-submit" className="scroll-mt-24 pt-1">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-turquoise-600 px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(26,99,93,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-turquoise-700 active:translate-y-0 active:scale-[0.97]"
          >
            بررسی و ارسال برای بررسی
          </button>
        </div>
      )}

      {/* ————————————————— ONBOARDING POPUP ————————————————— */}
      {onboardingOpen && <OnboardingPopup onClose={dismissOnboarding} />}

      {/* ————————————————— CONFIRMATION MODAL ————————————————— */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-center text-[16px] font-bold text-ink-900">
              آیا اطلاعات صفحه درست است؟
            </h3>

            <p className="mt-2 text-center text-[13px] leading-6 text-ink-600">
              این آخرین فرصت برای بازبینی و ویرایش است. پس از تأیید، اطلاعات شما برای
              بررسی ارسال می‌شود.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                className="flex-1 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-ink-600 ring-1 ring-ink-900/15 transition-colors hover:bg-ink-900/5 disabled:opacity-50"
              >
                بازبینی / بازگشت
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmSubmit()}
                disabled={submitting}
                className="flex-1 rounded-full bg-turquoise-600 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-turquoise-700 disabled:opacity-50"
              >
                {submitting ? 'در حال ارسال...' : 'تأیید و ارسال'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ————————————————— SUGGESTION MODAL ————————————————— */}
      {suggestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-lg text-ink-900">پیشنهاد تغییر</h3>
              <button
                type="button"
                onClick={() => setSuggestOpen(false)}
                aria-label="بستن"
                className="grid size-8 place-items-center rounded-full bg-ink-900/5 text-ink-600 transition-colors hover:bg-ink-900/10"
              >
                <XIcon strokeWidth={2.4} className="size-4" />
              </button>
            </div>

            <SuggestionPanel topicId={page.id} page={page} />
          </div>
        </div>
      )}

      {/* ————————————————— OWNERSHIP REQUEST MODAL —————————————————
          Same presentation as the suggestion modal: overlay over the page,
          same backdrop, positioning, close and responsive behavior. */}
      {ownershipOpen && page.status === 'APPROVED' && !admin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
          onClick={() => setOwnershipOpen(false)}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-lg text-ink-900">درخواست مالکیت</h3>
              <button
                type="button"
                onClick={() => setOwnershipOpen(false)}
                aria-label="بستن"
                className="grid size-8 place-items-center rounded-full bg-ink-900/5 text-ink-600 transition-colors hover:bg-ink-900/10"
              >
                <XIcon strokeWidth={2.4} className="size-4" />
              </button>
            </div>

            <OwnershipRequestPanel
              topicId={page.id}
              canRequest={canRequestOwnership}
              isOwner={viewerIsOwner}
              request={myOwnershipRequest}
              autoOpenForm
            />
          </div>
        </div>
      )}
    </div>
  );
}
