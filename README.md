# Lossless

A Chrome browser extension that lets users share music with friends in a shared social feed. The extension detects whatever track is currently playing on YouTube, YouTube Music, Spotify, or Apple Music, and lets you post it to a shared timeline that all users can see.

---

## How to Run

1. Clone the repository
2. Open Google Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** (toggle in the top right)
4. Click **Load unpacked** and select the project folder
5. The Lossless icon will appear in the Chrome toolbar
6. Click it to open the popup, then click **Login** to sign in with Google

---

## Features

### Core
- Popup interface that detects the currently playing track from the active tab
- Track detection from YouTube, YouTube Music, Spotify, and Apple Music
- Share button that posts the track to a shared Firestore feed
- Feed page showing all posts in reverse chronological order
- Users can delete their own posts
- Google OAuth login via `chrome.identity.launchWebAuthFlow`

### Social
- **Friends system** — add friends using a unique Friend Code (your Google UID). Send, accept, decline, and remove friend requests
- **Filtered feed** — the feed only shows your own posts and your friends' posts
- **Friend Code copy button** — in the popup, one click copies your Friend Code to share with friends
- **Comments** — logged-in users can comment on any post. Users can delete their own comments
- **200 character comment limit** — live countdown counter shown as you type

### Admin
- A single hardcoded admin account (by UID) can delete any post or comment
- Admin sees all posts regardless of friends
- Admin sees exact timestamps; regular users see relative time (e.g. "5m ago", "2h ago")
- Admin badge shown in the popup

### UX
- Relative timestamps for all users — just now, Xm ago, Xh ago, Xd ago, Xw ago, then month and year for older posts
- Auto-refresh every 60 seconds, paused while typing a comment
- Login page auto-redirects to the feed 5 seconds after successful sign in
- Switch account button lets users change Google account without fully logging out
- Duplicate friend request prevention — only one request can exist between two users at a time

---

## Technologies

- JavaScript, HTML, CSS (no frameworks)
- Chrome Extension Manifest V3
- Chrome Extension APIs: `chrome.identity`, `chrome.storage`, `chrome.scripting`, `chrome.tabs`
- Google Cloud Firestore (via REST API — no Firebase SDK)
- Google OAuth 2.0 via `chrome.identity.launchWebAuthFlow`

---

## Architecture

| File | Role |
|------|------|
| `manifest.json` | Extension configuration, permissions, locked extension ID |
| `background.js` | Service worker — handles post sharing writes to Firestore |
| `popup.html/js` | Extension popup — track detection, sharing, login/logout |
| `login.html/js` | Google OAuth login page, writes user profile to Firestore |
| `feed.html/js` | Main feed page — posts, comments, friends panel |

### Data (Firestore Collections)
| Collection | Purpose |
|------------|---------|
| `posts` | Shared tracks with subcollections for `comments` |
| `users` | One document per user, written on login — enables friend search |
| `friendRequests` | Friend request documents with status: pending or accepted |

---

## Track Detection

Track metadata is extracted by injecting a script into the active tab using `chrome.scripting.executeScript`. No platform APIs are called — the extension reads from the page directly:

- **YouTube** — reads the video title heading and channel name element
- **YouTube Music** — reads the player bar title and byline elements
- **Spotify** — reads the browser tab title (formatted as `Song · Artist`)
- **Apple Music** — reads `og:title` and `og:description` meta tags

---

## Deployment Notes

- The extension ID is locked via a `key` field in `manifest.json`, ensuring the same ID across all machines
- The OAuth redirect URI (`https://jkcplacicacdhpcheaooekcndggfgclp.chromiumapp.org/`) is registered in Google Cloud Console
- Firestore security rules are set to open read/write for prototype purposes
- To publish to the Chrome Web Store, Firestore rules should be tightened and the OAuth consent screen verified