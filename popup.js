const trackEl   = document.getElementById("track")
const artistEl  = document.getElementById("artist")
const serviceEl = document.getElementById("service")
const statusEl  = document.getElementById("status")
const shareBtn  = document.getElementById("shareBtn")
const loginBtn  = document.getElementById("loginBtn")
const logoutBtn = document.getElementById("logoutBtn")
const feedBtn   = document.getElementById("feedBtn")
const userBlock = document.getElementById("userBlock")
const userBadge = document.getElementById("userBadge")
const resetBtn  = document.getElementById("resetBtn")
 
let currentSharePayload = null
 
// Must match ADMIN_UID in feed.js
const ADMIN_UID = "109116641420331267538"
 
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
    // Not logged in: show Login, hide Log out and userBlock
    loginBtn.style.display  = "block"
    logoutBtn.style.display = "none"
    userBlock.style.display = "none"
    setShareEnabled(false)
    setStatus("Not logged in")
    return
  }
 
  // Logged in: hide Login, show Log out and userBlock
  loginBtn.style.display  = "none"
  logoutBtn.style.display = "block"
  userBlock.style.display = "block"
 
  // Show admin badge if this is the admin account
  const isAdmin = user.uid === ADMIN_UID
  userBadge.innerHTML = `
    Logged in as: ${user.displayName || "User"}
    ${isAdmin ? '<span id="adminBadge">⚙️ Admin</span>' : ""}
  `
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
 
      const data = { url, service: "Unknown", track: "", artist: "" }
 
      // YOUTUBE MUSIC
      if (host.includes("music.youtube.com")) {
        const t1 = document.querySelector("ytmusic-player-bar .title")?.textContent
        const a1 = document.querySelector("ytmusic-player-bar .byline")?.textContent
        data.service = "YouTube Music"
        data.track   = norm(t1) || norm(ogTitle)
        data.artist  = a1 ? norm(a1.split("•")[0]) : norm(ogDesc)
      }
 
      // YOUTUBE
      else if (host.includes("youtube.com")) {
        data.service = "YouTube"
        data.track   = norm(document.querySelector("h1.ytd-watch-metadata")?.textContent) || norm(ogTitle)
        data.artist  = norm(document.querySelector("#channel-name #text")?.textContent) || ""
      }
 
      // APPLE MUSIC
      else if (host.includes("music.apple.com")) {
        data.service = "Apple Music"
        data.track   = norm(ogTitle)
        data.artist  = ogDesc.includes("·") ? norm(ogDesc.split("·")[1]) : norm(ogDesc)
      }
 
      // SPOTIFY
      else if (host.includes("open.spotify.com")) {
        data.service = "Spotify"
        const title  = document.title || ""
        if (title.includes("·")) {
          const parts = title.split("·")
          data.track  = parts[0]?.trim() || ""
          data.artist = parts[1]?.trim() || ""
        } else {
          data.track = title.trim()
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
 
/* ---------- BUTTON LISTENERS ---------- */
 
shareBtn.addEventListener("click", () => {
  if (!currentSharePayload) return
  chrome.runtime.sendMessage({ type: "LOSSLESS_SHARE", payload: currentSharePayload })
  setStatus("Shared")
})
 
// Show login page
loginBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("login.html") })
})
 
// Log out — clear storage and reset UI
logoutBtn.addEventListener("click", async () => {
  const ok = confirm("Log out of Lossless?")
  if (!ok) return
 
  await chrome.storage.local.remove("losslessUser")
 
  loginBtn.style.display  = "block"
  logoutBtn.style.display = "none"
  userBlock.style.display = "none"
  userBadge.textContent   = ""
  setShareEnabled(false)
  setStatus("Logged out.")
})
 
// Switch account — opens login.html which always shows the account picker
resetBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("login.html") })
})
 
feedBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("feed.html") })
})
 
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local")      return
  if (!changes.losslessUser) return
  refreshAuthUI()
  refreshPreview()
})
 
refreshAuthUI()
refreshPreview()