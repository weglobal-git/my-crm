"use client";

import { AppProgressBar as ProgressBar } from 'next-nprogress-bar';

export function ProgressBarProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ProgressBar
        height="3px"
        color="#C7F33C"
        options={{ showSpinner: false }}
        shallowRouting
      />
    </>
  );
}
