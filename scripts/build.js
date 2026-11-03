// Wraps game/game.html into a full page and switches on play counting for the hosted version.
const fs = require('fs');
const SITE = 'https://ring-road-rush.pokharelamshu.workers.dev';
const game = fs.readFileSync('game/game.html', 'utf8');
// Title, fonts and styles belong in <head>; the markup and script go in <body>.
const split = game.indexOf('</style>') + '</style>'.length;
const headPart = game.slice(0, split), bodyPart = game.slice(split);
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="How far can you get on Ring Road before a cow stops you? A free scooter game from Kathmandu to Muktinath.">
<meta property="og:title" content="Ring Road Rush">
<meta property="og:description" content="How far can you get on Ring Road before a cow stops you? A free scooter game from Kathmandu to Muktinath.">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/">
<meta property="og:image" content="${SITE}/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<style>:root{padding-top:env(safe-area-inset-top,0);padding-bottom:env(safe-area-inset-bottom,0)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
<script>window.RRR_API = '/api';</script>
${headPart}
</head><body>
${bodyPart}
</body></html>
`;
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/index.html', page);
console.log('Built public/index.html');
