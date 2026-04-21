const listEl          = document.getElementById("list")
const statusEl        = document.getElementById("status")
const refreshBtn      = document.getElementById("refreshBtn")
const emptyEl         = document.getElementById("emptyState")
const loginBtn        = document.getElementById("loginBtn")
const logoutBtn       = document.getElementById("logoutBtn")
const subtitleEl      = document.querySelector(".subtitle")
const leftPanel       = document.getElementById("leftPanel")
const addFriendBtn    = document.getElementById("addFriendBtn")
const searchPanel     = document.getElementById("searchPanel")
const friendSearchInput = document.getElementById("friendSearchInput")
const searchResults   = document.getElementById("searchResults")
const friendsList     = document.getElementById("friendsList")
const requestsList    = document.getElementById("requestsList")
const requestsCard    = document.getElementById("requestsCard")

const PROJECT_ID = "loess-eecf3"
const API_KEY    = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"
const ADMIN_UID  = "109116641420331267538"

let MY_USER   = null
let MY_UID    = ""
let MY_FRIENDS = [] // array of uids of accepted friends

/* ---------- INIT ---------- */

async function init() {
  const { losslessUser } = await chrome.storage.local.get({ losslessUser: null })
  MY_USER = losslessUser || null
  MY_UID  = MY_USER?.uid || ""
  applyAuthUI()
  if (MY_UID) {
    await loadFriends()
    load()
    loadRequests()
  }
}

/* ---------- AUTH UI ---------- */

function applyAuthUI() {
  if (!MY_UID) {
    subtitleEl.textContent   = "Log in to see your feed"
    refreshBtn.style.display = "none"
    leftPanel.style.display  = "none"
    if (logoutBtn) logoutBtn.style.display = "none"
    if (loginBtn)  loginBtn.style.display  = "inline-block"
  } else {
    subtitleEl.textContent   = "Your feed"
    refreshBtn.style.display = "inline-block"
    leftPanel.style.display  = "flex"
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
    MY_USER    = null
    MY_UID     = ""
    MY_FRIENDS = []
    listEl.innerHTML     = ""
    leftPanel.style.display = "none"
    if (emptyEl) emptyEl.style.display = "none"
    refreshBtn.style.display = "none"
    logoutBtn.style.display  = "none"
    if (loginBtn) loginBtn.style.display = "inline-block"
    subtitleEl.textContent = "Log in to see your feed"
    statusEl.textContent   = ""
  })
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local")      return
  if (!changes.losslessUser) return
  MY_USER = changes.losslessUser.newValue || null
  MY_UID  = MY_USER?.uid || ""
  applyAuthUI()
  if (MY_UID) { loadFriends().then(load); loadRequests() }
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
  if (MY_UID === ADMIN_UID) return d.toLocaleString()
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60)   return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)   return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)     return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7)       return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4)      return `${weeks}w ago`
  return d.toLocaleDateString("en-GB", { month: "long", year: "2-digit" }).replace(" ", " '")
}

function docId(fullName) { return fullName.split("/").pop() }

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

/* ---------- FIRESTORE — USERS ---------- */

// Search users by display name (case-insensitive client-side filter)
async function searchUsers(query) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users?key=${API_KEY}`
  const res  = await fetch(endpoint)
  if (!res.ok) return []
  const json = await res.json()
  const docs = Array.isArray(json.documents) ? json.documents : []

  return docs
    .map(doc => ({
      uid:         doc.fields?.uid?.stringValue         || "",
      displayName: doc.fields?.displayName?.stringValue || ""
    }))
    .filter(u =>
      u.uid !== MY_UID &&  // exclude yourself
      u.displayName.toLowerCase().includes(query.toLowerCase())
    )
}

/* ---------- FIRESTORE — FRIENDS ---------- */

// Load all accepted friends for the current user
async function loadFriends() {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/friendRequests?key=${API_KEY}`
  const res  = await fetch(endpoint)
  if (!res.ok) { MY_FRIENDS = []; renderFriendsList([]); return }
  const json = await res.json()
  const docs = Array.isArray(json.documents) ? json.documents : []

  // A friendship exists when a request is accepted and involves the current user
  const friends = []
  for (const doc of docs) {
    const f      = doc.fields || {}
    const status = f.status?.stringValue
    const from   = f.fromUid?.stringValue
    const to     = f.toUid?.stringValue
    const fromName = f.fromName?.stringValue || ""
    const toName   = f.toName?.stringValue   || ""

    if (status !== "accepted") continue
    if (from === MY_UID) friends.push({ uid: to,   displayName: toName,   docName: doc.name })
    if (to   === MY_UID) friends.push({ uid: from, displayName: fromName, docName: doc.name })
  }

  MY_FRIENDS = friends.map(f => f.uid)
  renderFriendsList(friends)
}

function renderFriendsList(friends) {
  if (!friends.length) {
    friendsList.innerHTML = `<div class="emptyPanel">No friends yet</div>`
    return
  }
  friendsList.innerHTML = friends.map(f => `
    <div class="friendItem">
      <span>${escapeHtml(f.displayName)}</span>
      <button class="removeFriendBtn" data-doc="${escapeHtml(f.docName)}">Remove</button>
    </div>
  `).join("")
}

async function removeFriend(docName) {
  const endpoint = `https://firestore.googleapis.com/v1/${docName}?key=${API_KEY}`
  await fetch(endpoint, { method: "DELETE" })
  await loadFriends()
  load()
}

async function sendFriendRequest(toUid, toName) {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/friendRequests?key=${API_KEY}`
  await fetch(endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        fromUid:  { stringValue: MY_UID },
        fromName: { stringValue: MY_USER?.displayName || "" },
        toUid:    { stringValue: toUid },
        toName:   { stringValue: toName },
        status:   { stringValue: "pending" }
      }
    })
  })
}

/* ---------- FIRESTORE — FRIEND REQUESTS ---------- */

async function loadRequests() {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/friendRequests?key=${API_KEY}`
  const res  = await fetch(endpoint)
  if (!res.ok) return
  const json = await res.json()
  const docs = Array.isArray(json.documents) ? json.documents : []

  // Only show pending requests sent TO the current user
  const pending = docs.filter(doc => {
    const f = doc.fields || {}
    return f.toUid?.stringValue === MY_UID && f.status?.stringValue === "pending"
  }).map(doc => ({
    docName:  doc.name,
    fromUid:  doc.fields?.fromUid?.stringValue  || "",
    fromName: doc.fields?.fromName?.stringValue || "Someone"
  }))

  if (!pending.length) {
    requestsCard.style.display = "none"
    requestsList.innerHTML     = ""
    return
  }

  requestsCard.style.display = "block"
  requestsList.innerHTML = pending.map(r => `
    <div class="requestItem">
      <span><strong>${escapeHtml(r.fromName)}</strong> wants to be friends</span>
      <div class="requestActions">
        <button class="acceptBtn" data-doc="${escapeHtml(r.docName)}">Accept</button>
        <button class="declineBtn" data-doc="${escapeHtml(r.docName)}">Decline</button>
      </div>
    </div>
  `).join("")
}

async function respondToRequest(docName, accept) {
  if (accept) {
    // Update the status to accepted
    const endpoint = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=status&key=${API_KEY}`
    await fetch(endpoint, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { status: { stringValue: "accepted" } } })
    })
  } else {
    // Decline — just delete the request document
    await fetch(`https://firestore.googleapis.com/v1/${docName}?key=${API_KEY}`, { method: "DELETE" })
  }
  await loadFriends()
  await loadRequests()
  load()
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
  await fetch(endpoint, { method: "DELETE" })
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
  // Admin sees all posts; everyone else sees only their own + friends' posts
  const visible = MY_UID === ADMIN_UID
    ? posts
    : posts.filter(p => p.userId === MY_UID || MY_FRIENDS.includes(p.userId))

  if (!visible.length) {
    listEl.innerHTML = ""
    if (emptyEl) emptyEl.style.display = "block"
    return
  }

  if (emptyEl) emptyEl.style.display = "none"

  listEl.innerHTML = visible.map((p) => {
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

  visible.forEach(p => loadComments(docId(p.id)))
}

async function loadComments(postId) {
  const container = document.getElementById(`comments-${postId}`)
  if (!container) return
  const comments = await fetchComments(postId)
  if (!comments.length) { container.innerHTML = ""; return }
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

/* ---------- ADD FRIEND SEARCH ---------- */

addFriendBtn.addEventListener("click", () => {
  searchPanel.classList.toggle("open")
  if (searchPanel.classList.contains("open")) friendSearchInput.focus()
})

let searchTimeout = null
friendSearchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout)
  const query = friendSearchInput.value.trim()
  if (!query) { searchResults.innerHTML = ""; return }

  // Debounce — wait 400ms after typing stops before searching
  searchTimeout = setTimeout(async () => {
    const users = await searchUsers(query)
    if (!users.length) {
      searchResults.innerHTML = `<div class="emptyPanel">No users found</div>`
      return
    }
    searchResults.innerHTML = users.map(u => `
      <div class="searchResultItem">
        <span>${escapeHtml(u.displayName)}</span>
        <button class="sendRequestBtn"
                data-uid="${escapeHtml(u.uid)}"
                data-name="${escapeHtml(u.displayName)}"
                ${MY_FRIENDS.includes(u.uid) ? "disabled" : ""}>
          ${MY_FRIENDS.includes(u.uid) ? "Friends" : "Add"}
        </button>
      </div>
    `).join("")
  }, 400)
})

/* ---------- EVENT DELEGATION ---------- */

refreshBtn.addEventListener("click", async () => {
  await loadFriends()
  load()
  loadRequests()
})

// Left panel clicks — friend actions
document.addEventListener("click", async (e) => {

  // Send friend request
  const sendBtn = e.target.closest(".sendRequestBtn")
  if (sendBtn && !sendBtn.disabled) {
    sendBtn.disabled   = true
    sendBtn.textContent = "Sent"
    await sendFriendRequest(sendBtn.dataset.uid, sendBtn.dataset.name)
    return
  }

  // Accept request
  const acceptBtn = e.target.closest(".acceptBtn")
  if (acceptBtn) {
    await respondToRequest(acceptBtn.dataset.doc, true)
    return
  }

  // Decline request
  const declineBtn = e.target.closest(".declineBtn")
  if (declineBtn) {
    await respondToRequest(declineBtn.dataset.doc, false)
    return
  }

  // Remove friend
  const removeBtn = e.target.closest(".removeFriendBtn")
  if (removeBtn) {
    if (!confirm("Remove this friend?")) return
    await removeFriend(removeBtn.dataset.doc)
    return
  }
})

// Feed clicks — post and comment actions
listEl.addEventListener("click", async (e) => {

  const deleteBtn = e.target.closest(".deleteBtn")
  if (deleteBtn) {
    if (!confirm("Delete this post?")) return
    await deletePostByName(deleteBtn.dataset.doc)
    load()
    return
  }

  const commentDeleteBtn = e.target.closest(".commentDeleteBtn")
  if (commentDeleteBtn && MY_UID) {
    await deleteComment(commentDeleteBtn.dataset.comment)
    loadComments(commentDeleteBtn.dataset.post)
    return
  }

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

// Pause auto-refresh while typing a comment
let typingInComment = false
document.addEventListener("focusin",  (e) => { if (e.target.classList.contains("commentInput")) typingInComment = true  })
document.addEventListener("focusout", (e) => { if (e.target.classList.contains("commentInput")) typingInComment = false })

setInterval(async () => {
  if (typingInComment) return
  await loadFriends()
  load()
  loadRequests()
}, 10000)

init()