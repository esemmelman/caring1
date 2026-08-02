const authConfig = window.CARING_CONFIG ?? {};
const authGate = document.querySelector('#auth-gate');
const workspace = document.querySelector('#workspace');
const signInForm = document.querySelector('#sign-in-form');
const signInEmail = document.querySelector('#sign-in-email');
const authStatus = document.querySelector('#auth-status');
const authEmail = document.querySelector('#auth-email');
const signOutButton = document.querySelector('#sign-out-button');

if (!window.supabase?.createClient
  || !authConfig.supabaseUrl
  || !authConfig.supabasePublishableKey) {
  authStatus.textContent = 'Sign-in is not configured. Please contact the site administrator.';
  signInForm.hidden = true;
  throw new Error('Supabase Auth configuration is missing.');
}

const authClient = window.supabase.createClient(
  authConfig.supabaseUrl,
  authConfig.supabasePublishableKey,
);
window.caringSupabase = authClient;

authConfig.getAccessToken = async () => {
  const { data, error } = await authClient.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? '';
};

function showSession(session) {
  const signedIn = Boolean(session);
  authGate.hidden = signedIn;
  workspace.hidden = !signedIn;
  authEmail.hidden = !signedIn;
  signOutButton.hidden = !signedIn;
  authEmail.textContent = session?.user?.email ?? '';
}

signInForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = signInForm.querySelector('button');
  submitButton.disabled = true;
  authStatus.textContent = 'Sending your secure link…';

  const { error } = await authClient.auth.signInWithOtp({
    email: signInEmail.value.trim(),
    options: {
      emailRedirectTo: authConfig.authRedirectUrl,
      shouldCreateUser: false,
    },
  });

  authStatus.textContent = error
    ? error.message
    : 'Check your email and open the sign-in link on this device.';
  submitButton.disabled = false;
});

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  const { error } = await authClient.auth.signOut();
  if (error) authStatus.textContent = error.message;
  signOutButton.disabled = false;
});

authClient.auth.onAuthStateChange((_event, session) => showSession(session));

authClient.auth.getSession().then(({ data, error }) => {
  if (error) authStatus.textContent = error.message;
  showSession(data.session);
});
