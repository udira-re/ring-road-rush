// Wraps game/game.html into a full page and switches on play counting for the hosted version.
const fs = require('fs');
const game = fs.readFileSync('game/game.html', 'utf8');
// Title, fonts and styles belong in <head>; the markup and script go in <body>.
const split = game.indexOf('</style>') + '</style>'.length;
const headPart = game.slice(0, split), bodyPart = game.slice(split);
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Ride one lap of Kathmandu's Ring Road. A new road every day.">
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
