"use client";

import React, { useState } from 'react';
import Link from 'next/link';
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
          <div className="relative flex items-center h-16">
            <div className="flex items-center">
              <HamburgerButton isOpen={isMenuOpen} onClick={handleToggleMenu} />
            </div>

            <div className="absolute left-1/2 -translate-x-1/2">
              <BrandMark />
            </div>

            <div className="ms-auto flex items-center gap-2">
              {/* Add-topic is discoverable from every normal public page. */}
              <Link
                href="/add-topic"
                title="تجربه خود را با دیگران در میان بگذارید"
                className="inline-flex items-center gap-1 rounded-full bg-turquoise-600 px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-turquoise-700"
              >
                <span className="text-[15px] leading-none">+</span>
                <span>ثبت تجربه</span>
              </Link>

              {user && (
                <Link
                  href="/profile"
                  aria-label="پروفایل من"
                  title={user.displayName || 'پروفایل من'}
                  className="grid size-9 place-items-center overflow-hidden rounded-full bg-turquoise-600/10 text-turquoise-700 ring-1 ring-ink-900/10 transition-colors hover:bg-turquoise-600/20"
                >
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="font-display text-sm font-bold">
                      {(user.displayName || user.phoneNumber).charAt(0)}
                    </span>
                  )}
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* MobileMenu - rendered OUTSIDE the header to avoid stacking context issues */}
      <MobileMenu isOpen={isMenuOpen} onClose={handleCloseMenu} user={user} unreadCount={unreadCount} />
    </>
  );
}
