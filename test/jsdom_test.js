const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });
const { window } = dom;
// Provide a simple localStorage stub for JSDOM
window.localStorage = (() => {
  const store = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
  };
})();
// Expose a minimal navigator.clipboard for copying
window.navigator.clipboard = { writeText: (t) => Promise.resolve(t) };

// Load our app.js into DOM
const scriptContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
try {
  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = scriptContent;
  window.document.body.appendChild(scriptEl);
  // allow some time for async code
  setTimeout(() => {
    console.log('DOM scripts executed');
    if (window.document.querySelector('#btn-login')) console.log('btn-login present');
    // Simulate click to show login
    const btnLogin = window.document.querySelector('#btn-login');
    if (btnLogin) { btnLogin.click(); console.log('btnLogin clicked'); }
    // Simulate coach code sign-in with invalid code
    const form = window.document.querySelector('#quick-signin-form');
    if (form) {
      form.coachCode.value = 'INVALID';
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      console.log('Submitted quick signin');
    }
    setTimeout(() => {
      console.log('finished');
      process.exit(0);
    }, 200);
  }, 200);
} catch (e) { console.error('Error executing script', e); process.exit(1); }
