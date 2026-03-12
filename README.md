# voiced-slides-player

A simple Node.js website to play images of slides with voice narration.

## Features

- **Magic phrase login** – password protected by the `MAGIC` environment variable
- **Presentations list** – auto-discovers folders in `Slides/` and lists them with a Play button
- **Fullscreen slide player** – displays `Slide*.png` and plays `Slide*.mp3` one by one, with a 3-second pause between slides, then returns to the list after 5 seconds
- **Reverse proxy friendly** – no TLS/HTTPS built in; use a reverse proxy like nginx in front

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your values, then:

```bash
MAGIC=your-secret-phrase SESSION_SECRET=your-session-secret npm start
```

The server listens on port `3000` by default (override with `PORT` env var).

## Adding Presentations

Place each presentation as a folder inside `Slides/`:

```
Slides/
  My Presentation/
    Slide1.png
    Slide1.mp3
    Slide2.png
    Slide2.mp3
    ...
```

Slide files must be named `Slide<N>.png` and `Slide<N>.mp3` where `N` starts from 1.

## Environment Variables

| Variable         | Required | Description                                      |
|------------------|----------|--------------------------------------------------|
| `MAGIC`          | Yes      | Login password (magic phrase)                    |
| `SESSION_SECRET` | Yes      | Secret for signing session cookies               |
| `PORT`           | No       | HTTP port (default: 3000)                        |
| `NODE_ENV`       | No       | Set to `production` to enable secure cookies     |
