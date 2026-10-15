// Bridge page: the Playwright test runner calls send(cmd, args); it forwards to the service worker via runtime messaging.
window.send = (cmd, args) => chrome.runtime.sendMessage({ cmd, args });
