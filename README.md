# DevStreak 🔥

Daily interview prep app with streaks, XP, and AI-generated questions.

## Features
- 🔐 Multi-user login (username + password)
- 🔥 Per-track streaks that persist forever
- 🧠 Daily AI-generated questions (refreshes every midnight)
- ⚡ 5-minute flash sessions (write or speak your answer)
- 🏋️ 1-hour deep dive sessions
- 📊 XP levels and progress tracking
- 👾 Weekly boss challenges
- 6 tracks: DSA, System Design, SQL, Java, Spring Boot, AI for Devs

## Deploy on Vercel
1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import from GitHub
3. Select this repo — Vercel auto-detects Create React App
4. Click Deploy — live in ~60 seconds

## Local Development
\`\`\`bash
npm install
npm start
\`\`\`

## Tech Stack
- React 18 (single file component)
- Claude API (daily question generation)
- Artifact persistent storage (multi-user data)
- No backend needed
