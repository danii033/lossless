const trackEl = document.getElementById("track")
const artistEl = document.getElementById("artist")
const serviceEl = document.getElementById("service")
const statusEl = document.getElementById("status")
const shareBtn = document.getElementById("shareBtn")
const loginBtn = document.getElementById("loginBtn")
const feedBtn = document.getElementById("feedBtn")
const userBlock = document.getElementById("userBlock")
const userBadge = document.getElementById("userBadge")
const resetBtn = document.getElementById("resetBtn")

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
      const ogTitle = document.querySelector('meta[property="og:title"]')?.content || ""
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content || ""

      return {
        url: location.href,
        service: location.host.includes("youtube") ? "YouTube" : "Unknown",
        track: norm(ogTitle),
        artist: norm(ogDesc)
      }
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

  trackEl.textContent = extracted.track
  artistEl.textContent = extracted.artist
  serviceEl.textContent = extracted.service

  currentSharePayload = { ...extracted, user }
  setShareEnabled(true)
}

shareBtn.addEventListener("click", () => {
  if (!currentSharePayload) return
  chrome.runtime.sendMessage({
    type: "LOSSLESS_SHARE",
    payload: currentSharePayload
  })
  setStatus("Shared")
})

loginBtn.addEventListener("click", () => {
  const extId = chrome.runtime.id
  window.open(`http://127.0.0.1:5500/login.html?extId=${extId}`, "_blank")
})

feedBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: "http://127.0.0.1:5500/feed.html" })
})

resetBtn.addEventListener("click", async () => {
  const ok = confirm("Reset login and require sign in again?")
  if (!ok) return

  await chrome.storage.local.remove("losslessUser")

  userBadge.textContent = ""
  userBlock.style.display = "none"
  setShareEnabled(false)
  setStatus("Login reset. Please log in again.")
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  if (!changes.losslessUser) return
  refreshAuthUI()
})

refreshAuthUI()
refreshPreview()
