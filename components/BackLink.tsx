'use client';

import React from 'react';

type BackLinkProps = {
  /** Where to send the user if there is no browser history */
  fallbackHref?: string;
  /** Link label text */
  children?: React.ReactNode;
};

export default function BackLink({
  fallbackHref = '/onboarding',
  children = 'Back',
}: BackLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    try {
      // If there is at least one entry in history, go back.
      if (window.history.length > 1) {
        window.history.back();
      } else {
        // Fallback: go to onboarding (for direct visits/opened in new tab, etc.)
        window.location.href = fallbackHref;
      }
    } catch {
      window.location.href = fallbackHref;
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="underline hover:no-underline"
    >
      {children}
    </button>
  );
}
