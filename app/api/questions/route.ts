import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import { Question } from '@/models/types';
import { auth } from '@/auth';
import { findUserByEmail } from '@/lib/users';

async function translateText(text: string, targetLang: string) {
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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  if (!category) return NextResponse.json({ error: 'category required' }, { status: 400 });

  // Check for user language preference
  const session = await auth();
  let userLanguage = 'en'; // default

  if (session?.user?.email) {
    const user = await findUserByEmail(session.user.email);
    if (user?.language) {
      userLanguage = user.language;
    }
  }

  const col = await getCollection<Question>('questions');
  const docs = await col.aggregate([
    { $match: { category } },
    { $sample: { size: 1 } },
  ]).toArray();

  if (!docs.length) return NextResponse.json({ error: 'no questions' }, { status: 404 });
  const q = docs[0];

  // Hide correctIndex from client; provide separate validation endpoint (future)
  // Strip out correctIndex and serialize _id to string
  const { _id, correctIndex, ...rest } = q as Question;
  const question = {
    _id: _id?.toString(),
    ...rest,
  };

  // Translate question if user's language is not the same as question's language
  if (userLanguage !== 'en' && q.language !== userLanguage) {
    try {
      // Translate question text and all choices
      const textsToTranslate = [q.text, ...q.choices];
      const translations = await Promise.all(
        textsToTranslate.map(text => translateText(text, userLanguage))
      );

      question.text = translations[0];
      // Ensure we always assign exactly 4 choices to satisfy the Question type
      const translatedChoices = translations.slice(1, 5);
      if (translatedChoices.length === 4) {
        (question as { choices: [string, string, string, string] }).choices = translatedChoices as [string, string, string, string];
      } else {
        // Fallback to original choices if translation did not return 4 items
        (question as { choices: [string, string, string, string] }).choices = q.choices;
      }
    } catch (error) {
      console.error('Question translation failed:', error);
      // Fall back to original question if translation fails
    }
  }

  return NextResponse.json({ question });
}
