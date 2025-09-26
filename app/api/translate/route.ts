// Simple translation endpoint stub.
// Replace with real translation provider (e.g. OpenAI, DeepL, Google) as needed.
// Accepts POST with JSON: { text: string, targetLang?: string }
// Responds with a naive "translation" (echo) so frontend contract is unblocked.

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
	placeholder: true;
}

export async function POST(req: NextRequest) {
	try {
		const body = (await req.json()) as Partial<TranslateRequestBody> | null;
		const text = (body?.text ?? '').toString();
		if (!text) {
			return Response.json({ error: 'Missing text' }, { status: 400 });
		}
		const targetLang = (body?.targetLang || 'en').toLowerCase();

		// TODO: Plug in real translation call here.
		// For now we just echo. Mark response with placeholder=true so
		// client can detect stubbed translation.
		const res: TranslateResponseBody = {
			translated: text,
			sourceLang: 'auto',
			targetLang,
			original: text,
			placeholder: true,
		};
		return Response.json(res, { status: 200 });
	} catch (err) {
		console.error('Translate API error', err);
		return Response.json({ error: 'Internal Server Error' }, { status: 500 });
	}
}

export const runtime = 'edge'; // likely lightweight; adjust if using node-only SDKs
