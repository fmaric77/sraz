"use client";
import { useEffect } from 'react';
import { useAuthModal } from '@/app/components/AuthModalProvider';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { open } = useAuthModal();
  const router = useRouter();
  useEffect(() => {
    open('login');
    // Navigate back to home so modal context remains consistent
    router.replace('/');
  }, [open, router]);
  return null;
}