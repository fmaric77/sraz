import { NextRequest } from 'next/server';

interface TranslateRequestBody {
	text: string;
	targetLang?: string; // ISO language code, optional
}

interface TranslateResponseBody {
	translated: string;
	sourceLang: string;
	targetLang: string;
	original: string;
}

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

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as Partial<TranslateRequestBody> | null;
		const text = (body?.text ?? '').toString();
		if (!text) {
			return Response.json({ error: 'Missing text' }, { status: 400 });
		}
		const targetLang = (body?.targetLang || 'en').toLowerCase();

		// Use Google Translate API
		const translated = await translateText(text, targetLang);

		const res: TranslateResponseBody = {
			translated,
			sourceLang: 'auto',
			targetLang,
			original: text,
		};
		return Response.json(res, { status: 200 });
	} catch (err) {
		console.error('Translate API error', err);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
}

export const runtime = 'edge'; // likely lightweight; adjust if using node-only SDKs
