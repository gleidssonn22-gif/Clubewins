import html from "../index.html";
import sitemap from "../sitemap.xml";
import favicon from "../favicon.svg";

interface VisitMessage {
	url: string;
	time: string;
	message: string;
}

interface VideoRow {
	id: string;
	creator: string;
	caption: string;
	object_key: string;
	content_type: string;
	file_size: number;
	created_at: string;
	uploader_id: string;
	category: string;
	reply_to: string | null;
}

export interface Env {
	DB: D1Database;
	VIDEOS?: R2Bucket;
	MY_QUEUE: Queue<VisitMessage>;
	ADSENSE_PUBLISHER_ID: string;
	ADSENSE_AD_SLOT: string;
	TURNSTILE_SITE_KEY: string;
	TURNSTILE_SECRET_KEY?: string;
	ADMIN_API_KEY?: string;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const videoTypes: Record<string, string> = {
	"video/mp4": "mp4",
	"video/webm": "webm",
	"video/quicktime": "mov"
};
const videoCategories = new Set(["casal", "amor-proprio", "amizade", "distancia", "historias"]);
const pollOptions: Record<string, string[]> = {
	poll1: ["ele", "ela"],
	poll2: ["filme", "passeio"]
};

function jsonResponse(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: { "cache-control": "no-store" }
	});
}

function validId(value: string): boolean {
	return /^[a-zA-Z0-9_-]{16,80}$/.test(value);
}

async function verifyTurnstile(request: Request, env: Env, token: string): Promise<boolean> {
	if (!env.TURNSTILE_SECRET_KEY || !token) return false;
	const body = new URLSearchParams({
		secret: env.TURNSTILE_SECRET_KEY,
		response: token
	});
	const ip = request.headers.get("CF-Connecting-IP");
	if (ip) body.set("remoteip", ip);

	const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
		method: "POST",
		body
	});
	if (!response.ok) return false;
	const result = await response.json() as { success?: boolean };
	return result.success === true;
}

function authorizedAdmin(request: Request, env: Env): boolean {
	const key = env.ADMIN_API_KEY;
	const authorization = request.headers.get("Authorization") || "";
	return Boolean(key && authorization === `Bearer ${key}`);
}

async function handleApi(request: Request, env: Env): Promise<Response> {
	const { pathname, searchParams } = new URL(request.url);

	if (pathname === "/api/videos" && request.method === "GET") {
		const { results } = await env.DB.prepare(
			"SELECT id, creator, caption, category, reply_to, content_type, file_size, created_at FROM videos WHERE status = 'approved' ORDER BY created_at DESC LIMIT 100"
		).all<Omit<VideoRow, "object_key" | "uploader_id">>();
		return jsonResponse(results.map(video => ({
			...video,
			mediaUrl: `/api/videos/${encodeURIComponent(video.id)}/media`
		})));
	}

	if (pathname === "/api/videos" && request.method === "POST") {
		if (!env.VIDEOS) return jsonResponse({ error: "Uploads de vídeo estão indisponíveis no momento." }, 503);
		let form: FormData;
		try {
			form = await request.formData();
		} catch {
			return jsonResponse({ error: "Envie um formulário multipart válido." }, 400);
		}

		const file = form.get("video");
		const uploaderId = String(form.get("viewerId") || "");
		const caption = String(form.get("caption") || "").trim();
		const category = String(form.get("category") || "historias");
		const replyToId = String(form.get("replyToId") || "");
		const token = String(form.get("cf-turnstile-response") || "");
		if (!(file instanceof File) || !videoTypes[file.type]) {
			return jsonResponse({ error: "Formato de vídeo não aceito." }, 415);
		}
		if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
			return jsonResponse({ error: "O vídeo deve ter até 25 MB." }, 413);
		}
		if (!validId(uploaderId) || caption.length > 300 || !videoCategories.has(category) ||
			(replyToId && !/^(demo-casal|demo-amor|[a-zA-Z0-9-]{16,80})$/.test(replyToId))) {
			return jsonResponse({ error: "Dados de publicação inválidos." }, 400);
		}
		if (replyToId && !replyToId.startsWith("demo-")) {
			const parent = await env.DB.prepare("SELECT id FROM videos WHERE id = ? AND status = 'approved'")
				.bind(replyToId).first<{ id: string }>();
			if (!parent) return jsonResponse({ error: "O vídeo original não está disponível para respostas." }, 404);
		}
		if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) {
			return jsonResponse({ error: "Uploads públicos ainda não foram ativados." }, 503);
		}
		if (!await verifyTurnstile(request, env, token)) {
			return jsonResponse({ error: "Verificação anti-spam inválida." }, 403);
		}

		const id = crypto.randomUUID();
		const objectKey = `${id}.${videoTypes[file.type]}`;
		const createdAt = new Date().toISOString();
		await env.VIDEOS.put(objectKey, file.stream(), {
			httpMetadata: {
				contentType: file.type,
				cacheControl: "public, max-age=31536000, immutable"
			}
		});

		try {
			await env.DB.prepare(
				"INSERT INTO videos (id, creator, caption, object_key, content_type, file_size, status, created_at, uploader_id, category, reply_to) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)"
			).bind(id, `u_${uploaderId.slice(0, 12)}`, caption, objectKey, file.type, file.size, createdAt, uploaderId, category, replyToId || null).run();
		} catch (error) {
			await env.VIDEOS.delete(objectKey);
			throw error;
		}

		return jsonResponse({ id, status: "pending", category, replyToId: replyToId || null, message: "Vídeo recebido e aguardando moderação." }, 201);
	}

	const mediaMatch = pathname.match(/^\/api\/videos\/([a-zA-Z0-9-]+)\/media$/);
	if (mediaMatch && request.method === "GET") {
		if (!env.VIDEOS) return jsonResponse({ error: "Armazenamento de vídeo indisponível." }, 503);
		const video = await env.DB.prepare(
			"SELECT object_key FROM videos WHERE id = ? AND status = 'approved'"
		).bind(mediaMatch[1]).first<{ object_key: string }>();
		if (!video) return new Response("Not Found", { status: 404 });

		const rangeHeader = request.headers.get("Range");
		const object = await env.VIDEOS.get(video.object_key, rangeHeader ? { range: request.headers } : {});
		if (!object || !("body" in object) || !object.body) return new Response("Not Found", { status: 404 });

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set("etag", object.httpEtag);
		headers.set("accept-ranges", "bytes");
		headers.set("cache-control", "public, max-age=31536000, immutable");
		let status = 200;
		if (object.range) {
			status = 206;
			headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
			headers.set("content-length", String(object.range.length));
		} else {
			headers.set("content-length", String(object.size));
		}
		return new Response(object.body, { status, headers });
	}

	const likesMatch = pathname.match(/^\/api\/videos\/([a-zA-Z0-9_-]+)\/likes$/);
	if (likesMatch && (request.method === "GET" || request.method === "POST")) {
		const videoId = likesMatch[1];
		const demoVideo = videoId === "demo-casal" || videoId === "demo-amor";
		if (!demoVideo) {
			const video = await env.DB.prepare("SELECT id FROM videos WHERE id = ? AND status = 'approved'")
				.bind(videoId).first<{ id: string }>();
			if (!video) return jsonResponse({ error: "Vídeo não encontrado." }, 404);
		}

		let viewerId: string;
		if (request.method === "GET") {
			viewerId = new URL(request.url).searchParams.get("viewerId") || "";
		} else {
			let data: { viewerId?: unknown; liked?: unknown };
			try { data = await request.json() as typeof data; } catch { return jsonResponse({ error: "JSON inválido." }, 400); }
			if (typeof data.viewerId !== "string" || !validId(data.viewerId) || typeof data.liked !== "boolean") {
				return jsonResponse({ error: "Dados da curtida inválidos." }, 400);
			}
			viewerId = data.viewerId;
			if (data.liked) {
				await env.DB.prepare("INSERT OR IGNORE INTO video_likes (video_id, viewer_id, created_at) VALUES (?, ?, ?)")
					.bind(videoId, viewerId, new Date().toISOString()).run();
			} else {
				await env.DB.prepare("DELETE FROM video_likes WHERE video_id = ? AND viewer_id = ?")
					.bind(videoId, viewerId).run();
			}
		}
		if (!validId(viewerId)) return jsonResponse({ error: "Identificador inválido." }, 400);

		const state = await env.DB.prepare(
			"SELECT COUNT(*) AS count, EXISTS(SELECT 1 FROM video_likes WHERE video_id = ? AND viewer_id = ?) AS liked FROM video_likes WHERE video_id = ?"
		).bind(videoId, viewerId, videoId).first<{ count: number; liked: number }>();
		return jsonResponse({ count: Number(state?.count) || 0, liked: Boolean(state?.liked) });
	}

	const commentsMatch = pathname.match(/^\/api\/videos\/([a-zA-Z0-9_-]+)\/comments$/);
	if (commentsMatch && request.method === "GET") {
		const videoId = commentsMatch[1];
		const { results } = await env.DB.prepare(
			"SELECT id, author_id, body, created_at FROM comments WHERE video_id = ? ORDER BY created_at ASC LIMIT 100"
		).bind(videoId).all();
		return jsonResponse(results);
	}

	if (commentsMatch && request.method === "POST") {
		const videoId = commentsMatch[1];
		let data: { viewerId?: unknown; body?: unknown; token?: unknown };
		try { data = await request.json() as typeof data; } catch { return jsonResponse({ error: "JSON inválido." }, 400); }
		if (typeof data.viewerId !== "string" || !validId(data.viewerId) ||
			typeof data.body !== "string" || data.body.trim().length === 0 || data.body.length > 500) {
			return jsonResponse({ error: "Dados de comentário inválidos." }, 400);
		}
		const demoVideo = videoId === "demo-casal" || videoId === "demo-amor";
		const approvedVideo = await env.DB.prepare("SELECT id FROM videos WHERE id = ? AND status = 'approved'")
			.bind(videoId).first<{ id: string }>();
		if (!demoVideo && !approvedVideo) return jsonResponse({ error: "Vídeo não encontrado ou ainda não aprovado." }, 404);
		if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) {
			return jsonResponse({ error: "Comentários compartilhados ainda não foram ativados." }, 503);
		}
		if (!await verifyTurnstile(request, env, String(data.token || ""))) {
			return jsonResponse({ error: "Verificação anti-spam inválida." }, 403);
		}
		const id = crypto.randomUUID();
		const createdAt = new Date().toISOString();
		await env.DB.prepare("INSERT INTO comments (id, video_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
			.bind(id, videoId, `u_${data.viewerId.slice(0, 12)}`, data.body.trim(), createdAt).run();
		return jsonResponse({ id, authorId: `u_${data.viewerId.slice(0, 12)}`, body: data.body.trim(), createdAt }, 201);
	}

	if (pathname === "/api/polls" && request.method === "GET") {
		const viewerId = searchParams.get("viewerId") || "";
		const [counts, votes] = await Promise.all([
			env.DB.prepare("SELECT poll_id, option_id, COUNT(*) AS count FROM poll_votes GROUP BY poll_id, option_id").all(),
			validId(viewerId)
				? env.DB.prepare("SELECT poll_id, option_id FROM poll_votes WHERE viewer_id = ?").bind(viewerId).all()
				: Promise.resolve({ results: [] })
		]);
		return jsonResponse({ counts: counts.results, votes: votes.results });
	}

	const pollMatch = pathname.match(/^\/api\/polls\/(poll1|poll2)\/votes$/);
	if (pollMatch && request.method === "POST") {
		let data: { viewerId?: unknown; optionId?: unknown; token?: unknown };
		try { data = await request.json() as typeof data; } catch { return jsonResponse({ error: "JSON inválido." }, 400); }
		const pollId = pollMatch[1];
		if (typeof data.viewerId !== "string" || !validId(data.viewerId) ||
			typeof data.optionId !== "string" || !pollOptions[pollId].includes(data.optionId)) {
			return jsonResponse({ error: "Dados de voto inválidos." }, 400);
		}
		if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) {
			return jsonResponse({ error: "Votos compartilhados ainda não foram ativados." }, 503);
		}
		if (!await verifyTurnstile(request, env, String(data.token || ""))) {
			return jsonResponse({ error: "Verificação anti-spam inválida." }, 403);
		}
		const existingVote = await env.DB.prepare("SELECT option_id FROM poll_votes WHERE poll_id = ? AND viewer_id = ?")
			.bind(pollId, data.viewerId).first<{ option_id: string }>();
		if (existingVote) return jsonResponse({ error: "Você já votou nesta enquete." }, 409);
		await env.DB.prepare("INSERT INTO poll_votes (poll_id, viewer_id, option_id, created_at) VALUES (?, ?, ?, ?)")
			.bind(pollId, data.viewerId, data.optionId, new Date().toISOString()).run();
		return jsonResponse({ pollId, optionId: data.optionId }, 201);
	}

	if (pathname === "/api/follows" && request.method === "GET") {
		const viewerId = searchParams.get("viewerId") || "";
		if (!validId(viewerId)) return jsonResponse({ error: "Identificador inválido." }, 400);
		const { results } = await env.DB.prepare("SELECT creator FROM follows WHERE viewer_id = ?")
			.bind(viewerId).all<{ creator: string }>();
		return jsonResponse(results.map(record => record.creator));
	}

	if (pathname === "/api/follows" && request.method === "POST") {
		let data: { viewerId?: unknown; creator?: unknown; following?: unknown };
		try { data = await request.json() as typeof data; } catch { return jsonResponse({ error: "JSON inválido." }, 400); }
		if (typeof data.viewerId !== "string" || !validId(data.viewerId) ||
			typeof data.creator !== "string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(data.creator) ||
			typeof data.following !== "boolean") {
			return jsonResponse({ error: "Dados de seguimento inválidos." }, 400);
		}
		if (data.following) {
			await env.DB.prepare("INSERT OR IGNORE INTO follows (viewer_id, creator, created_at) VALUES (?, ?, ?)")
				.bind(data.viewerId, data.creator, new Date().toISOString()).run();
		} else {
			await env.DB.prepare("DELETE FROM follows WHERE viewer_id = ? AND creator = ?")
				.bind(data.viewerId, data.creator).run();
		}
		return jsonResponse({ creator: data.creator, following: data.following });
	}

	if (pathname === "/api/reports" && request.method === "POST") {
		let data: { videoId?: unknown; reporterId?: unknown; reason?: unknown; details?: unknown; token?: unknown };
		try { data = await request.json() as typeof data; } catch { return jsonResponse({ error: "JSON inválido." }, 400); }
		const allowedReasons = new Set(["rights", "privacy", "harmful", "spam", "other"]);
		if (typeof data.videoId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(data.videoId) ||
			typeof data.reporterId !== "string" || !validId(data.reporterId) ||
			typeof data.reason !== "string" || !allowedReasons.has(data.reason) ||
			typeof data.details !== "string" || data.details.length > 500) {
			return jsonResponse({ error: "Dados da denúncia inválidos." }, 400);
		}
		if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY) {
			return jsonResponse({ error: "Denúncias compartilhadas ainda não foram ativadas." }, 503);
		}
		if (!await verifyTurnstile(request, env, String(data.token || ""))) {
			return jsonResponse({ error: "Verificação anti-spam inválida." }, 403);
		}
		const id = crypto.randomUUID();
		await env.DB.prepare(
			"INSERT INTO reports (id, video_id, reporter_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?)"
		).bind(id, data.videoId, data.reporterId, data.reason, data.details, new Date().toISOString()).run();
		return jsonResponse({ id, status: "open" }, 201);
	}

	if (pathname.startsWith("/api/admin/")) {
		if (!authorizedAdmin(request, env)) return jsonResponse({ error: "Não autorizado." }, 401);
		const previewMatch = pathname.match(/^\/api\/admin\/videos\/([a-zA-Z0-9-]+)\/media$/);
		if (previewMatch && request.method === "GET") {
			if (!env.VIDEOS) return jsonResponse({ error: "Armazenamento de vídeo indisponível." }, 503);
			const video = await env.DB.prepare(
				"SELECT object_key FROM videos WHERE id = ? AND status = 'pending'"
			).bind(previewMatch[1]).first<{ object_key: string }>();
			if (!video) return new Response("Not Found", { status: 404 });
			const object = await env.VIDEOS.get(video.object_key);
			if (!object || !("body" in object) || !object.body) return new Response("Not Found", { status: 404 });
			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set("cache-control", "no-store");
			return new Response(object.body, { headers });
		}
		if (pathname === "/api/admin/videos" && request.method === "GET") {
			const { results } = await env.DB.prepare(
				"SELECT id, creator, caption, content_type, file_size, created_at FROM videos WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100"
			).all();
			return jsonResponse(results);
		}
		if (pathname === "/api/admin/reports" && request.method === "GET") {
			const { results } = await env.DB.prepare(
				"SELECT id, video_id, reporter_id, reason, details, created_at FROM reports WHERE status = 'open' ORDER BY created_at ASC LIMIT 100"
			).all();
			return jsonResponse(results);
		}
		const moderationMatch = pathname.match(/^\/api\/admin\/videos\/([a-zA-Z0-9-]+)$/);
		if (moderationMatch && request.method === "POST") {
			let data: { status?: unknown };
			try { data = await request.json() as typeof data; } catch { return jsonResponse({ error: "JSON inválido." }, 400); }
			if (data.status !== "approved" && data.status !== "rejected") {
				return jsonResponse({ error: "Status de moderação inválido." }, 400);
			}
			const video = await env.DB.prepare("SELECT object_key FROM videos WHERE id = ? AND status = 'pending'")
				.bind(moderationMatch[1]).first<{ object_key: string }>();
			if (!video) return jsonResponse({ error: "Vídeo pendente não encontrado." }, 404);
			await env.DB.prepare("UPDATE videos SET status = ? WHERE id = ?")
				.bind(data.status, moderationMatch[1]).run();
			if (data.status === "rejected" && env.VIDEOS) await env.VIDEOS.delete(video.object_key);
			return jsonResponse({ id: moderationMatch[1], status: data.status });
		}
		const reportMatch = pathname.match(/^\/api\/admin\/reports\/([a-zA-Z0-9-]+)$/);
		if (reportMatch && request.method === "POST") {
			let data: { status?: unknown };
			try { data = await request.json() as typeof data; } catch { return jsonResponse({ error: "JSON inválido." }, 400); }
			if (data.status !== "reviewed" && data.status !== "dismissed") {
				return jsonResponse({ error: "Status de denúncia inválido." }, 400);
			}
			await env.DB.prepare("UPDATE reports SET status = ? WHERE id = ?")
				.bind(data.status, reportMatch[1]).run();
			return jsonResponse({ id: reportMatch[1], status: data.status });
		}
		return jsonResponse({ error: "Rota de moderação não encontrada." }, 404);
	}

	return jsonResponse({ error: "Rota de API não encontrada." }, 404);
}

function adsTxtResponse(env: Env): Response {
	const publisherId = env.ADSENSE_PUBLISHER_ID || "";
	const publisherNumber = publisherId.replace(/^ca-pub-/, "");
	if (!/^\d+$/.test(publisherNumber)) {
		return new Response("AdSense publisher ID is not configured.\n", {
			status: 503,
			headers: { "content-type": "text/plain;charset=UTF-8", "cache-control": "no-store" }
		});
	}
	return new Response(`google.com, pub-${publisherNumber}, DIRECT, f08c47fec0942fa0\n`, {
		headers: { "content-type": "text/plain;charset=UTF-8", "cache-control": "public, max-age=3600" }
	});
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (url.hostname === "www.clubewins.com.br") {
			url.hostname = "clubewins.com.br";
			return Response.redirect(url.toString(), 308);
		}

		if (url.pathname === "/sitemap.xml" && request.method === "GET") {
			return new Response(sitemap, {
				headers: {
					"content-type": "application/xml;charset=UTF-8",
					"cache-control": "public, max-age=3600"
				}
			});
		}
		if (url.pathname === "/favicon.svg" && request.method === "GET") {
			return new Response(favicon, {
				headers: {
					"content-type": "image/svg+xml",
					"cache-control": "public, max-age=86400"
				}
			});
		}

		if (url.pathname.startsWith("/api/")) {
			try {
				return await handleApi(request, env);
			} catch (error) {
				console.error("Falha na API:", error);
				return jsonResponse({ error: "Erro interno ao processar a solicitação." }, 500);
			}
		}

		if (url.pathname === "/ads.txt" && request.method === "GET") {
			return adsTxtResponse(env);
		}

		if (url.pathname !== "/" || request.method !== "GET") {
			return new Response("Not Found", { status: 404 });
		}

		ctx.waitUntil(env.MY_QUEUE.send({
			url: url.toString(),
			time: new Date().toISOString(),
			message: "Novo acesso registado no clube"
		}).catch((error: unknown) => {
			console.error("Falha ao registrar acesso:", error);
		}));

		const publisherId = /^ca-pub-\d+$/.test(env.ADSENSE_PUBLISHER_ID || "") ? env.ADSENSE_PUBLISHER_ID : "";
		const adSlot = /^\d+$/.test(env.ADSENSE_AD_SLOT || "") ? env.ADSENSE_AD_SLOT : "";
		const turnstileSiteKey = /^[a-zA-Z0-9_-]{10,100}$/.test(env.TURNSTILE_SITE_KEY || "") ? env.TURNSTILE_SITE_KEY : "";
		const page = html
			.replaceAll("__ADSENSE_PUBLISHER_ID__", publisherId)
			.replaceAll("__ADSENSE_AD_SLOT__", adSlot)
			.replaceAll("__TURNSTILE_SITE_KEY__", turnstileSiteKey);

		return new Response(page, {
			headers: { "content-type": "text/html;charset=UTF-8" }
		});
	},

	async queue(batch: MessageBatch<VisitMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
		// Processa as mensagens que chegam da fila
		for (const message of batch.messages) {
			console.log("Mensagem recebida da fila:", message.body);
			// Marca a mensagem como processada com sucesso
			message.ack();
		}
	},
};