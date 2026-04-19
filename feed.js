const listEl     = document.getElementById("list")
const statusEl   = document.getElementById("status")
const refreshBtn = document.getElementById("refreshBtn")
const emptyEl    = document.getElementById("emptyState")
const loginBtn   = document.getElementById("loginBtn")
const logoutBtn  = document.getElementById("logoutBtn")
const subtitleEl = document.querySelector(".subtitle")

const PROJECT_ID = "loess-eecf3"
const API_KEY    = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

// Admin uid — this user can delete any post
const ADMIN_UID = "109116641420331267538"

// The 6 emojis available for reactions
const EMOJIS = ["❤️", "👍", "😂", "😛", "🔥", "☹️"]

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
  return d.toLocaleString()
}

// Extract the short document ID from the full Firestore path
// e.g. "projects/x/databases/(default)/documents/posts/ABC123" → "ABC123"
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

/* ---------- FIRESTORE — REACTIONS ---------- */

// Fetch all reactions for a post. Returns an object like:
// { "❤️": ["uid1", "uid2"], "👍": ["uid3"] }
async function fetchReactions(postId) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts/${postId}/reactions?key=${API_KEY}`
  const res  = await fetch(endpoint)
  if (!res.ok) return {}
  const json = await res.json()
  const docs = Array.isArray(json.documents) ? json.documents : []

  const result = {}
  for (const doc of docs) {
    const uid   = docId(doc.name)
    const emoji = doc.fields?.emoji?.stringValue
    if (!emoji) continue
    if (!result[emoji]) result[emoji] = []
    result[emoji].push(uid)
  }
  return result
}

// Toggle a reaction — if the user already reacted with this emoji, remove it.
// Otherwise write/overwrite their reaction document with the new emoji.
async function toggleReaction(postId, emoji) {
  const docPath = `projects/${PROJECT_ID}/databases/(default)/documents/posts/${postId}/reactions/${MY_UID}`
  const getUrl  = `https://firestore.googleapis.com/v1/${docPath}?key=${API_KEY}`

  // Check if user already has a reaction on this post
  const existing = await fetch(getUrl)

  if (existing.ok) {
    const data         = await existing.json()
    const currentEmoji = data.fields?.emoji?.stringValue

    if (currentEmoji === emoji) {
      // Same emoji — remove the reaction
      await fetch(getUrl, { method: "DELETE" })
      return
    }
  }

  // Write or overwrite with the new emoji
  await fetch(getUrl, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        emoji:    { stringValue: emoji },
        userName: { stringValue: MY_USER?.displayName || "" }
      }
    })
  })
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
    userName:  doc.fields?.userName?.stringValue  || "User",
    text:      doc.fields?.text?.stringValue      || "",
    createdAt: doc.fields?.createdAt?.timestampValue || ""
  }))

  comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  return comments
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

  // Admin can delete any post; normal users only their own
  listEl.innerHTML = posts.map((p) => {
    const canDelete = MY_UID && (p.userId === MY_UID || MY_UID === ADMIN_UID)
    const pid       = docId(p.id)

    // Build the emoji picker bar (hidden until card hover)
    const emojiButtons = EMOJIS.map(e =>
      `<button class="emojiBtn" data-post="${pid}" data-emoji="${e}">${e}</button>`
    ).join("")

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

        <!-- Reaction counts sit above comments -->
        <div class="reactionCounts" id="reactions-${pid}"></div>

        <!-- Comments section — emoji bar lives inside the input row -->
        <div class="commentsSection">
          <div class="commentList" id="comments-${pid}"></div>
          ${MY_UID ? `
            <div class="commentInputRow">
              <input class="commentInput" type="text" placeholder="Add a comment…" data-post="${pid}" />
              <div class="emojiBar">${emojiButtons}</div>
              <button class="commentSubmit" data-post="${pid}">Post</button>
            </div>
          ` : ""}
        </div>

      </div>
    `
  }).join("")

  // After rendering, load reactions and comments for each post
  posts.forEach(p => {
    const pid = docId(p.id)
    loadReactions(pid)
    loadComments(pid)
  })
}

/* ---------- LOAD REACTIONS FOR ONE POST ---------- */

async function loadReactions(postId) {
  const container = document.getElementById(`reactions-${postId}`)
  if (!container) return

  const reactions = await fetchReactions(postId)

  // Only show emojis that have at least one reaction
  container.innerHTML = Object.entries(reactions)
    .filter(([, uids]) => uids.length > 0)
    .map(([emoji, uids]) => {
      const iMine = MY_UID && uids.includes(MY_UID)
      return `
        <span class="reactionPill ${iMine ? "mine" : ""}"
              data-post="${postId}" data-emoji="${emoji}">
          ${emoji} ${uids.length}
        </span>
      `
    }).join("")
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

  container.innerHTML = comments.map(c => `
    <div class="commentItem">
      <span class="commentAuthor">${escapeHtml(c.userName)}</span>
      <span>${escapeHtml(c.text)}</span>
      <span class="commentTime">${escapeHtml(prettyTime(c.createdAt))}</span>
    </div>
  `).join("")
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

  // Emoji button in the hover bar
  const emojiBtn = e.target.closest(".emojiBtn")
  if (emojiBtn && MY_UID) {
    const postId = emojiBtn.dataset.post
    const emoji  = emojiBtn.dataset.emoji
    await toggleReaction(postId, emoji)
    loadReactions(postId)
    return
  }

  // Reaction pill (clicking an existing reaction also toggles it)
  const pill = e.target.closest(".reactionPill")
  if (pill && MY_UID) {
    const postId = pill.dataset.post
    const emoji  = pill.dataset.emoji
    await toggleReaction(postId, emoji)
    loadReactions(postId)
    return
  }

  // Comment submit button
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

// Allow pressing Enter to submit a comment
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

setInterval(load, 10000)

init()