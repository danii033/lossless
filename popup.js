const trackEl   = document.getElementById("track")
const artistEl  = document.getElementById("artist")
const serviceEl = document.getElementById("service")
const statusEl  = document.getElementById("status")
const shareBtn  = document.getElementById("shareBtn")
const loginBtn  = document.getElementById("loginBtn")
const feedBtn   = document.getElementById("feedBtn")
const userBlock = document.getElementById("userBlock")
const userBadge = document.getElementById("userBadge")
const resetBtn  = document.getElementById("resetBtn")

let currentSharePayload = null

function setStatus(t) {
  statusEl.textContent = t || ""
}

function setShareEnabled(v) {
  shareBtn.disabled = !v
}

async function getLoggedInUser() {
  const { losslessUser } = await chrome.storage.local.get({ losslessUser: null })
  return losslessUser
}

async function refreshAuthUI() {
  const user = await getLoggedInUser()

  if (!user) {
    userBlock.style.display = "none"
    setShareEnabled(false)
    setStatus("Not logged in")
    return
  }

  userBadge.textContent = `Logged in as: ${user.displayName || "User"}`
  userBlock.style.display = "block"
  setStatus("")
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

async function extractFromTab(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const norm = (t) => (t || "").replace(/\s+/g, " ").trim()

      const url  = location.href
      const host = location.host

      const ogTitle = document.querySelector('meta[property="og:title"]')?.content  || ""
      const ogDesc  = document.querySelector('meta[property="og:description"]')?.content || ""

      const data = {
        url,
        service: "Unknown",
        track:   "",
        artist:  ""
      }

      // YOUTUBE MUSIC
      if (host.includes("music.youtube.com")) {
        const t1 = document.querySelector("ytmusic-player-bar .title")?.textContent
        const a1 = document.querySelector("ytmusic-player-bar .byline")?.textContent

        data.service = "YouTube Music"
        data.track   = norm(t1) || norm(ogTitle)

        if (a1) {
          data.artist = norm(a1.split("•")[0])
        } else {
          data.artist = norm(ogDesc)
        }
      }

      // YOUTUBE
      else if (host.includes("youtube.com")) {
        data.service = "YouTube"

        const title =
          norm(document.querySelector("h1.ytd-watch-metadata")?.textContent) ||
          norm(ogTitle)

        const channel =
          norm(document.querySelector("#channel-name #text")?.textContent) || ""

        data.track  = title
        data.artist = channel
      }

      // APPLE MUSIC
      else if (host.includes("music.apple.com")) {
        data.service = "Apple Music"
        data.track   = norm(ogTitle)

        if (ogDesc.includes("·")) {
          data.artist = norm(ogDesc.split("·")[1])
        } else {
          data.artist = norm(ogDesc)
        }
      }

      // SPOTIFY
      else if (host.includes("open.spotify.com")) {
        data.service = "Spotify"

        const title = document.title || ""

        // Spotify tab title format: "Song · Artist"
        if (title.includes("·")) {
          const parts = title.split("·")
          data.track  = parts[0]?.trim() || ""
          data.artist = parts[1]?.trim() || ""
        } else {
          data.track  = title.trim()
          data.artist = ""
        }
      }

      // FALLBACK
      else {
        data.track  = norm(ogTitle)
        data.artist = norm(ogDesc)
      }

      return data
    }
  })

  return result
}

async function refreshPreview() {
  const user = await getLoggedInUser()
  if (!user) return

  const tab = await getActiveTab()
  if (!tab?.id) return

  const extracted = await extractFromTab(tab.id)
  if (!extracted.track) return

  trackEl.textContent   = extracted.track
  artistEl.textContent  = extracted.artist
  serviceEl.textContent = extracted.service

  currentSharePayload = { ...extracted, user }
  setShareEnabled(true)
}

shareBtn.addEventListener("click", () => {
  if (!currentSharePayload) return
  chrome.runtime.sendMessage({
    type:    "LOSSLESS_SHARE",
    payload: currentSharePayload
  })
  setStatus("Shared")
})

// -----------------------------------------------------------------------
// Open login.html from INSIDE the extension using chrome.runtime.getURL.
// This gives a stable chrome-extension://<ID>/login.html URL that works
// for any user on any machine — the ID is always correct because the page
// is served from the extension itself.
// -----------------------------------------------------------------------
loginBtn.addEventListener("click", () => {
  const loginUrl = chrome.runtime.getURL("login.html")
  chrome.tabs.create({ url: loginUrl })
})

// Same approach for the feed — open it as an extension page
feedBtn.addEventListener("click", () => {
  const feedUrl = chrome.runtime.getURL("feed.html")
  chrome.tabs.create({ url: feedUrl })
})

resetBtn.addEventListener("click", async () => {
  const ok = confirm("Reset login and require sign in again?")
  if (!ok) return

  await chrome.storage.local.remove("losslessUser")

  userBadge.textContent    = ""
  userBlock.style.display  = "none"
  setShareEnabled(false)
  setStatus("Login reset. Please log in again.")
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local")      return
  if (!changes.losslessUser) return
  refreshAuthUI()
  refreshPreview()
})

refreshAuthUI()
refreshPreview()