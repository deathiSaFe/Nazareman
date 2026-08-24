"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandMark from './BrandMark';
import HamburgerButton from './HamburgerButton';
import MobileMenu from './MobileMenu';
import type { PublicUser } from '@/lib/auth';

export default function SiteHeader({
  user,
  unreadCount = 0,
}: {
  user: PublicUser | null;
  /** Server-computed unread inbox count (badge in the hamburger menu). */
  unreadCount?: number;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const pathname = usePathname();
  const isTopicPage = pathname.startsWith('/topic/');
  const isHomePage = pathname === '/';

  // The «ثبت تجربه» quick-add CTA is not shown on topic pages (where it moved
  // into the hamburger) nor on the homepage (where «افزودن موضوع» already
  // exists) — it stays only on other desktop-width pages.
  const showAddTopicCta = !isTopicPage && !isHomePage;

  // When the user is on a topic page, carry the exact topic path to the
  // profile page so it can offer a «بازگشت به صفحه موضوع» return link
  // (preserved across the login round-trip via the `next` param).
  const profileHref = isTopicPage
    ? `/profile?next=${encodeURIComponent(pathname)}`
    : '/profile';

  // Signed-out users are routed through login first; the login `next` target
  // is this same profile URL (with the topic context), so they land back on
  // the topic-aware profile page after verifying.
  const loginHref = isTopicPage
    ? `/login?next=${encodeURIComponent(`/profile?next=${encodeURIComponent(pathname)}`)}`
    : '/login';

  const handleToggleMenu = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const handleCloseMenu = () => {
    setIsMenuOpen(false);
  };

  return (
    <>
      {/* Header - contains ONLY the top bar */}
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4">
          {/* Three-track row: the two side tracks are equal-width flex-1 cells
              with min-w-0 + truncation, so the center brand stays truly
              centered and side content (account entry, long names, controls)
              can never overlap it — on any screen width. */}
          <div className="flex h-16 items-center gap-2 sm:gap-3">
            {/* Right edge (RTL start): hamburger menu */}
            <div className="flex min-w-0 flex-1 items-center justify-start">
              <div className="shrink-0">
                <HamburgerButton isOpen={isMenuOpen} onClick={handleToggleMenu} />
              </div>
            </div>

            {/* Center: brand — reserved natural width, always visible & centered */}
            <div className="shrink-0">
              <BrandMark />
            </div>

            {/* Left edge (RTL end): optional add-topic CTA (topic pages and the
                homepage rely on the hamburger «افزودن موضوع» instead) + the
                always-present account control */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {showAddTopicCta && (
                <Link
                  href="/add-topic"
                  title="تجربه خود را با دیگران در میان بگذارید"
                  className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-turquoise-600 px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-turquoise-700"
                >
                  <span className="text-[15px] leading-none">+</span>
                  <span>ثبت تجربه</span>
                </Link>
              )}

              {user ? (
                <Link
                  href={profileHref}
                  aria-label="پروفایل من"
                  title={user.displayName || 'پروفایل من'}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-turquoise-600/10 px-2.5 py-1.5 text-[13px] font-bold text-turquoise-700 ring-1 ring-turquoise-600/40 transition-colors hover:bg-turquoise-600/20"
                >
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="size-5 shrink-0 rounded-full object-cover" />
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    >
                      <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                      <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
                    </svg>
                  )}
                  {user.displayName && <span className="truncate">{user.displayName}</span>}
                </Link>
              ) : (
                <Link
                  href={loginHref}
                  aria-label="ورود / ثبت‌نام"
                  className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-bold text-turquoise-700 ring-1 ring-turquoise-600/40 transition-colors hover:bg-turquoise-600/10 hover:ring-turquoise-600/60"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  >
                    <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                    <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
                  </svg>
                  <span className="truncate">ورود | ثبت‌نام</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* MobileMenu - rendered OUTSIDE the header to avoid stacking context issues */}
      <MobileMenu
        isOpen={isMenuOpen}
        onClose={handleCloseMenu}
        user={user}
        unreadCount={unreadCount}
        profileHref={profileHref}
        loginHref={loginHref}
      />
    </>
  );
}
