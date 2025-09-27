'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useCurrentUser } from './CurrentUserProvider';

interface TranslationContextValue {
  t: (text: string, params?: Record<string, string>) => Promise<string>;
  language: string | null;
  loading: boolean;
}

const TranslationContext = createContext<TranslationContextValue | null>(null);

async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text.trim()) return text;
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data[0].map((x: string[]) => x[0]).join('');
  } catch (error) {
    console.error('Translation error:', error);
    return text;
  }
}

function getCacheKey(text: string, language: string): string {
  return `translation_${btoa(text)}_${language}`;
}

function getCachedTranslation(text: string, language: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = getCacheKey(text, language);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setCachedTranslation(text: string, language: string, translation: string): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getCacheKey(text, language);
    localStorage.setItem(key, translation);
  } catch {
    // localStorage might be full or unavailable
  }
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) throw new Error('useTranslation must be used within TranslationProvider');
  return ctx;
}

export function TranslationProvider({ children }: { children: ReactNode }) {
  const { language } = useCurrentUser();
  const [loading, setLoading] = useState(false);

  const t = useCallback(async (text: string, params?: Record<string, string>): Promise<string> => {
    // If no language is set or it's English, return the original text
    if (!language || language === 'en') {
      return text;
    }

    // Check cache first
    const cached = getCachedTranslation(text, language);
    if (cached) {
      return cached;
    }

    // Not in cache, translate it
    setLoading(true);
    try {
      const translated = await translateText(text, language);
      setCachedTranslation(text, language, translated);

      // Apply parameter replacement
      if (params) {
        return Object.entries(params).reduce((str, [param, value]) => {
          return str.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
        }, translated);
      }

      return translated;
    } catch (error) {
      console.error('Translation failed:', error);
      return text;
    } finally {
      setLoading(false);
    }
  }, [language]);

  return (
    <TranslationContext.Provider value={{ t, language, loading }}>
      {children}
    </TranslationContext.Provider>
  );
}
