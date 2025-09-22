"use client";
import { useEffect } from 'react';
import { useAuthModal } from '@/app/components/AuthModalProvider';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const { open } = useAuthModal();
  const router = useRouter();
  useEffect(() => {
    open('register');
    router.replace('/');
  }, [open, router]);
  return null;
}