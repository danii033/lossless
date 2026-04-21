const PROJECT_ID = "loess-eecf3"
const API_KEY    = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

/* ---------- POST SHARING ---------- */

async function writePostToFirestore(payload) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?key=${API_KEY}`

  const user = payload.user || {}
  const body = {
    fields: {
      userId:    { stringValue:   user.uid          || ""     },
      userName:  { stringValue:   user.displayName  || "User" },
      track:     { stringValue:   payload.track     || ""     },
      artist:    { stringValue:   payload.artist    || ""     },
      service:   { stringValue:   payload.service   || ""     },
      url:       { stringValue:   payload.url       || ""     },
      createdAt: { timestampValue: new Date().toISOString()   }
    }
  }

  const res = await fetch(endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body)
  })

  if (!res.ok) {
    throw new Error("Firestore write failed")
  }
}

// Listens for the LOSSLESS_SHARE message from popup.js and writes to Firestore.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "LOSSLESS_SHARE") {
    writePostToFirestore(msg.payload)
      .then(()  => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }))
    return true // keep message channel open for async response
  }

  // feed.js sends this when the user opens the feed so we can clear the badge.
  // It tells us the timestamp of the newest post they have now seen.
  if (msg?.type === "FEED_OPENED") {
    if (msg.latestPostTs) {
      chrome.storage.local.set({ losslessLastSeenTs: msg.latestPostTs })
    }
    chrome.action.setBadgeText({ text: "" })
    return false
  }
})

/* ---------- NOTIFICATIONS (badge) ---------- */

// Set up an alarm that fires every 60 seconds to check for new friend posts.
// chrome.alarms is the correct MV3 way to do periodic background work —
// setInterval doesn't survive service worker sleep.
chrome.alarms.create("checkNewPosts", { periodInMinutes: 1 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkNewPosts") checkForNewPosts()
})

async function checkForNewPosts() {
  // We need the logged-in user and their friends list to know whose posts count.
  const { losslessUser, losslessLastSeenTs } = await chrome.storage.local.get({
    losslessUser:      null,
    losslessLastSeenTs: null
  })

  if (!losslessUser?.uid) return // not logged in — nothing to do

  const myUid = losslessUser.uid

  // Load accepted friend UIDs from Firestore
  const friendUids = await fetchFriendUids(myUid)
  if (!friendUids.length) return // no friends yet

  // Load recent posts
  const posts = await fetchRecentPosts()
  if (!posts.length) return

  // A "new" post is one by a friend that is newer than losslessLastSeenTs.
  // If we have never set losslessLastSeenTs, we treat everything as new.
  const cutoff = losslessLastSeenTs ? new Date(losslessLastSeenTs) : new Date(0)

  const newFriendPosts = posts.filter(p => {
    if (!friendUids.includes(p.userId)) return false
    const ts = p.createdAt ? new Date(p.createdAt) : new Date(0)
    return ts > cutoff
  })

  if (newFriendPosts.length > 0) {
    // Show a numbered badge on the extension icon
    const count = newFriendPosts.length > 9 ? "9+" : String(newFriendPosts.length)
    chrome.action.setBadgeText({ text: count })
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" })
  } else {
    chrome.action.setBadgeText({ text: "" })
  }
}

// Returns the UIDs of users who have an accepted friendship with myUid.
async function fetchFriendUids(myUid) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/friendRequests?key=${API_KEY}`
  try {
    const res  = await fetch(endpoint)
    if (!res.ok) return []
    const json = await res.json()
    const docs = Array.isArray(json.documents) ? json.documents : []

    const uids = []
    for (const doc of docs) {
      const f = doc.fields || {}
      if (f.status?.stringValue !== "accepted") continue
      const from = f.fromUid?.stringValue
      const to   = f.toUid?.stringValue
      if (from === myUid) uids.push(to)
      if (to   === myUid) uids.push(from)
    }
    return uids
  } catch {
    return []
  }
}

// Fetches the most recent posts from Firestore (all of them — same as the feed).
async function fetchRecentPosts() {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?key=${API_KEY}`
  try {
    const res  = await fetch(endpoint)
    if (!res.ok) return []
    const json = await res.json()
    const docs = Array.isArray(json.documents) ? json.documents : []
    return docs.map(doc => ({
      userId:    doc.fields?.userId?.stringValue       || "",
      createdAt: doc.fields?.createdAt?.timestampValue || ""
    }))
  } catch {
    return []
  }
}