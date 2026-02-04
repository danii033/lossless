const trackEl = document.getElementById("track")
const artistEl = document.getElementById("artist")
const serviceEl = document.getElementById("service")
const statusEl = document.getElementById("status")
const shareBtn = document.getElementById("shareBtn")
const loginBtn = document.getElementById("loginBtn")
const feedBtn = document.getElementById("feedBtn")
const logoutBtn = document.getElementById("logoutBtn")

async function updateAuthUI() {
    const { losslessUser } = await chrome.storage.local.get({ losslessUser: null })
  
    if (losslessUser) {
      logoutBtn.style.display = "block"
      loginBtn.style.display = "none"
    } else {
      logoutBtn.style.display = "none"
      loginBtn.style.display = "block"
    }
  }  

let currentSharePayload = null

function setStatus(text) {
  statusEl.textContent = text || ""
}

function setShareEnabled(enabled) {
  shareBtn.disabled = !enabled
  shareBtn.style.opacity = enabled ? "1" : "0.6"
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

function normalize(text) {
  return (text || "").replace(/\s+/g, " ").trim()
}

async function extractFromTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const norm = (t) => (t || "").replace(/\s+/g, " ").trim()

      const url = location.href
      const host = location.host

      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || ""
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content || ""

      const data = {
        url,
        service: host.includes("music.apple.com")
          ? "Apple Music"
          : host.includes("music.youtube.com")
          ? "YouTube Music"
          : host.includes("youtube.com")
          ? "YouTube"
          : "Unknown",
        track: "",
        artist: ""
      }

      if (host.includes("music.youtube.com")) {
        const t1 = document.querySelector("ytmusic-player-bar .title")?.textContent
        const a1 = document.querySelector("ytmusic-player-bar .byline")?.textContent

        data.track = norm(t1) || norm(ogTitle)

        const byline = norm(a1)
        if (byline) {
          const firstLine = byline.split("•")[0]
          data.artist = norm(firstLine)
        } else {
          data.artist = norm(ogDesc)
        }
      } else if (host.includes("music.apple.com")) {
        data.track = norm(ogTitle)

        const desc = norm(ogDesc)
        if (desc) {
          const parts = desc.split("·")
          if (parts.length >= 2) data.artist = norm(parts[1])
          else data.artist = desc
        }
      } else if (host.includes("youtube.com")) {
        const title =
          norm(document.querySelector("h1.ytd-watch-metadata")?.textContent) ||
          norm(document.querySelector("h1")?.textContent) ||
          norm(ogTitle)

        const channel =
          norm(document.querySelector("#channel-name #text")?.textContent) ||
          norm(document.querySelector("ytd-channel-name a")?.textContent) ||
          ""

        data.track = title
        data.artist = channel
      } else {
        data.track = norm(ogTitle)
        data.artist = norm(ogDesc)
      }

      return data
    }
  })

  return result
}

async function getLoggedInUser() {
  const data = await chrome.storage.local.get({ losslessUser: null })
  return data.losslessUser
}

async function refreshPreview() {
  setStatus("Reading track info…")
  setShareEnabled(false)
  currentSharePayload = null

  const user = await getLoggedInUser()

  if (!user) {
    loginBtn.style.display = "block"
    setStatus("Please log in to share")
    return
  }

  loginBtn.style.display = "none"

  const tab = await getActiveTab()
  if (!tab?.id || !tab?.url) {
    trackEl.textContent = "No active tab found"
    artistEl.textContent = ""
    serviceEl.textContent = ""
    setStatus("")
    return
  }

  try {
    const extracted = await extractFromTab(tab.id)

    const track = normalize(extracted.track)
    const artist = normalize(extracted.artist)

    if (!track) {
      trackEl.textContent = "Open a track page"
      artistEl.textContent = ""
      serviceEl.textContent = ""
      setStatus("No track detected on this page")
      return
    }

    trackEl.textContent = track
    artistEl.textContent = artist ? artist : "Artist unknown"
    serviceEl.textContent = extracted.service

    currentSharePayload = {
      url: extracted.url,
      service: extracted.service,
      track,
      artist,
      sharedAt: new Date().toISOString(),
      user
    }

    setShareEnabled(true)
    setStatus("Ready to share")
  } catch (err) {
    trackEl.textContent = "Could not read track"
    artistEl.textContent = ""
    serviceEl.textContent = ""
    currentSharePayload = null
    setStatus(String(err?.message || err))
  }
}

shareBtn.addEventListener("click", () => {
  if (!currentSharePayload) return

  setStatus("Sharing…")
  setShareEnabled(false)

  chrome.runtime.sendMessage(
    { type: "LOSSLESS_SHARE", payload: currentSharePayload },
    (res) => {
      if (chrome.runtime.lastError) {
        setStatus("Error: " + chrome.runtime.lastError.message)
        setShareEnabled(true)
        return
      }
      setStatus("Shared")
      setShareEnabled(true)
    }
  )
})

loginBtn.addEventListener("click", () => {
    const extId = chrome.runtime.id
    const url = `http://127.0.0.1:5500/login.html?extId=${encodeURIComponent(extId)}`
  
    chrome.windows.create(
      {
        url,
        type: "popup",
        width: 420,
        height: 640
      }
    )
  })

  feedBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "http://127.0.0.1:5500/feed.html" })
  })


logoutBtn.addEventListener("click", () => {
    const ok = confirm("Sign out of Lossless?")
    if (!ok) return
  
    chrome.storage.local.remove("losslessUser", () => {
      setStatus("Signed out")
      setShareEnabled(false)
      logoutBtn.style.display = "none"
    })
  })
  
  
  

updateAuthUI()

refreshPreview()
