# Ring Road Rush

A daily scooter game set on Kathmandu's 27 km Ring Road. You dodge cows, motorbikes, cycles, microbuses, Safa Tempos, street dogs and dug-up road, ride under green traffic lights, and collect momos on the way. The first ride of the day is the same road for everyone, each retry shuffles the traffic, and a new road opens at midnight Nepal time. After the Ring Road the ride carries on along the Prithvi Highway to Pokhara and up the mountain road to Muktinath, with new scenery on each stage. You can copy your result and paste it in a group chat.

There is also a small API that counts how many people play.

## Stack

- Game: one HTML file with vanilla JavaScript and Canvas, no libraries
- API: Cloudflare Workers
- Database: Cloudflare D1 (SQLite)

## How the daily road works

The road comes from a seeded random generator. The seed combines the date in Nepal time with the try number, and obstacles spawn by distance instead of by time, so a given try is the same for every player whatever their frame rate.

## Run it locally

```
npm install
npm run dev
```

Then open http://localhost:8787. Stats are at `/stats.html`.

## Deploy

Every push to `main` deploys automatically through Cloudflare Workers Builds. Database changes in `migrations/` are not automatic, so run them first with `npm run db:remote`. To set up a new copy:

```
npx wrangler login
npx wrangler d1 create ring-road-rush
```

Copy the `database_id` it prints into `wrangler.toml`, then run:

```
npm run db:remote
npm run deploy
```

## Day, night and weather

The road's look follows Nepal time and the current Kathmandu weather from Open-Meteo, fetched by the Worker. It changes the look only, not the traffic or scoring.

## API

`POST /api/events` records a ride starting or ending.

```json
{ "player": "random-id", "type": "end", "road": 1, "device": "phone", "km": 12.4, "score": 1500, "momos": 10, "cause": "cow" }
```

`GET /api/stats` returns players, rides, returning players, crash causes, devices and the last 14 days.

`POST /api/ghosts` saves a rider's best ride of the day, and `GET /api/ghosts` returns today's top 6 to replay as ghost scooters.

`POST /api/live` updates a rider's position every 4 seconds and returns who is riding now. `GET /api/live` returns the same list.

`GET /api/leaderboard` returns the top riders for today and the last 7 days.

`GET /api/players` returns each rider's rides, best score and last played time, plus the latest 50 rides.

## Privacy

A player is a random ID saved in the browser. A rider can type a name, which then shows on the public stats page. The game does not store IP addresses or locations.

## Project layout

- `game/game.html`: the game
- `scripts/build.js`: builds `public/index.html` from the game
- `public/stats.html`: stats page
- `src/worker.js`: API
- `migrations/`: database tables
