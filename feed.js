const listEl      = document.getElementById("list")
const statusEl    = document.getElementById("status")
const refreshBtn  = document.getElementById("refreshBtn")
const emptyEl     = document.getElementById("emptyState")
const loginBtn    = document.getElementById("loginBtn")
const logoutBtn   = document.getElementById("logoutBtn")
const subtitleEl  = document.querySelector(".subtitle")

const PROJECT_ID = "loess-eecf3"
const API_KEY    = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

// -------------------------------------------------------------------------
// MY_USER holds the full user object (uid, displayName).
// We read it from chrome.storage.local — the same place login.html writes it.
// This works regardless of which machine or extension ID is in use.
// -------------------------------------------------------------------------
let MY_USER = null
let MY_UID  = ""

/* ---------- INIT ---------- */

// Load the user from storage, then set up the UI and start fetching posts.
async function init() {
  const { losslessUser } = await chrome.storage.local.get({ losslessUser: null })

  MY_USER = losslessUser || null
  MY_UID  = MY_USER?.uid || ""

  applyAuthUI()

  if (MY_UID) load()
}

/* ---------- AUTH UI ---------- */

function applyAuthUI() {
  if (!MY_UID) {
    subtitleEl.textContent       = "Log in to share and delete posts"
    refreshBtn.style.display     = "none"
    if (logoutBtn) logoutBtn.style.display = "none"
    if (loginBtn)  loginBtn.style.display  = "inline-block"
  } else {
    subtitleEl.textContent       = "Your feed"
    refreshBtn.style.display     = "inline-block"
    if (logoutBtn) logoutBtn.style.display = "inline-block"
    if (loginBtn)  loginBtn.style.display  = "none"
  }
}

if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    // Open login.html from inside the extension — works on any machine
    const loginUrl = chrome.runtime.getURL("login.html")
    window.open(loginUrl, "_blank")
  })
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    const ok = confirm("Log out of Lossless?")
    if (!ok) return

    // Clear storage
    await chrome.storage.local.remove("losslessUser")
    MY_USER = null
    MY_UID  = ""

    // Reset UI
    listEl.innerHTML = ""
    if (emptyEl) emptyEl.style.display = "none"
    refreshBtn.style.display = "none"
    logoutBtn.style.display  = "none"
    if (loginBtn) loginBtn.style.display = "inline-block"
    subtitleEl.textContent = "Log in to share and delete posts"
    statusEl.textContent   = ""
  })
}

// Listen for storage changes — if the user logs in from another tab,
// this page updates automatically without needing a manual refresh.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local")      return
  if (!changes.losslessUser) return

  MY_USER = changes.losslessUser.newValue || null
  MY_UID  = MY_USER?.uid || ""

  applyAuthUI()
  if (MY_UID) load()
})

/* ---------- HELPERS ---------- */

function setStatus(t) {
  statusEl.textContent = t || ""
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'", "&#039;")
}

function prettyTime(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString()
}

function parseDoc(doc) {
  const f      = doc.fields || {}
  const getStr = (k) => f?.[k]?.stringValue  || ""
  const getTs  = (k) => f?.[k]?.timestampValue || ""

  return {
    id:        doc.name || "",
    userName:  getStr("userName"),
    userId:    getStr("userId"),
    track:     getStr("track"),
    artist:    getStr("artist"),
    service:   getStr("service"),
    url:       getStr("url"),
    createdAt: getTs("createdAt")
  }
}

/* ---------- FIRESTORE ---------- */

async function fetchPosts() {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?key=${API_KEY}`

  const res = await fetch(endpoint)
  if (!res.ok) throw new Error("Failed to load feed")

  const json = await res.json()
  const docs  = Array.isArray(json.documents) ? json.documents : []
  const posts = docs.map(parseDoc)

  posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return posts
}

async function deletePostByName(docName) {
  const endpoint = `https://firestore.googleapis.com/v1/${docName}?key=${API_KEY}`
  const res = await fetch(endpoint, { method: "DELETE" })
  if (!res.ok) throw new Error("Delete failed")
}

/* ---------- RENDER ---------- */

function render(posts) {
  if (!posts.length) {
    listEl.innerHTML = ""
    if (emptyEl) emptyEl.style.display = "block"
    return
  }

  if (emptyEl) emptyEl.style.display = "none"

  listEl.innerHTML = posts.map((p) => {
    const canDelete = MY_UID && p.userId === MY_UID

    return `
      <div class="card">
        <div class="topline">
          <div class="user">${escapeHtml(p.userName || "User")}</div>
          <div class="time">${escapeHtml(prettyTime(p.createdAt))}</div>
        </div>

        <div class="track">${escapeHtml(p.track)}</div>
        <div class="row">
          <div class="meta">${escapeHtml(p.artist)}</div>
          <div class="pill">${escapeHtml(p.service)}</div>
        </div>

        <div class="actions">
          <a class="link" href="${escapeHtml(p.url)}" target="_blank">Open link</a>
          ${canDelete ? `<button class="deleteBtn" data-doc="${escapeHtml(p.id)}">Delete</button>` : ""}
        </div>
      </div>
    `
  }).join("")
}

/* ---------- LOAD ---------- */

async function load() {
  if (!MY_UID) return

  try {
    setStatus("Loading…")
    const posts = await fetchPosts()
    render(posts)
    setStatus("")
  } catch (e) {
    console.error(e)
    setStatus("Could not load feed")
  }
}

refreshBtn.addEventListener("click", load)

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".deleteBtn")
  if (!btn) return
  if (!confirm("Delete this post?")) return
  await deletePostByName(btn.dataset.doc)
  load()
})

setInterval(load, 10000)

// Kick everything off
init()