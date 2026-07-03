import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || navigator.vendor;
  return (
    /android/i.test(ua) ||
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  );
}
