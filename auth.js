const authConfig = window.CARING_CONFIG ?? {};
const authGate = document.querySelector('#auth-gate');
const workspace = document.querySelector('#workspace');
const signInForm = document.querySelector('#sign-in-form');
const passcodeInput = document.querySelector('#sign-in-passcode');
const authStatus = document.querySelector('#auth-status');
const signOutButton = document.querySelector('#sign-out-button');
const SESSION_KEY = 'caring-session-v1';
let session = null;
function forgetSession() {
  session = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
}
function currentSession() {
  if (session && session.expiresAt <= Date.now()) {
    forgetSession();
    workspace.hidden = true;
    window.location.reload();
  }
  return session;
}
authConfig.getAccessToken = async () => currentSession()?.token ?? '';
async function unlock(credential) {
  if (!authConfig.memberDirectoryUrl) throw new Error('Directory access is not configured.');
  const response = await fetch(authConfig.memberDirectoryUrl, {
    headers: { Authorization: 'Bearer ' + credential }, cache: 'no-store',
  });
  if (response.status === 401) {
    forgetSession();
    throw new Error('Please enter the correct passcode to unlock the directory.');
  }
  if (!response.ok) throw new Error('Unable to unlock the directory. Please try again.');
  const directory = await response.json();
  if (!directory.session?.token || !Number.isFinite(directory.session.expiresAt)
      || directory.session.expiresAt <= Date.now()) throw new Error('Please try signing in again.');
  session = directory.session;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {
    // Access still works for this visit if browser storage is unavailable.
  }
  passcodeInput.value = '';
  authGate.hidden = true;
  workspace.hidden = false;
  signOutButton.hidden = false;
  authStatus.textContent = '';
  window.dispatchEvent(new CustomEvent('caring-unlocked', { detail: directory }));
}
signInForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = signInForm.querySelector('button');
  button.disabled = true;
  authStatus.textContent = 'Checking passcode…';
  try { await unlock(passcodeInput.value); }
  catch (error) {
    authStatus.textContent = error.message;
    passcodeInput.value = '';
    passcodeInput.focus();
  } finally { button.disabled = false; }
});
signOutButton.addEventListener('click', () => {
  forgetSession();
  workspace.hidden = true;
  window.location.reload();
});
window.addEventListener('storage', (event) => {
  if (event.key === SESSION_KEY && !event.newValue) {
    session = null;
    workspace.hidden = true;
    window.location.reload();
  }
});
setInterval(currentSession, 60_000);
// Both deferred scripts have installed their listeners before restoring access.
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const remembered = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    if (!remembered) return;
    if (typeof remembered.token !== 'string' || !Number.isFinite(remembered.expiresAt)
        || remembered.expiresAt <= Date.now()) { forgetSession(); return; }
    signInForm.querySelector('button').disabled = true;
    authStatus.textContent = 'Opening your directory…';
    await unlock(remembered.token);
  } catch (error) {
    authStatus.textContent = 'Unable to restore access. Reload to retry, or enter your passcode.';
  } finally { signInForm.querySelector('button').disabled = false; }
});
