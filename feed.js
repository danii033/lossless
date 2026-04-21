const listEl     = document.getElementById("list")
const statusEl   = document.getElementById("status")
const refreshBtn = document.getElementById("refreshBtn")
const emptyEl    = document.getElementById("emptyState")
const loginBtn   = document.getElementById("loginBtn")
const logoutBtn  = document.getElementById("logoutBtn")
const subtitleEl = document.querySelector(".subtitle")

const PROJECT_ID = "loess-eecf3"
const API_KEY    = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

// Admin uid — this user can delete any post and any comment
const ADMIN_UID = "109116641420331267538"

let MY_USER = null
let MY_UID  = ""

/* ---------- INIT ---------- */

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
    subtitleEl.textContent = "Log in to share and delete posts"
    refreshBtn.style.display = "none"
    if (logoutBtn) logoutBtn.style.display = "none"
    if (loginBtn)  loginBtn.style.display  = "inline-block"
  } else {
    subtitleEl.textContent = "Your feed"
    refreshBtn.style.display = "inline-block"
    if (logoutBtn) logoutBtn.style.display = "inline-block"
    if (loginBtn)  loginBtn.style.display  = "none"
  }
}

if (loginBtn) {
  loginBtn.addEventListener("click", () => {
    window.open(chrome.runtime.getURL("login.html"), "_blank")
  })
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    const ok = confirm("Log out of Lossless?")
    if (!ok) return
    await chrome.storage.local.remove("losslessUser")
    MY_USER = null
    MY_UID  = ""
    listEl.innerHTML = ""
    if (emptyEl) emptyEl.style.display = "none"
    refreshBtn.style.display = "none"
    logoutBtn.style.display  = "none"
    if (loginBtn) loginBtn.style.display = "inline-block"
    subtitleEl.textContent = "Log in to share and delete posts"
    statusEl.textContent   = ""
  })
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local")      return
  if (!changes.losslessUser) return
  MY_USER = changes.losslessUser.newValue || null
  MY_UID  = MY_USER?.uid || ""
  applyAuthUI()
  if (MY_UID) load()
})

/* ---------- HELPERS ---------- */

function setStatus(t) { statusEl.textContent = t || "" }

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

  // Admin sees the exact timestamp
  if (MY_UID === ADMIN_UID) return d.toLocaleString()

  // Everyone else sees relative time
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60)                        return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)                        return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)                          return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7)                            return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4)                           return `${weeks}w ago`

  // Anything older than 4 weeks shows month and year
  return d.toLocaleDateString("en-GB", { month: "long", year: "2-digit" }).replace(" ", " '")
}

function docId(fullName) {
  return fullName.split("/").pop()
}

function parseDoc(doc) {
  const f      = doc.fields || {}
  const getStr = (k) => f?.[k]?.stringValue   || ""
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

/* ---------- FIRESTORE — POSTS ---------- */

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

/* ---------- FIRESTORE — COMMENTS ---------- */

async function fetchComments(postId) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts/${postId}/comments?key=${API_KEY}`
  const res  = await fetch(endpoint)
  if (!res.ok) return []
  const json = await res.json()
  const docs = Array.isArray(json.documents) ? json.documents : []

  const comments = docs.map(doc => ({
    id:        doc.name,
    userName:  doc.fields?.userName?.stringValue     || "User",
    userId:    doc.fields?.userId?.stringValue       || "",
    text:      doc.fields?.text?.stringValue         || "",
    createdAt: doc.fields?.createdAt?.timestampValue || ""
  }))

  comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  return comments
}

async function deleteComment(commentDocName) {
  const endpoint = `https://firestore.googleapis.com/v1/${commentDocName}?key=${API_KEY}`
  const res = await fetch(endpoint, { method: "DELETE" })
  if (!res.ok) throw new Error("Comment delete failed")
}

async function submitComment(postId, text) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts/${postId}/comments?key=${API_KEY}`
  await fetch(endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        userName:  { stringValue:    MY_USER?.displayName || "User" },
        userId:    { stringValue:    MY_UID },
        text:      { stringValue:    text },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    })
  })
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
    const canDelete = MY_UID && (p.userId === MY_UID || MY_UID === ADMIN_UID)
    const pid       = docId(p.id)

    return `
      <div class="card" id="card-${pid}">

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

        <div class="commentsSection">
          <div class="commentList" id="comments-${pid}"></div>
          ${MY_UID ? `
            <div class="commentInputRow">
              <input class="commentInput" type="text" placeholder="Add a comment…" data-post="${pid}" />
              <button class="commentSubmit" data-post="${pid}">Post</button>
            </div>
          ` : ""}
        </div>

      </div>
    `
  }).join("")

  posts.forEach(p => loadComments(docId(p.id)))
}

/* ---------- LOAD COMMENTS FOR ONE POST ---------- */

async function loadComments(postId) {
  const container = document.getElementById(`comments-${postId}`)
  if (!container) return

  const comments = await fetchComments(postId)

  if (!comments.length) {
    container.innerHTML = ""
    return
  }

  container.innerHTML = comments.map(c => {
    const canDeleteComment = MY_UID && (c.userId === MY_UID || MY_UID === ADMIN_UID)
    return `
      <div class="commentItem">
        <span class="commentAuthor">${escapeHtml(c.userName)}</span>
        <span>${escapeHtml(c.text)}</span>
        <span class="commentTime">${escapeHtml(prettyTime(c.createdAt))}</span>
        ${canDeleteComment ? `<button class="commentDeleteBtn" data-post="${postId}" data-comment="${escapeHtml(c.id)}">🗑️</button>` : ""}
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

/* ---------- EVENT DELEGATION ---------- */

refreshBtn.addEventListener("click", load)

listEl.addEventListener("click", async (e) => {

  // Delete post
  const deleteBtn = e.target.closest(".deleteBtn")
  if (deleteBtn) {
    if (!confirm("Delete this post?")) return
    await deletePostByName(deleteBtn.dataset.doc)
    load()
    return
  }

  // Delete comment
  const commentDeleteBtn = e.target.closest(".commentDeleteBtn")
  if (commentDeleteBtn && MY_UID) {
    const postId      = commentDeleteBtn.dataset.post
    const commentName = commentDeleteBtn.dataset.comment
    await deleteComment(commentName)
    loadComments(postId)
    return
  }

  // Submit comment via button
  const submitBtn = e.target.closest(".commentSubmit")
  if (submitBtn && MY_UID) {
    const postId = submitBtn.dataset.post
    const input  = listEl.querySelector(`.commentInput[data-post="${postId}"]`)
    const text   = input?.value?.trim()
    if (!text) return
    input.value = ""
    await submitComment(postId, text)
    loadComments(postId)
    return
  }
})

// Submit comment via Enter key
listEl.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return
  const input = e.target.closest(".commentInput")
  if (!input || !MY_UID) return
  const postId = input.dataset.post
  const text   = input.value.trim()
  if (!text) return
  input.value = ""
  await submitComment(postId, text)
  loadComments(postId)
})

// Pause auto-refresh while user is typing a comment
let typingInComment = false
document.addEventListener("focusin",  (e) => { if (e.target.classList.contains("commentInput")) typingInComment = true  })
document.addEventListener("focusout", (e) => { if (e.target.classList.contains("commentInput")) typingInComment = false })

setInterval(() => { if (!typingInComment) load() }, 10000)

init()