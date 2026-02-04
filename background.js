const PROJECT_ID = "loess-eecf3"
const API_KEY = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

async function writePostToFirestore(payload) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?key=${API_KEY}`

  const user = payload.user || {}
  const userId = user.uid || ""
  const userName = user.displayName || user.email || "User"

  const body = {
    fields: {
      userId: { stringValue: userId },
      userName: { stringValue: userName },
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
    const txt = await res.text().catch(() => "")
    throw new Error("Firestore write failed " + txt)
  }

  return res.json()
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "LOSSLESS_SHARE") {
    chrome.storage.local.get({ shares: [] }, (data) => {
      const shares = Array.isArray(data.shares) ? data.shares : []
      shares.unshift(msg.payload)

      chrome.storage.local.set({ shares }, async () => {
        try {
          await writePostToFirestore(msg.payload)
          sendResponse({ ok: true, saved: msg.payload, count: shares.length })
        } catch (e) {
          console.error(e)
          sendResponse({
            ok: false,
            error: String(e?.message || e),
            saved: msg.payload,
            count: shares.length
          })
        }
      })
    })

    return true
  }

  //ADDED: handle logout 
  if (msg?.type === "LOSSLESS_LOGOUT") {
    chrome.storage.local.remove("losslessUser")

    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && tab.url.includes("feed.html")) {
          chrome.tabs.reload(tab.id)
        }
      })
    })
  }
})

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type !== "LOSSLESS_LOGIN") return

  chrome.storage.local.set({ losslessUser: message.user }, () => {
    sendResponse({ ok: true })
  })

  return true
})
