const PROJECT_ID = "loess-eecf3"
const API_KEY = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

async function writePostToFirestore(payload) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?key=${API_KEY}`

  const user = payload.user || {}
  const body = {
    fields: {
      userId: { stringValue: user.uid || "" },
      userName: { stringValue: user.displayName || "User" },
      track: { stringValue: payload.track || "" },
      artist: { stringValue: payload.artist || "" },
      service: { stringValue: payload.service || "" },
      url: { stringValue: payload.url || "" },
      createdAt: { timestampValue: new Date().toISOString() }
    }
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    throw new Error("Firestore write failed")
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "LOSSLESS_SHARE") return

  writePostToFirestore(msg.payload)
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: String(e) }))

  return true
})

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== "LOSSLESS_LOGIN") return

  chrome.storage.local.set({ losslessUser: message.user }, () => {
    sendResponse({ ok: true })
  })

  return true
})
