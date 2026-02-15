import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { RedisService } from '../common/redis/redis.service';

@Controller()
export class LaunchController {
  constructor(private readonly redis: RedisService) {}

  @Get('launch')
  async launch(@Query('s') sessionId: string, @Res() res: Response) {
    if (!sessionId) {
      return res.status(400).send('Missing session id');
    }

    const session = await this.redis.getJson<any>(
      `public:session:${sessionId}`,
    );

    if (!session) {
      return res.status(401).send('Invalid or expired session');
    }

    const gameServerBase = String(
      process.env.GAME_SERVER_BASE_URL || '',
    ).replace(/\/+$/, '');

    if (!gameServerBase) {
      return res
        .status(500)
        .send('GAME_SERVER_BASE_URL is not configured');
    }

    const iframeUrl = `${gameServerBase}/play?sessionId=${encodeURIComponent(
      sessionId,
    )}`;

    /**
     * ✅ CSP PROPRE
     * - autorise le game-server
     * - autorise self (pour pouvoir ouvrir /launch direct)
     */
    const allow =
      String(process.env.IFRAME_ALLOW_ORIGINS || '').trim() ||
      'https://zenyx-game-server-production-666e.up.railway.app';

    res.setHeader(
      'Content-Security-Policy',
      `frame-ancestors 'self' ${allow};`,
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    return res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ZENYX Launch</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #000;
    }
    iframe {
      border: 0;
      width: 100%;
      height: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <iframe src="${iframeUrl}" allowfullscreen></iframe>
</body>
</html>`);
  }
}
