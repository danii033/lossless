const listEl = document.getElementById("list")
const statusEl = document.getElementById("status")
const refreshBtn = document.getElementById("refreshBtn")
const emptyEl = document.getElementById("emptyState")
const MY_UID = localStorage.getItem("lossless_uid") || ""
const loginBtn = document.getElementById("loginBtn")
const subtitleEl = document.querySelector(".subtitle")
const listWrapper = document.getElementById("list")


const PROJECT_ID = "loess-eecf3"
const API_KEY = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

if (loginBtn) {
    if (!MY_UID) {
      loginBtn.style.display = "inline-block"
    }
  
    loginBtn.addEventListener("click", () => {
      const EXT_ID = chrome.runtime?.id
      if (!EXT_ID) {
        alert("Extension ID not found")
        return
      }
  
      const url = `login.html?extId=${EXT_ID}`
      window.open(url, "_blank")
    })
  }

if (!MY_UID) {
    subtitleEl.textContent = "Log in to share and delete posts"
  } else {
    subtitleEl.textContent = "Your feed"
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
  const getStr = (k) => f?.[k]?.stringValue || ""
  const getTs = (k) => f?.[k]?.timestampValue || ""

  return {
    id: doc.name || "",
    userName: getStr("userName"),
    userId: getStr("userId"),
    track: getStr("track"),
    artist: getStr("artist"),
    service: getStr("service"),
    url: getStr("url"),
    createdAt: getTs("createdAt")
  }
}

async function fetchPosts() {
  const endpoint =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/posts?key=${API_KEY}`

  const res = await fetch(endpoint)
  if (!res.ok) throw new Error("Failed to load feed")

  const json = await res.json()
  const docs = Array.isArray(json.documents) ? json.documents : []
  const posts = docs.map(parseDoc)

  posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return posts
}

/* ADDED: delete helper */
async function deletePostByName(docName) {
  const endpoint = `https://firestore.googleapis.com/v1/${docName}?key=${API_KEY}`

  const res = await fetch(endpoint, { method: "DELETE" })
  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error("Delete failed " + txt)
  }
}

function render(posts) {
  if (!posts.length) {
    listEl.innerHTML = ""

    /* ADDED: empty state support */
    if (emptyEl) emptyEl.style.display = "block"

    setStatus("")
    return
  }

  /* ADDED: hide empty state */
  if (emptyEl) emptyEl.style.display = "none"

  setStatus("")
  listEl.innerHTML = posts
    .map((p) => {
      const canDelete = MY_UID && p.userId === MY_UID
      const userLabel = p.userName || p.userId || "Unknown user"
      const time = prettyTime(p.createdAt)
      const track = escapeHtml(p.track)
      const artist = escapeHtml(p.artist)
      const service = escapeHtml(p.service)
      const url = p.url || "#"

      /* ADDED: only show delete for your own posts */
      const deleteBtnHtml = canDelete
        ? `<button class="deleteBtn" data-doc="${escapeHtml(p.id)}">Delete</button>`
        : ""

      return `
        <div class="card">
          <div class="topline">
            <div class="user">${escapeHtml(userLabel)}</div>
            <div class="time">${escapeHtml(time)}</div>
          </div>

          <div class="track">${track}</div>
          <div class="row">
            <div class="meta">${artist ? artist : ""}</div>
            <div class="pill">${service}</div>
          </div>

          <div class="actions">
            <a class="link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open link</a>
            ${deleteBtnHtml}
          </div>
        </div>
      `
    })
    .join("")
}

async function load() {
  try {
    setStatus("Loading…")
    const posts = await fetchPosts()
    render(posts)
  } catch (e) {
    console.error(e)
    setStatus("Could not load feed. Make sure Firestore is enabled and in test mode for dev.")
  }
}

refreshBtn.addEventListener("click", load)

/* ADDED: click handler for delete buttons */
listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".deleteBtn")
  if (!btn) return

  const docName = btn.getAttribute("data-doc")
  if (!docName) return

  const ok = confirm("Delete this post?")
  if (!ok) return

  try {
    setStatus("Deleting…")
    await deletePostByName(docName)
    await load()
  } catch (err) {
    console.error(err)
    setStatus(String(err?.message || err))
  }
})

load()

setInterval(load, 10000)
