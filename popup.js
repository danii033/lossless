const trackEl = document.getElementById("track")
const artistEl = document.getElementById("artist")
const statusEl = document.getElementById("status")
const shareBtn = document.getElementById("shareBtn")
const loginBtn = document.getElementById("loginBtn")
const feedBtn = document.getElementById("feedBtn")
const userBadge = document.getElementById("userBadge")

let currentPayload = null

function setStatus(t) {
  statusEl.textContent = t || ""
}

async function getUser() {
  const data = await chrome.storage.local.get({ losslessUser: null })
  return data.losslessUser
}

async function extractTrack(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const ogTitle =
        document.querySelector('meta[property="og:title"]')?.content || ""
      const ogDesc =
        document.querySelector('meta[property="og:description"]')?.content || ""

      return {
        url: location.href,
        track: ogTitle,
        artist: ogDesc,
        service: "YouTube"
      }
    }
  })

  return result
}

async function refresh() {
  setStatus("")
  shareBtn.disabled = true

  const user = await getUser()

  if (user) {
    userBadge.style.display = "block"
    userBadge.textContent = `Logged in as: ${user.displayName || user.email}`
  } else {
    userBadge.style.display = "none"
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  const data = await extractTrack(tab.id)
  if (!data.track) {
    setStatus("No track detected")
    return
  }

  trackEl.textContent = data.track
  artistEl.textContent = data.artist

  if (!user) {
    setStatus("Login to share")
    return
  }

  currentPayload = { ...data, user }
  shareBtn.disabled = false
}

shareBtn.addEventListener("click", () => {
  if (!currentPayload) return
  chrome.runtime.sendMessage({
    type: "LOSSLESS_SHARE",
    payload: currentPayload
  })
  setStatus("Shared")
})

loginBtn.addEventListener("click", () => {
  const extId = chrome.runtime.id
  window.open(
    `http://127.0.0.1:5500/login.html?extId=${extId}`,
    "_blank"
  )
})

feedBtn.addEventListener("click", () => {
  chrome.tabs.create({
    url: "http://127.0.0.1:5500/feed.html"
  })
})

refresh()
