const msgEl    = document.getElementById("msg")
const loginBtn = document.getElementById("loginBtn")
 
loginBtn.addEventListener("click", () => {
  msgEl.textContent = "Opening Google sign-in…"
  loginBtn.disabled = true
 
  // ---------------------------------------------------------------
  // To show the account picker, we first get a token silently
  // (interactive: false), revoke it so Chrome forgets it, then
  // request a fresh one interactively. This forces the account
  // chooser to appear every time the button is clicked.
  // ---------------------------------------------------------------
  chrome.identity.getAuthToken({ interactive: false }, (existingToken) => {
    // If there's a cached token, revoke it first
    if (existingToken) {
      chrome.identity.removeCachedAuthToken({ token: existingToken }, () => {
        // Also revoke it server-side so Google forgets the grant
        fetch("https://accounts.google.com/o/oauth2/revoke?token=" + existingToken)
          .finally(() => requestToken())
      })
    } else {
      requestToken()
    }
  })
})
 
function requestToken() {
  // Now request interactively and Chrome will show the account picker
  chrome.identity.getAuthToken({ interactive: true }, async (token) => {
    if (chrome.runtime.lastError || !token) {
      msgEl.textContent = "Sign-in failed: " + (chrome.runtime.lastError?.message || "no token")
      loginBtn.disabled = false
      return
    }
 
    try {
      // Fetch the user's profile from Google using the token
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
 
      await chrome.storage.local.set({ losslessUser: payload })
 
      msgEl.textContent      = `Logged in as ${payload.displayName}. You can close this tab.`
      loginBtn.style.display = "none"
 
    } catch (err) {
      msgEl.textContent = "Error: " + (err.message || "unknown")
      loginBtn.disabled = false
      console.error(err)
    }
  })
}
