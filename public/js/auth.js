const FrotasysAuth = (() => {
  let client = null;
  let session = null;
  let profile = null;

  async function createAuthClient() {
    if (client) return client;
    const res = await fetch('/api/auth/config');
    const config = await res.json();
    // Configure SUPABASE_URL and SUPABASE_ANON_KEY in Render. Only anon key is used in the browser.
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return client;
  }

  function loginUrl() {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return `/login?next=${next}`;
  }

  async function refreshProfile() {
    const token = await getAccessToken();
    if (!token) return null;

    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;

    const data = await res.json();
    profile = data.profile;
    return data;
  }

  async function init({ requireAuth = true } = {}) {
    const auth = await createAuthClient();
    const result = await auth.auth.getSession();
    session = result.data.session;

    if (!session) {
      if (requireAuth) location.replace(loginUrl());
      return { session: null, profile: null };
    }

    const data = await refreshProfile();
    if (!data?.profile?.ativo) {
      await signOut(false);
      if (requireAuth) location.replace(loginUrl());
      return { session: null, profile: null };
    }

    return { session, profile };
  }

  async function signIn(email, password) {
    const auth = await createAuthClient();
    const result = await auth.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    session = result.data.session;
    return refreshProfile();
  }

  async function signOut(redirect = true) {
    const auth = await createAuthClient();
    await auth.auth.signOut();
    session = null;
    profile = null;
    if (redirect) location.replace('/login');
  }

  async function getAccessToken() {
    const auth = await createAuthClient();
    const result = await auth.auth.getSession();
    session = result.data.session;
    return session?.access_token || '';
  }

  function currentProfile() {
    return profile;
  }

  return { init, signIn, signOut, getAccessToken, currentProfile, refreshProfile };
})();
