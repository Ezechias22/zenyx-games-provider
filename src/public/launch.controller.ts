import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { RedisService } from '../common/redis/redis.service';

function cleanOriginList(v: string): string[] {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    // on garde seulement origin (pas de path)
    .map((s) => {
      try {
        const u = new URL(s);
        return u.origin;
      } catch {
        // si déjà un origin propre
        return s.replace(/\/+$/, '');
      }
    });
}

@Controller()
export class LaunchController {
  constructor(private readonly redis: RedisService) {}

  @Get('launch')
  async launch(@Query('s') sessionId: string, @Res() res: Response) {
    if (!sessionId) return res.status(400).send('Missing session id');

    const session = await this.redis.getJson<any>(`public:session:${sessionId}`);
    if (!session) return res.status(401).send('Invalid or expired session');

    const gameServerBase = String(process.env.GAME_SERVER_BASE_URL || '').replace(/\/+$/, '');
    if (!gameServerBase) return res.status(500).send('GAME_SERVER_BASE_URL is not configured');

    const iframeUrl = `${gameServerBase}/play?sessionId=${encodeURIComponent(sessionId)}`;

    // ✅ Allowlist des domaines qui ont le droit d'embed /launch
    // ENV: IFRAME_ALLOW_ORIGINS="https://site.com,https://www.site.com,https://xxx.railway.app"
    const allowList = cleanOriginList(process.env.IFRAME_ALLOW_ORIGINS || '');

    // fallback (si ENV vide) : autorise le game-server (origin uniquement)
    const fallback = ['https://zenyx-game-server-production-666e.up.railway.app'];

    const origins = allowList.length ? allowList : fallback;

    // ✅ CSP frame-ancestors (moderne, supporté)
    res.setHeader(
      'Content-Security-Policy',
      `frame-ancestors 'self' ${origins.join(' ')};`,
    );

    // ✅ Important: pas de X-Frame-Options (peut casser l’iframe)
    res.removeHeader('X-Frame-Options');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    return res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ZENYX Launch</title>
  <style>
    html, body { margin:0; padding:0; width:100%; height:100%; background:#000; }
    iframe { border:0; width:100%; height:100%; display:block; }
  </style>
</head>
<body>
  <iframe src="${iframeUrl}" allow="fullscreen" allowfullscreen></iframe>
</body>
</html>`);
  }
}