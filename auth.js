const authConfig = window.CARING_CONFIG ?? {};
const authGate = document.querySelector('#auth-gate');
const workspace = document.querySelector('#workspace');
const signInForm = document.querySelector('#sign-in-form');
const passcodeInput = document.querySelector('#sign-in-passcode');
const authStatus = document.querySelector('#auth-status');
const signOutButton = document.querySelector('#sign-out-button');
let passcode = '';
// In-memory credential: refreshing or signing out locks the directory.
authConfig.getAccessToken = async () => passcode;
signInForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = signInForm.querySelector('button');
  button.disabled = true;
  authStatus.textContent = 'Checking passcode…';
  try {
    if (!authConfig.memberDirectoryUrl) throw new Error('Directory access is not configured.');
    const candidate = passcodeInput.value;
    const response = await fetch(authConfig.memberDirectoryUrl, {
      headers: { Authorization: 'Bearer ' + candidate }, cache: 'no-store',
    });
    if (response.status === 401) throw new Error('Incorrect passcode. Please try again.');
    if (!response.ok) throw new Error('Unable to unlock the directory. Please try again.');
    const directory = await response.json();
    passcode = candidate;
    passcodeInput.value = '';
    authGate.hidden = true;
    workspace.hidden = false;
    signOutButton.hidden = false;
    authStatus.textContent = '';
    window.dispatchEvent(new CustomEvent('caring-unlocked', { detail: directory }));
  } catch (error) {
    authStatus.textContent = error.message;
    passcodeInput.value = '';
    passcodeInput.focus();
  } finally { button.disabled = false; }
});
signOutButton.addEventListener('click', () => {
  passcode = '';
  workspace.hidden = true;
  window.location.reload();
});
