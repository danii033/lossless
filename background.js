chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "LOSSLESS_SHARE") return
  
    chrome.storage.local.get({ shares: [] }, (data) => {
      const shares = Array.isArray(data.shares) ? data.shares : []
      shares.unshift(msg.payload)
  
      chrome.storage.local.set({ shares }, () => {
        sendResponse({ ok: true, saved: msg.payload, count: shares.length })
      })
    })
  
    return true
  })
  
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message?.type !== "LOSSLESS_LOGIN") return
  
    chrome.storage.local.set({ losslessUser: message.user }, () => {
      sendResponse({ ok: true })
    })
  
    return true
  })
  