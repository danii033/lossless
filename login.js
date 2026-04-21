const msgEl    = document.getElementById("msg")
const loginBtn = document.getElementById("loginBtn")

const CLIENT_ID  = "582613352242-hdrf9s9ovggr1s71edgvkq5k425c76r0.apps.googleusercontent.com"
const PROJECT_ID = "loess-eecf3"
const API_KEY    = "AIzaSyD4HpKMkJwAFtIvst2XaEMa3L3oNnjfAoA"

loginBtn.addEventListener("click", () => {
  msgEl.textContent = "Opening Google sign-in…"
  loginBtn.disabled = true

  const redirectUrl = chrome.identity.getRedirectURL()
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.set("client_id",     CLIENT_ID)
  authUrl.searchParams.set("response_type", "token")
  authUrl.searchParams.set("redirect_uri",  redirectUrl)
  authUrl.searchParams.set("scope",         "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile")
  authUrl.searchParams.set("prompt",        "select_account")

  chrome.identity.launchWebAuthFlow(
    { url: authUrl.toString(), interactive: true },
    async (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        msgEl.textContent = "Sign-in failed: " + (chrome.runtime.lastError?.message || "cancelled")
        loginBtn.disabled = false
        return
      }

      const params = new URLSearchParams(new URL(responseUrl).hash.slice(1))
      const token  = params.get("access_token")

      if (!token) {
        msgEl.textContent = "Sign-in failed: no token returned"
        loginBtn.disabled = false
        return
      }

      try {
        const res  = await fetch(
          "https://www.googleapis.com/oauth2/v3/userinfo",
          { headers: { Authorization: "Bearer " + token } }
        )
        const info = await res.json()

        const payload = {
          uid:         info.sub,
          displayName: info.name  || "",
          email:       info.email || ""
        }

        // Save to chrome.storage.local for popup and feed to read
        await chrome.storage.local.set({ losslessUser: payload })

        // ---------------------------------------------------------------
        // Write the user's profile to Firestore users collection.
        // This uses the uid as the document ID (PATCH = create or update).
        // This is how other users can search for and find this person
        // by their display name when adding friends.
        // ---------------------------------------------------------------
        await fetch(
          `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${payload.uid}?key=${API_KEY}`,
          {
            method:  "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: {
                uid:         { stringValue: payload.uid },
                displayName: { stringValue: payload.displayName },
                email:       { stringValue: payload.email }
              }
            })
          }
        )

        msgEl.textContent      = `Logged in as ${payload.displayName}. Redirecting to feed…`
        loginBtn.style.display = "none"

        // Redirect to the feed page 5 seconds after successful login
        setTimeout(() => {
          window.location.href = chrome.runtime.getURL("feed.html")
        }, 5000)

      } catch (err) {
        msgEl.textContent = "Error: " + (err.message || "unknown")
        loginBtn.disabled = false
        console.error(err)
      }
    }
  )
})