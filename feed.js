const listEl = document.getElementById("list")
const statusEl = document.getElementById("status")
const refreshBtn = document.getElementById("refreshBtn")
const emptyEl = document.getElementById("emptyState")
const loginBtn = document.getElementById("loginBtn")
const subtitleEl = document.querySelector(".subtitle")

const PROJECT_ID = "loess-eecf3"
const API_KEY = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

async function getMyUid() {
  const { losslessUser } = await chrome.storage.local.get({ losslessUser: null })
  return losslessUser?.uid || ""
}

async function applyAuthState(uid) {
  if (!uid) {
    listEl.innerHTML = ""
    listEl.style.display = "none"
    if (emptyEl) emptyEl.style.display = "none"

    refreshBtn.style.display = "none"
    subtitleEl.textContent = "Log in to share and delete posts"
    setStatus("")
    if (loginBtn) loginBtn.style.display = "inline-block"
    return false
  }

  listEl.style.display = "block"
  refreshBtn.style.display = "inline-block"
  subtitleEl.textContent = "Your feed"
  if (loginBtn) loginBtn.style.display = "none"
  return true
}

if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    const EXT_ID = "mckakiknjelbdopllgpophlelnhodfmi"
    window.open(`login.html?extId=${EXT_ID}`, "_blank")
  })
}

function setStatus(t) {
  statusEl.textContent = t || ""
}

function escapeHtml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function prettyTime(iso) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString()
}

function parseDoc(doc) {
  const f = doc.fields || {}
  const s = (k) => f?.[k]?.stringValue || ""
  const t = (k) => f?.[k]?.timestampValue || ""

  return {
    id: doc.name,
    userId: s("userId"),
    userName: s("userName"),
    track: s("track"),
    artist: s("artist"),
    service: s("service"),
    url: s("url"),
    createdAt: t("createdAt")
  }
}

async function fetchPosts() {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?key=${API_KEY}`
  )
  const json = await res.json()
  return (json.documents || [])
    .map(parseDoc)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

async function deletePostByName(docName) {
  await fetch(
    `https://firestore.googleapis.com/v1/${docName}?key=${API_KEY}`,
    { method: "DELETE" }
  )
}

function render(posts, uid) {
  if (!posts.length) {
    listEl.innerHTML = ""
    if (emptyEl) emptyEl.style.display = "block"
    return
  }

  if (emptyEl) emptyEl.style.display = "none"

  listEl.innerHTML = posts.map(p => {
    const canDelete = uid && p.userId === uid

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
          ${canDelete ? `<button class="deleteBtn" data-doc="${p.id}">Delete</button>` : ""}
        </div>
      </div>
    `
  }).join("")
}

async function load() {
  const uid = await getMyUid()
  if (!(await applyAuthState(uid))) return

  setStatus("Loading…")
  const posts = await fetchPosts()
  render(posts, uid)
  setStatus("")
}

refreshBtn.addEventListener("click", load)

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".deleteBtn")
  if (!btn) return
  if (!confirm("Delete this post?")) return
  await deletePostByName(btn.dataset.doc)
  load()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.losslessUser) load()
})

load()
setInterval(load, 10000)
